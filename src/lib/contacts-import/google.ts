import "server-only";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/drive/crypto";
import { googleConfig, googleConfigured } from "@/lib/drive/google";
import { exchangeCalendarCode, fetchGoogleEmail, refreshAccessToken, revokeToken, type CalTokens } from "@/lib/calendar/oauth";
import { createPeopleClient, friendlyPeopleError, PeopleError, type PeopleClient } from "./people";

/**
 * OAuth do Google Contatos (SOMENTE LEITURA). Mesmo padrão da Agenda: a URI de retorno é a já autorizada
 * (/api/drive/callback) e o `state` com prefixo "ppl:" + cookie próprio distinguem do Drive e da Agenda.
 * Escopo `contacts.readonly`: o app nunca escreve no Google (por isso a sincronização é de mão única).
 */
export const PPL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/contacts.readonly"];
export const PPL_STATE_PREFIX = "ppl:";
export const PPL_STATE_COOKIE = "ppl_oauth_state";

export { googleConfigured };

export const isContactsState = (state: string | null) => !!state && state.startsWith(PPL_STATE_PREFIX);
export const newContactsState = () => PPL_STATE_PREFIX + crypto.randomBytes(18).toString("base64url");
export const hasContactsScope = (scope: string | null | undefined) => (scope ?? "").split(/\s+/).includes("https://www.googleapis.com/auth/contacts.readonly");

export function contactsAuthUrl(redirectUri: string, state: string, loginHint?: string | null) {
  const c = googleConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: PPL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export const exchangeContactsCode = exchangeCalendarCode;

type Conn = typeof schema.contactConnections.$inferSelect;

export async function getConnection(userId: string): Promise<Conn | null> {
  const [c] = await db.select().from(schema.contactConnections).where(eq(schema.contactConnections.userId, userId)).limit(1);
  return c ?? null;
}
export const isLive = (c: Conn | null): c is Conn => !!c && c.status !== "desconectado" && !!c.refreshTokenEnc;

export type PublicContactsConnection = {
  connected: boolean;
  email: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  hasInitialImport: boolean;
  autoSync: boolean;
  autoMode: string;
  importedTotal: number;
  configured: boolean;
};
/** Dados seguros para a tela (nunca inclui tokens). */
export function publicInfo(c: Conn | null): PublicContactsConnection {
  const live = isLive(c);
  return {
    connected: live,
    email: live ? c.googleEmail : null,
    status: live ? c.status : "desconectado",
    lastError: live ? c.lastError : null,
    lastSyncAt: live && c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    hasInitialImport: live && !!c.syncToken,
    autoSync: live && c.autoSync,
    autoMode: c?.autoMode ?? "confirmar",
    importedTotal: c?.importedTotal ?? 0,
    configured: googleConfigured(),
  };
}

export async function saveConnection(userId: string, t: CalTokens): Promise<{ ok: true; email: string | null } | { ok: false; error: "escopo" | "sem_refresh" }> {
  if (!hasContactsScope(t.scope)) return { ok: false, error: "escopo" };
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
    syncToken: null, // nova autorização: nova importação completa
    updatedAt: new Date(),
  };
  if (old) await db.update(schema.contactConnections).set(values).where(eq(schema.contactConnections.id, old.id));
  else await db.insert(schema.contactConnections).values({ userId, ...values });
  return { ok: true, email };
}

export async function setConnError(c: Conn, e: unknown) {
  const f = friendlyPeopleError(e);
  const status = f.kind === "reautorizar" ? "reautorizar" : "erro";
  await db.update(schema.contactConnections).set({ status, lastError: f.message, updatedAt: new Date() }).where(eq(schema.contactConnections.id, c.id));
  return f;
}

/** Cliente da People API já autenticado (renova o token quando preciso). */
export function clientFor(c: Conn): PeopleClient {
  return createPeopleClient({
    getToken: async () => {
      if (c.accessTokenEnc && c.expiresAt && c.expiresAt.getTime() > Date.now() + 30_000) return decryptToken(c.accessTokenEnc);
      if (!c.refreshTokenEnc) throw new PeopleError(401, "invalid_grant", "sem refresh token", "reautorizar");
      let t;
      try {
        t = await refreshAccessToken(decryptToken(c.refreshTokenEnc));
      } catch (e) {
        const reason = e instanceof Error && /invalid_grant/.test(e.message) ? "invalid_grant" : "";
        throw new PeopleError(reason ? 401 : 500, reason, "falha ao renovar o token", reason ? "reautorizar" : "outro");
      }
      const expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000);
      const enc = encryptToken(t.access_token);
      await db.update(schema.contactConnections).set({ accessTokenEnc: enc, expiresAt, updatedAt: new Date() }).where(eq(schema.contactConnections.id, c.id));
      c.accessTokenEnc = enc;
      c.expiresAt = expiresAt;
      return t.access_token;
    },
  });
}

/** Desconecta: revoga no Google (melhor esforço), apaga os tokens e os pendentes. Os contatos já importados ficam. */
export async function disconnect(userId: string) {
  const c = await getConnection(userId);
  if (!c) return;
  try {
    if (c.refreshTokenEnc) await revokeToken(decryptToken(c.refreshTokenEnc));
  } catch {
    /* ignora */
  }
  await db.delete(schema.contactPending).where(eq(schema.contactPending.connectionId, c.id));
  await db
    .update(schema.contactConnections)
    .set({ status: "desconectado", accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null, syncToken: null, autoSync: false, lastError: null, updatedAt: new Date() })
    .where(eq(schema.contactConnections.id, c.id));
}
