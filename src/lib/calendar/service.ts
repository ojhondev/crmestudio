import "server-only";
import crypto from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/drive/crypto";
import { createCalendarClient, friendlyError, GoogleApiError, type CalendarClient } from "./client";
import { CAL_NAME, contentOfCrm, contentOfGoogle, decide, fromGoogle, googleIdFor, hashContent, parseEmails, toGoogle, TZ, type GEvent } from "./map";
import { exchangeCalendarCode, fetchGoogleEmail, hasCalendarScope, refreshAccessToken, revokeToken, type CalTokens } from "./oauth";
import { pullChanges } from "./pull";

type Conn = typeof schema.calendarConnections.$inferSelect;
type Ev = typeof schema.events.$inferSelect;
type Link = typeof schema.calendarEventLinks.$inferSelect;

const APP_URL = () => process.env.APP_URL || "https://crm.estudiorestaura.com.br";
const PUSH_WINDOW_DAYS = 60;
const PUSH_BATCH = 120;
const LOCK_MS = 2 * 60_000;

/* ------------------------------ conexão ------------------------------ */

export async function getConnection(userId: string): Promise<Conn | null> {
  const [c] = await db.select().from(schema.calendarConnections).where(eq(schema.calendarConnections.userId, userId)).limit(1);
  return c ?? null;
}

export const isLive = (c: Conn | null): c is Conn => !!c && c.status !== "desconectado" && !!c.refreshTokenEnc;

/** Dados seguros para a tela (nunca inclui tokens). */
export type PublicConnection = {
  connected: boolean;
  email: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  syncTypes: string[] | null;
  hasCalendar: boolean;
  realtime: boolean;
};
export function publicInfo(c: Conn | null): PublicConnection {
  const live = isLive(c);
  return {
    connected: live,
    email: live ? c.googleEmail : null,
    status: live ? c.status : "desconectado",
    lastError: live ? c.lastError : null,
    lastSyncAt: live && c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    syncTypes: live ? c.syncTypes : null,
    hasCalendar: live && !!c.calendarId,
    realtime: live && !!c.channelExpiresAt && c.channelExpiresAt.getTime() > Date.now(),
  };
}

/** Conclui o OAuth: guarda os tokens (criptografados) e prepara a conexão da pessoa. */
export async function saveConnection(userId: string, t: CalTokens): Promise<{ ok: true; email: string | null } | { ok: false; error: "escopo" | "sem_refresh" }> {
  if (!hasCalendarScope(t.scope)) return { ok: false, error: "escopo" };
  const old = await getConnection(userId);
  const refresh = t.refresh_token ? encryptToken(t.refresh_token) : old?.refreshTokenEnc;
  if (!refresh) return { ok: false, error: "sem_refresh" };
  const email = await fetchGoogleEmail(t.access_token);
  const values = {
    googleEmail: email ?? old?.googleEmail ?? null,
    accessTokenEnc: encryptToken(t.access_token),
    refreshTokenEnc: refresh,
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope ?? null,
    status: "ativo",
    lastError: null,
    syncToken: null, // nova autorização: sincronização completa
    updatedAt: new Date(),
  };
  if (old) await db.update(schema.calendarConnections).set(values).where(eq(schema.calendarConnections.id, old.id));
  else await db.insert(schema.calendarConnections).values({ userId, ...values });
  return { ok: true, email };
}

export { exchangeCalendarCode };

async function setError(c: Conn, e: unknown) {
  const f = friendlyError(e);
  const status = f.kind === "reautorizar" ? "reautorizar" : "erro";
  await db.update(schema.calendarConnections).set({ status, lastError: f.message, updatedAt: new Date() }).where(eq(schema.calendarConnections.id, c.id));
  return f;
}

