import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/audit";
import { addToIndex, buildCandidate, buildIndex, composeNotes, defaultLabel, findMatch, mergePatch, patchChanges, sanitizeCandidate, type Index } from "./engine";
import { phoneKey } from "./phone";
import { clientFor, getConnection, isLive, setConnError } from "./google";
import { friendlyPeopleError, PeopleError, personToRaw, type PeopleClient } from "./people";
import type { Candidate, DupMode, Existing } from "./types";

type Actor = { id: string; name: string };

export const CHUNK_MAX = 150;
const SOURCES_OK = new Set(["WhatsApp", "Google Contatos", "Importação"]);
const DUP_OK = new Set(["pular", "completar", "mesclar"]);

/* ------------------------------ consulta de existentes ------------------------------ */

/** Variantes gravadas de um número (com e sem o 9º dígito). */
function phoneVariants(p: string | null | undefined): string[] {
  const k = phoneKey(p);
  if (!k) return [];
  if (k.startsWith("br")) {
    const ddd = k.slice(2, 4);
    const last8 = k.slice(4);
    return [`55${ddd}${last8}`, `55${ddd}9${last8}`];
  }
  return [k];
}

const toExisting = (r: typeof schema.contacts.$inferSelect): Existing => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  externalId: r.externalId,
  company: r.company,
  role: r.role,
  address: r.address,
  city: r.city,
  state: r.state,
  notes: r.notes,
  tags: r.tags,
});

const slices = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/** Contatos do CRM que podem coincidir com os candidatos (por telefone, e-mail ou id do Google). */
export async function loadExisting(cands: Candidate[]): Promise<Existing[]> {
  const phones = [...new Set(cands.flatMap((c) => [c.phone, ...c.extraPhones]).flatMap(phoneVariants))];
  const emails = [...new Set(cands.flatMap((c) => [c.email, ...c.extraEmails]).filter((x): x is string => !!x))];
  const exts = [...new Set(cands.map((c) => c.externalId).filter((x): x is string => !!x))];
  const found = new Map<string, Existing>();
  for (const s of slices(phones, 500)) for (const r of await db.select().from(schema.contacts).where(inArray(schema.contacts.phone, s))) found.set(r.id, toExisting(r));
  for (const s of slices(emails, 500)) {
    for (const r of await db.select().from(schema.contacts).where(inArray(sql`lower(${schema.contacts.email})`, s))) found.set(r.id, toExisting(r));
  }
  for (const s of slices(exts, 500)) for (const r of await db.select().from(schema.contacts).where(inArray(schema.contacts.externalId, s))) found.set(r.id, toExisting(r));
  return [...found.values()];
}

/** Para a prévia no navegador: devolve os contatos existentes que coincidem com um trecho da lista. */
export async function existingFor(items: Partial<Candidate>[]): Promise<Existing[]> {
  const cands = items.slice(0, 1000).map((c, i) => sanitizeCandidate(c, i));
  return loadExisting(cands);
}

/* ------------------------------ gravação ------------------------------ */

export type BatchOpts = { source: string; label: string; dupMode: DupMode; ownerId: string };
export type ChunkResult = { created: number; updated: number; skipped: number };

/** Núcleo idempotente: cria os novos, aplica a regra de duplicados nos que já existem. Repetir o mesmo trecho não duplica. */
export async function applyCandidates(batchId: string | null, opts: BatchOpts, input: Candidate[]): Promise<ChunkResult> {
  const res: ChunkResult = { created: 0, updated: 0, skipped: 0 };
  const existing = await loadExisting(input);
  const idx: Index = buildIndex(existing);
  const toCreate: { c: Candidate; row: typeof schema.contacts.$inferInsert }[] = [];
  const updates: { id: string; set: Record<string, unknown> }[] = [];

  for (const c of input) {
    const m = findMatch(idx, c);
    if (m) {
      const e = m.existing;
      if (e.id.startsWith("new:")) {
        res.skipped++; // repetido dentro do próprio lote
        continue;
      }
      const patch = mergePatch(e, c, opts.dupMode, opts.label);
      if (Object.keys(patch).length === 0) {
        res.skipped++;
        continue;
      }
      updates.push({ id: e.id, set: { ...patch, updatedAt: new Date() } });
      if (patchChanges(patch)) res.updated++;
      else res.skipped++; // só ligou ao Google (externalId)
      addToIndex(idx, { ...e, ...(patch as Partial<Existing>) }); // visão atualizada
      continue;
    }
    if (!c.phone && !c.email) {
      res.skipped++;
      continue;
    }
    const row: typeof schema.contacts.$inferInsert = {
      name: c.name,
      phone: c.phone,
      email: c.email,
      company: c.company,
      role: c.role,
      address: c.address,
      city: c.city,
      state: c.state,
      notes: composeNotes(c),
      source: opts.source,
      tags: [opts.label],
      ownerId: opts.ownerId,
      importBatchId: batchId,
      externalId: c.externalId ?? null,
    };
    toCreate.push({ c, row });
    addToIndex(idx, { id: `new:${toCreate.length}`, name: c.name, phone: c.phone, email: c.email, externalId: c.externalId ?? null, company: null, role: null, address: null, city: null, state: null, notes: null, tags: [] });
  }

  for (const s of slices(toCreate, 100)) {
    await db.insert(schema.contacts).values(s.map((x) => x.row));
    res.created += s.length;
  }
  for (const g of slices(updates, 8)) await Promise.all(g.map((u) => db.update(schema.contacts).set(u.set).where(eq(schema.contacts.id, u.id))));
  return res;
}

