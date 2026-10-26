import "server-only";
import crypto from "node:crypto";
import { googleConfig, googleConfigured } from "@/lib/drive/google";
import { GoogleApiError } from "./client";

/**
 * OAuth do Google Agenda. `calendar.app.created` é o escopo mais restrito: só enxerga as agendas secundárias criadas
 * pelo próprio app (a "Estúdio Restaura"), e cobre calendars.insert/get/delete, events.* e events.watch nelas.
 * A agenda principal e as pessoais do usuário ficam fora do alcance do app.
 */
export const CAL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.app.created"];
export const CAL_STATE_PREFIX = "cal:";
export const CAL_STATE_COOKIE = "cal_oauth_state";

export { googleConfigured };

export const newState = () => CAL_STATE_PREFIX + crypto.randomBytes(18).toString("base64url");

export function calendarAuthUrl(redirectUri: string, state: string, loginHint?: string | null) {
  const c = googleConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CAL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export type CalTokens = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<CalTokens> {
  const c = googleConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<CalTokens> & { error?: string };
  if (!res.ok || !json.access_token) {
    const reason = json.error ?? String(res.status);
    throw new GoogleApiError(res.status, reason, `Google recusou a autorização (${reason}).`, reason === "invalid_grant" ? "reautorizar" : "outro");
  }
  return json as CalTokens;
}

export const exchangeCalendarCode = (code: string, redirectUri: string) => tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
export const refreshAccessToken = (refreshToken: string) => tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

/** E-mail da conta Google (escopos openid + email). */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const j = (await res.json()) as { email?: string };
    return j.email ?? null;
  } catch {
    return null;
  }
}

/** Revoga o token no Google (melhor esforço). */
export async function revokeToken(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    /* ignora */
  }
}

export const hasCalendarScope = (scope: string | null | undefined) => (scope ?? "").split(/\s+/).includes("https://www.googleapis.com/auth/calendar.app.created");