/** Cliente do Google já autenticado para a conexão (renova o token quando preciso). */
export function clientFor(c: Conn): CalendarClient {
  return createCalendarClient({
    getToken: async () => {
      if (c.accessTokenEnc && c.expiresAt && c.expiresAt.getTime() > Date.now() + 30_000) return decryptToken(c.accessTokenEnc);
      if (!c.refreshTokenEnc) throw new GoogleApiError(401, "invalid_grant", "sem refresh token", "reautorizar");
      const t = await refreshAccessToken(decryptToken(c.refreshTokenEnc));
      const expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000);
      await db
        .update(schema.calendarConnections)
        .set({ accessTokenEnc: encryptToken(t.access_token), expiresAt, updatedAt: new Date() })
        .where(eq(schema.calendarConnections.id, c.id));
      c.accessTokenEnc = encryptToken(t.access_token);
      c.expiresAt = expiresAt;
      return t.access_token;
    },
  });
}

/** Garante a agenda secundária "Estúdio Restaura" (reaproveita a que já existe; recria se sumiu). */
async function ensureCalendar(c: Conn, client: CalendarClient): Promise<string> {
  if (c.calendarId) {
    try {
      await client.getCalendar(c.calendarId);
      return c.calendarId;
    } catch (e) {
      if (!(e instanceof GoogleApiError) || !["nao_encontrado", "sem_permissao"].includes(e.kind)) throw e;
      // a agenda não existe nesta conta (foi apagada ou a conta mudou): recomeça do zero
      await db.delete(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.connectionId, c.id));
      c.syncToken = null;
    }
  }
  const cal = await client.insertCalendar(CAL_NAME, TZ);
  await db.update(schema.calendarConnections).set({ calendarId: cal.id, syncToken: null, updatedAt: new Date() }).where(eq(schema.calendarConnections.id, c.id));
  c.calendarId = cal.id;
  c.syncToken = null;
  return cal.id;
}

/* ------------------------------ CRM → Google ------------------------------ */

const typeAllowed = (c: Conn, type: string) => !c.syncTypes || c.syncTypes.length === 0 || c.syncTypes.includes(type);
const eligible = (c: Conn, e: Ev) => e.userId === c.userId && !e.cancelledAt && typeAllowed(c, e.type);

async function guestsOf(e: Ev) {
  let contactEmail: string | null = null;
  if (e.contactId) {
    const [ct] = await db.select({ email: schema.contacts.email }).from(schema.contacts).where(eq(schema.contacts.id, e.contactId));
    contactEmail = ct?.email ?? null;
  }
  return parseEmails(contactEmail, e.guestEmails);
}

async function saveLink(c: Conn, e: Ev, g: GEvent, hash: string) {
  const values = {
    googleEventId: g.id,
    etag: g.etag ?? null,
    googleUpdated: g.updated ? new Date(g.updated) : null,
    contentHash: hash,
    syncedAt: new Date(),
  };
  await db
    .insert(schema.calendarEventLinks)
    .values({ connectionId: c.id, eventId: e.id, ...values })
    .onConflictDoUpdate({ target: [schema.calendarEventLinks.connectionId, schema.calendarEventLinks.eventId], set: values });
  if (g.hangoutLink && g.hangoutLink !== e.meetUrl) await db.update(schema.events).set({ meetUrl: g.hangoutLink }).where(eq(schema.events.id, e.id));
}

/** Cria ou atualiza o evento do CRM na agenda Google (idempotente: o id no Google é derivado do id do CRM). */
async function pushOne(c: Conn, client: CalendarClient, calendarId: string, e: Ev, link: Link | null): Promise<GEvent> {
  const guests = e.inviteGuests ? await guestsOf(e) : [];
  const hasMeet = !!e.meetUrl;
  const send = e.inviteGuests && guests.length > 0;
  const conference = e.meet && !hasMeet && !e.allDay;
  const hash = hashContent(contentOfCrm(e));
  let g: GEvent;
  if (link) {
    try {
      g = await client.patchEvent(calendarId, link.googleEventId, toGoogle(e, { create: false, guests, hasMeet }), { conference, sendUpdates: send });
    } catch (err) {
      if (!(err instanceof GoogleApiError) || err.kind !== "nao_encontrado") throw err;
      g = await client.insertEvent(calendarId, toGoogle(e, { create: true, guests, hasMeet }), { conference, sendUpdates: send });
    }
  } else {
    try {
      g = await client.insertEvent(calendarId, toGoogle(e, { create: true, guests, hasMeet }), { conference, sendUpdates: send });
    } catch (err) {
      if (!(err instanceof GoogleApiError) || err.kind !== "conflito") throw err;
      // já existe (envio repetido) ou foi apagado antes: reativa e atualiza em vez de duplicar
      g = await client.patchEvent(calendarId, googleIdFor(e.id), toGoogle(e, { create: false, guests, hasMeet }), { conference, sendUpdates: send });
    }
  }
  await saveLink(c, e, g, hash);
  return g;
}