async function ownerOk(ownerId: string | null | undefined, fallback: string) {
  if (!ownerId) return fallback;
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.id, ownerId), eq(schema.users.active, true)));
  return u?.id ?? fallback;
}

export type StartInput = { kind: "google" | "arquivo" | "sincronizacao"; source: string; label: string; dupMode: string; ownerId?: string | null; total: number };

export async function startBatch(user: Actor, input: StartInput) {
  const source = SOURCES_OK.has(input.source) ? input.source : "Importação";
  const dupMode = (DUP_OK.has(input.dupMode) ? input.dupMode : "pular") as DupMode;
  const label = (input.label || defaultLabel(source)).trim().slice(0, 80);
  const [b] = await db
    .insert(schema.contactImports)
    .values({ userId: user.id, kind: input.kind, source, label, dupMode, total: Math.max(0, Math.min(50_000, Math.floor(input.total) || 0)) })
    .returning({ id: schema.contactImports.id });
  const ownerId = await ownerOk(input.ownerId, user.id);
  return { id: b.id, source, label, dupMode, ownerId };
}

async function getBatch(user: Actor & { canManage?: boolean }, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [b] = await db.select().from(schema.contactImports).where(eq(schema.contactImports.id, id));
  if (!b) return null;
  if (b.userId !== user.id && !user.canManage) return null;
  return b;
}

export async function importChunk(user: Actor, batchId: string, owner: string | null, items: Partial<Candidate>[]): Promise<ChunkResult | { error: string }> {
  const b = await getBatch(user, batchId);
  if (!b || b.userId !== user.id) return { error: "Importação não encontrada." };
  if (b.status !== "em_andamento") return { error: "Esta importação já foi encerrada." };
  if (items.length > CHUNK_MAX) return { error: "Trecho grande demais." };
  const cands = items.map((c, i) => sanitizeCandidate(c, i));
  const ownerId = await ownerOk(owner, user.id);
  const r = await applyCandidates(b.id, { source: b.source ?? "Importação", label: b.label, dupMode: b.dupMode as DupMode, ownerId }, cands);
  await db
    .update(schema.contactImports)
    .set({ created: sql`${schema.contactImports.created} + ${r.created}`, updated: sql`${schema.contactImports.updated} + ${r.updated}`, skipped: sql`${schema.contactImports.skipped} + ${r.skipped}` })
    .where(eq(schema.contactImports.id, b.id));
  return r;
}

export async function finishBatch(user: Actor, batchId: string, o: { syncToken?: string | null; pendingExternalIds?: string[] }) {
  const b = await getBatch(user, batchId);
  if (!b || b.userId !== user.id) return { error: "Importação não encontrada." };
  const [done] = await db
    .update(schema.contactImports)
    .set({ status: "concluido", finishedAt: new Date() })
    .where(and(eq(schema.contactImports.id, b.id), eq(schema.contactImports.status, "em_andamento")))
    .returning();
  const batch = done ?? b;
  if (b.kind === "google" || b.kind === "sincronizacao") {
    const conn = await getConnection(user.id);
    if (conn) {
      if (o.pendingExternalIds?.length) {
        for (const s of slices(o.pendingExternalIds.slice(0, 5000), 500)) {
          await db.delete(schema.contactPending).where(and(eq(schema.contactPending.connectionId, conn.id), inArray(schema.contactPending.externalId, s)));
        }
      }
      if (done) {
        await db
          .update(schema.contactConnections)
          .set({
            ...(o.syncToken ? { syncToken: o.syncToken } : {}),
            importedTotal: sql`${schema.contactConnections.importedTotal} + ${batch.created}`,
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.contactConnections.id, conn.id));
      }
    }
  }
  if (done) await audit(user, "contatos_importados", `Importou contatos (${batch.source}): ${batch.created} novos, ${batch.updated} atualizados, ${batch.skipped} ignorados — “${batch.label}”`, { entity: "contato", entityId: batch.id, meta: { kind: batch.kind, created: batch.created, updated: batch.updated, skipped: batch.skipped } });
  return { batch };
}

/** Desfaz o lote: remove só os contatos CRIADOS por ele e que ainda não têm negócio/histórico. Preexistentes nunca são tocados. */
export async function undoBatch(user: Actor & { canManage: boolean }, batchId: string) {
  const b = await getBatch(user, batchId);
  if (!b) return { error: "Importação não encontrada." };
  if (b.status === "desfeito") return { error: "Esta importação já foi desfeita." };
  const noLinks = ["deals", "activities", "tasks", "conversations", "events", "transactions", "documents"].map(
    (t) => sql`not exists (select 1 from ${sql.raw(t)} x where x.contact_id = ${schema.contacts.id})`,
  );
  const rows = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.importBatchId, b.id), ...noLinks));
  for (const s of slices(rows.map((r) => r.id), 500)) await db.delete(schema.contacts).where(inArray(schema.contacts.id, s));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.contacts).where(eq(schema.contacts.importBatchId, b.id));
  await db.update(schema.contactImports).set({ status: "desfeito", undoneAt: new Date(), undoneCount: rows.length }).where(eq(schema.contactImports.id, b.id));
  await audit(user, "contatos_importacao_desfeita", `Desfez a importação “${b.label}”: ${rows.length} removidos${n ? `, ${n} mantidos por já terem negócio ou histórico` : ""}`, { entity: "contato", entityId: b.id, meta: { removed: rows.length, kept: n } });
  return { removed: rows.length, kept: n };
}

/* ------------------------------ Google ------------------------------ */

export const scopeOf = (userId: string) => userId.slice(0, 8);

/** Uma página de contatos do Google, já normalizados. */
export async function googlePage(user: Actor, o: { pageToken?: string | null }) {
  const conn = await getConnection(user.id);
  if (!isLive(conn)) return { error: "O Google Contatos não está conectado." };
  try {
    const page = await clientFor(conn).listConnections({ pageToken: o.pageToken });
    const items: Candidate[] = [];
    for (const p of page.connections ?? []) {
      const raw = personToRaw(p, scopeOf(user.id));
      if (!raw || raw.deleted) continue;
      items.push(buildCandidate(raw, raw.externalId!));
    }
    return { items, nextPageToken: page.nextPageToken ?? null, syncToken: page.nextSyncToken ?? null };
  } catch (e) {
    const f = await setConnError(conn, e);
    return { error: f.message, kind: f.kind };
  }
}

export type SyncResult = { ok: boolean; skipped?: string; error?: string; kind?: string; fetched: number; created: number; updated: number; pending: number };