async function unlinkOne(c: Conn, client: CalendarClient, calendarId: string | null, link: Link, notify = false) {
  if (calendarId) await client.deleteEvent(calendarId, link.googleEventId, notify);
  await db.delete(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.id, link.id));
}

/** Empurra um evento (criado/editado) para todas as conexões que precisam dele. Nunca lança erro. */
export async function pushEvent(eventId: string): Promise<void> {
  try {
    const [e] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
    if (!e) return;
    const links = await db.select().from(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.eventId, eventId));
    const conns = await db
      .select()
      .from(schema.calendarConnections)
      .where(and(ne(schema.calendarConnections.status, "desconectado"), or(e.userId ? eq(schema.calendarConnections.userId, e.userId) : undefined, inArray(schema.calendarConnections.id, links.length ? links.map((l) => l.connectionId) : ["00000000-0000-0000-0000-000000000000"]))));
    for (const c of conns) {
      if (!c.refreshTokenEnc) continue;
      const link = links.find((l) => l.connectionId === c.id) ?? null;
      try {
        const client = clientFor(c);
        const calendarId = await ensureCalendar(c, client);
        if (eligible(c, e)) await pushOne(c, client, calendarId, e, link);
        else if (link) await unlinkOne(c, client, calendarId, link, e.inviteGuests);
        if (c.status === "erro") await db.update(schema.calendarConnections).set({ status: "ativo", lastError: null }).where(eq(schema.calendarConnections.id, c.id));
      } catch (err) {
        await setError(c, err);
      }
    }
  } catch (err) {
    console.error("[calendar] push", err instanceof Error ? err.message : "erro");
  }
}

/** Antes de apagar um evento do CRM: apaga o espelho no Google (melhor esforço). */
export async function removeEventEverywhere(eventId: string): Promise<void> {
  try {
    const rows = await db
      .select({ link: schema.calendarEventLinks, conn: schema.calendarConnections, inv: schema.events.inviteGuests })
      .from(schema.calendarEventLinks)
      .innerJoin(schema.calendarConnections, eq(schema.calendarEventLinks.connectionId, schema.calendarConnections.id))
      .innerJoin(schema.events, eq(schema.calendarEventLinks.eventId, schema.events.id))
      .where(eq(schema.calendarEventLinks.eventId, eventId));
    for (const r of rows) {
      if (!r.conn.calendarId || r.conn.status === "desconectado" || !r.conn.refreshTokenEnc) continue;
      try {
        await clientFor(r.conn).deleteEvent(r.conn.calendarId, r.link.googleEventId, r.inv);
      } catch (err) {
        await setError(r.conn, err);
      }
    }
  } catch (err) {
    console.error("[calendar] remover", err instanceof Error ? err.message : "erro");
  }
}

/* ------------------------------ Google → CRM ------------------------------ */

type PullStats = { created: number; updated: number; cancelled: number; pushed: number; removed: number };

async function applyGoogleEvent(c: Conn, client: CalendarClient, calendarId: string, g: GEvent, stats: PullStats) {
  const [link] = await db
    .select()
    .from(schema.calendarEventLinks)
    .where(and(eq(schema.calendarEventLinks.connectionId, c.id), eq(schema.calendarEventLinks.googleEventId, g.id)))
    .limit(1);

  if (g.status === "cancelled") {
    if (!link) return;
    const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, link.eventId));
    await db.delete(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.id, link.id));
    // apagado no Google: o CRM só marca como cancelado (nunca apaga o registro)
    if (ev && !ev.cancelledAt) {
      await db.update(schema.events).set({ cancelledAt: new Date(), updatedAt: new Date() }).where(eq(schema.events.id, ev.id));
      stats.cancelled++;
    }
    return;
  }

  const fields = fromGoogle(g);
  const gContent = contentOfGoogle(g);
  if (!fields || !gContent) return;
  const gHash = hashContent(gContent);
  const gUpdated = g.updated ? new Date(g.updated) : new Date();
  const crmIdHint = g.extendedProperties?.private?.crmEventId;

  let ev: Ev | undefined;
  let linkHash: string | null = link?.contentHash ?? null;

  if (link) {
    if (g.etag && g.etag === link.etag) return; // nada mudou no Google (inclui o eco do que acabamos de enviar)
    [ev] = await db.select().from(schema.events).where(eq(schema.events.id, link.eventId));
    if (!ev) {
      await db.delete(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.id, link.id));
      return;
    }
  } else if (crmIdHint) {
    [ev] = await db.select().from(schema.events).where(eq(schema.events.id, crmIdHint)).limit(1);
    if (!ev) {
      // o evento do CRM foi apagado e o espelho sobrou no Google (falha antiga): limpa lá
      await client.deleteEvent(calendarId, g.id);
      stats.removed++;
      return;
    }
    if (ev.userId !== c.userId) return; // pertence a outra pessoa: não mexe
    linkHash = ""; // elo perdido: "os dois mudaram" → vale o último a alterar
  } else {
    // evento novo criado direto no Google → vira evento do CRM (origem google)
    const type = ["reuniao", "visita", "obra", "prazo", "outro"].includes(g.extendedProperties?.private?.crmType ?? "") ? g.extendedProperties!.private!.crmType : "reuniao";
    const [created] = await db
      .insert(schema.events)
      .values({ ...fields, type, userId: c.userId, origin: "google", meetUrl: g.hangoutLink ?? null, updatedAt: gUpdated })
      .returning();
    const ins = await db
      .insert(schema.calendarEventLinks)
      .values({ connectionId: c.id, eventId: created.id, googleEventId: g.id, etag: g.etag ?? null, googleUpdated: gUpdated, contentHash: gHash })
      .onConflictDoNothing()
      .returning({ id: schema.calendarEventLinks.id });
    if (!ins.length) {
      await db.delete(schema.events).where(eq(schema.events.id, created.id)); // outra rodada já importou este evento
      return;
    }
    stats.created++;
    // marca o evento no Google com o id do CRM, para nunca importar duas vezes (ex.: depois de reconectar)
    await client
      .patchEvent(calendarId, g.id, { extendedProperties: { private: { crmEventId: created.id, crmType: type } } })
      .then(async (p) => {
        await db.update(schema.calendarEventLinks).set({ etag: p.etag ?? g.etag ?? null }).where(eq(schema.calendarEventLinks.eventId, created.id));
      })
      .catch(() => undefined);
    return;
  }

  const crmHash = hashContent(contentOfCrm(ev));
  const d = decide({ linkHash: linkHash ?? "", crmHash, googleHash: gHash, crmUpdatedMs: ev.updatedAt.getTime(), googleUpdatedMs: gUpdated.getTime() });

  if (d.action === "pull") {
    await db
      .update(schema.events)
      .set({ ...fields, cancelledAt: null, meetUrl: g.hangoutLink ?? ev.meetUrl, updatedAt: gUpdated })
      .where(eq(schema.events.id, ev.id));
    await saveLink(c, { ...ev, ...fields }, g, d.linkHash);
    stats.updated++;
  } else if (d.action === "push") {
    if (eligible(c, ev)) {
      await pushOne(c, client, calendarId, ev, link ?? null);
      stats.pushed++;
    }
  } else {
    await saveLink(c, ev, g, d.linkHash);
  }
}

/* ------------------------------ rodada completa ------------------------------ */

export type SyncSummary = PullStats & { ok: boolean; error?: string; kind?: string; skipped?: "ocupado" | "desconectado"; fullResync?: boolean };

async function lock(c: Conn) {
  const now = new Date();
  const got = await db
    .update(schema.calendarConnections)
    .set({ lockedUntil: new Date(now.getTime() + LOCK_MS) })
    .where(and(eq(schema.calendarConnections.id, c.id), or(isNull(schema.calendarConnections.lockedUntil), lt(schema.calendarConnections.lockedUntil, now))))
    .returning({ id: schema.calendarConnections.id });
  return got.length > 0;
}