/** Sincronização incremental Google → CRM (mão única; nunca apaga nem escreve no Google). */
export async function syncConnection(connId: string, deps: { client?: PeopleClient } = {}): Promise<SyncResult> {
  const out: SyncResult = { ok: true, fetched: 0, created: 0, updated: 0, pending: 0 };
  const [conn] = await db.select().from(schema.contactConnections).where(eq(schema.contactConnections.id, connId));
  if (!isLive(conn)) return { ...out, ok: false, skipped: "desconectado" };
  if (!conn.syncToken) return { ...out, ok: false, skipped: "sem_importacao_inicial", error: "Faça primeiro a importação completa dos contatos." };
  const client = deps.client ?? clientFor(conn);
  const [owner] = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, conn.userId));
  if (!owner) return { ...out, ok: false, skipped: "sem_usuario" };

  const persons: Candidate[] = [];
  let token: string | null = conn.syncToken;
  let next: string | null = null;
  let newToken: string | null = null;
  let guard = 0;
  try {
    for (;;) {
      try {
        const page = await client.listConnections({ pageToken: next, syncToken: token });
        for (const p of page.connections ?? []) {
          const raw = personToRaw(p, scopeOf(conn.userId));
          if (!raw || raw.deleted) continue; // nunca apagamos nada no CRM
          persons.push(buildCandidate(raw, raw.externalId!));
        }
        next = page.nextPageToken ?? null;
        if (!next) {
          newToken = page.nextSyncToken ?? null;
          break;
        }
      } catch (e) {
        if (e instanceof PeopleError && e.kind === "sync_expirado" && token) {
          token = null; // o token vale 7 dias após a importação completa: recomeça a leitura completa (idempotente)
          next = null;
          persons.length = 0;
          if (++guard > 1) throw e;
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    const f = await setConnError(conn, e);
    return { ...out, ok: false, error: f.message, kind: f.kind };
  }
  out.fetched = persons.length;

  const existing = await loadExisting(persons);
  const idx = buildIndex(existing);
  const fresh: Candidate[] = [];
  const known: Candidate[] = [];
  for (const c of persons) (findMatch(idx, c) ? known : fresh).push(c);
  const importable = fresh.filter((c) => !c.nameGuessed && (c.phone || c.email));

  const label = defaultLabel("Google Contatos");
  if (known.length) {
    // alterados: só completa campos vazios (modo "completar"), sem criar lote
    const r = await applyCandidates(null, { source: "Google Contatos", label, dupMode: "completar", ownerId: owner.id }, known);
    out.updated += r.updated;
  }
  if (importable.length) {
    if (conn.autoMode === "direto") {
      const b = await startBatch(owner, { kind: "sincronizacao", source: "Google Contatos", label, dupMode: "pular", ownerId: owner.id, total: importable.length });
      for (const s of slices(importable, CHUNK_MAX)) {
        const r = await applyCandidates(b.id, { source: b.source, label: b.label, dupMode: "pular", ownerId: owner.id }, s);
        out.created += r.created;
      }
      await db.update(schema.contactImports).set({ created: out.created, status: "concluido", finishedAt: new Date() }).where(eq(schema.contactImports.id, b.id));
      await audit(owner, "contatos_sincronizados", `Sincronizou o Google Contatos: ${out.created} novos`, { entity: "contato", entityId: b.id });
    } else {
      for (const s of slices(importable, 200)) {
        await db
          .insert(schema.contactPending)
          .values(s.map((c) => ({ connectionId: conn.id, externalId: c.externalId!, payload: c })))
          .onConflictDoUpdate({ target: [schema.contactPending.connectionId, schema.contactPending.externalId], set: { payload: sql`excluded.payload` } });
        out.pending += s.length;
      }
    }
  }
  await db
    .update(schema.contactConnections)
    .set({ syncToken: newToken ?? conn.syncToken, status: "ativo", lastError: null, lastSyncAt: new Date(), importedTotal: sql`${schema.contactConnections.importedTotal} + ${out.created}`, updatedAt: new Date() })
    .where(eq(schema.contactConnections.id, conn.id));
  if (out.updated || out.created || out.pending) await audit(owner, "contatos_sincronizados", `Sincronizou o Google Contatos: ${out.created} novos, ${out.updated} atualizados, ${out.pending} aguardando confirmação`, { entity: "contato" });
  return out;
}

/** Sincroniza todas as conexões com sincronização automática ligada (rodada diária). */
export async function syncAllContacts() {
  const conns = await db.select({ id: schema.contactConnections.id }).from(schema.contactConnections).where(and(eq(schema.contactConnections.autoSync, true), eq(schema.contactConnections.status, "ativo")));
  let synced = 0;
  let failed = 0;
  for (const c of conns) {
    try {
      const r = await syncConnection(c.id);
      if (r.ok) synced++;
      else failed++;
    } catch (e) {
      failed++;
      console.error("[contatos/sync]", e instanceof Error ? e.message : "erro");
    }
  }
  return { connections: conns.length, synced, failed };
}

export async function listPending(userId: string): Promise<Candidate[]> {
  const conn = await getConnection(userId);
  if (!conn) return [];
  const rows = await db.select().from(schema.contactPending).where(eq(schema.contactPending.connectionId, conn.id)).limit(5000);
  return rows.map((r) => r.payload as Candidate);
}

export async function pendingCount(userId: string): Promise<number> {
  const conn = await getConnection(userId);
  if (!conn) return 0;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.contactPending).where(eq(schema.contactPending.connectionId, conn.id));
  return n;
}

export { friendlyPeopleError };