/** Sincroniza uma conexão nos dois sentidos. Segura contra execuções simultâneas (trava de 2 min). */
export async function syncConnection(connectionId: string, opts: { deadlineMs?: number } = {}): Promise<SyncSummary> {
  const stats: SyncSummary = { ok: true, created: 0, updated: 0, cancelled: 0, pushed: 0, removed: 0 };
  const [c] = await db.select().from(schema.calendarConnections).where(eq(schema.calendarConnections.id, connectionId));
  if (!isLive(c)) return { ...stats, ok: false, skipped: "desconectado" };
  if (!(await lock(c))) return { ...stats, ok: false, skipped: "ocupado" };
  const deadline = Date.now() + (opts.deadlineMs ?? 45_000);
  try {
    const client = clientFor(c);
    const calendarId = await ensureCalendar(c, client);

    // 1) Google → CRM
    const pulled = await pullChanges(client, calendarId, c.syncToken);
    stats.fullResync = pulled.fullResync;
    for (const g of pulled.events) {
      if (Date.now() > deadline) throw new Error("tempo esgotado");
      await applyGoogleEvent(c, client, calendarId, g, stats);
    }
    if (pulled.nextSyncToken) await db.update(schema.calendarConnections).set({ syncToken: pulled.nextSyncToken }).where(eq(schema.calendarConnections.id, c.id));

    // 2) CRM → Google: eventos novos/alterados da pessoa e retirada dos que deixaram de valer
    const since = new Date(Date.now() - PUSH_WINDOW_DAYS * 864e5);
    const mine = await db
      .select({ ev: schema.events, link: schema.calendarEventLinks })
      .from(schema.events)
      .leftJoin(schema.calendarEventLinks, and(eq(schema.calendarEventLinks.eventId, schema.events.id), eq(schema.calendarEventLinks.connectionId, c.id)))
      .where(and(eq(schema.events.userId, c.userId), isNull(schema.events.cancelledAt), gte(schema.events.endsAt, since)))
      .orderBy(asc(schema.events.startsAt));
    let sent = 0;
    for (const { ev, link } of mine) {
      if (!typeAllowed(c, ev.type)) continue;
      if (link && link.contentHash === hashContent(contentOfCrm(ev))) continue;
      if (sent >= PUSH_BATCH || Date.now() > deadline) break;
      await pushOne(c, client, calendarId, ev, link ?? null);
      sent++;
      stats.pushed++;
    }
    const stale = await db
      .select({ link: schema.calendarEventLinks, ev: schema.events })
      .from(schema.calendarEventLinks)
      .innerJoin(schema.events, eq(schema.calendarEventLinks.eventId, schema.events.id))
      .where(eq(schema.calendarEventLinks.connectionId, c.id));
    for (const { link, ev } of stale) {
      if (eligible(c, ev) || Date.now() > deadline) continue;
      await unlinkOne(c, client, calendarId, link, false);
      stats.removed++;
    }

    await ensureWatch(c, client, calendarId).catch((e) => console.warn("[calendar] watch", e instanceof Error ? e.message : "erro"));
    await db
      .update(schema.calendarConnections)
      .set({ status: "ativo", lastError: null, lastSyncAt: new Date(), lockedUntil: null, updatedAt: new Date() })
      .where(eq(schema.calendarConnections.id, c.id));
    return stats;
  } catch (e) {
    const f = await setError(c, e);
    await db.update(schema.calendarConnections).set({ lockedUntil: null }).where(eq(schema.calendarConnections.id, c.id));
    return { ...stats, ok: false, error: f.message, kind: f.kind };
  }
}

/** Sincroniza todas as conexões ativas (cron do GitHub Actions / Vercel), dentro de um orçamento de tempo. */
export async function syncAll(budgetMs = 50_000) {
  const end = Date.now() + budgetMs;
  const conns = await db
    .select({ id: schema.calendarConnections.id })
    .from(schema.calendarConnections)
    .where(inArray(schema.calendarConnections.status, ["ativo", "erro"]))
    .orderBy(sql`${schema.calendarConnections.lastSyncAt} asc nulls first`);
  const out = { total: conns.length, done: 0, failed: 0, busy: 0, pending: 0 };
  for (const [i, c] of conns.entries()) {
    if (Date.now() > end - 4000) {
      out.pending = conns.length - i;
      break;
    }
    const r = await syncConnection(c.id, { deadlineMs: Math.max(5000, end - Date.now() - 2000) });
    if (r.skipped === "ocupado") out.busy++;
    else if (r.ok) out.done++;
    else out.failed++;
  }
  return out;
}

/* ------------------------------ canal de push (webhook) ------------------------------ */

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const watchEnabled = () => process.env.VERCEL_ENV === "production" || !!process.env.CALENDAR_WEBHOOK_URL;

async function ensureWatch(c: Conn, client: CalendarClient, calendarId: string) {
  if (!watchEnabled()) return;
  const soon = Date.now() + 36 * 3600_000;
  if (c.channelId && c.channelExpiresAt && c.channelExpiresAt.getTime() > soon) return;
  if (c.channelId && c.channelResourceId) await client.stopChannel(c.channelId, c.channelResourceId);
  const token = crypto.randomBytes(24).toString("base64url");
  const id = crypto.randomUUID();
  const address = process.env.CALENDAR_WEBHOOK_URL || `${APP_URL()}/api/calendar/webhook`;
  try {
    const w = await client.watch(calendarId, { id, address, token, ttlSeconds: 7 * 86400 });
    await db
      .update(schema.calendarConnections)
      .set({ channelId: id, channelResourceId: w.resourceId, channelTokenHash: sha(token), channelExpiresAt: w.expiration ? new Date(Number(w.expiration)) : new Date(Date.now() + 6 * 86400_000) })
      .where(eq(schema.calendarConnections.id, c.id));
  } catch (e) {
    // domínio não verificado no Google Cloud etc.: segue só com sincronização periódica
    await db.update(schema.calendarConnections).set({ channelId: null, channelResourceId: null, channelTokenHash: null, channelExpiresAt: null }).where(eq(schema.calendarConnections.id, c.id));
    throw e;
  }
}

/** Valida a notificação do Google (id do canal + token secreto) e devolve a conexão. */
export async function connectionForChannel(channelId: string | null, token: string | null): Promise<Conn | null> {
  if (!channelId || !token) return null;
  const [c] = await db.select().from(schema.calendarConnections).where(eq(schema.calendarConnections.channelId, channelId)).limit(1);
  if (!c?.channelTokenHash) return null;
  const a = Buffer.from(c.channelTokenHash);
  const b = Buffer.from(sha(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? c : null;
}

/* ------------------------------ desconectar ------------------------------ */

/** Para de sincronizar. `removeEvents`: apaga do Google os eventos criados pelo CRM; senão eles ficam lá. */
export async function disconnect(userId: string, removeEvents: boolean): Promise<{ removed: number }> {
  const c = await getConnection(userId);
  if (!c) return { removed: 0 };
  let removed = 0;
  const client = isLive(c) ? clientFor(c) : null;
  if (client && c.channelId && c.channelResourceId) await client.stopChannel(c.channelId, c.channelResourceId);
  if (client && removeEvents && c.calendarId) {
    const links = await db.select().from(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.connectionId, c.id));
    const end = Date.now() + 40_000;
    for (const l of links) {
      if (Date.now() > end) break;
      try {
        await client.deleteEvent(c.calendarId, l.googleEventId);
        await db.delete(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.id, l.id));
        removed++;
      } catch {
        /* segue com os próximos */
      }
    }
  }
  if (c.refreshTokenEnc) await revokeToken(decryptToken(c.refreshTokenEnc));
  // a linha fica (sem tokens) para reaproveitar a agenda "Estúdio Restaura" ao reconectar
  await db
    .update(schema.calendarConnections)
    .set({
      status: "desconectado",
      accessTokenEnc: null,
      refreshTokenEnc: null,
      expiresAt: null,
      syncToken: null,
      channelId: null,
      channelResourceId: null,
      channelTokenHash: null,
      channelExpiresAt: null,
      lastError: null,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.calendarConnections.id, c.id));
  return { removed };
}
