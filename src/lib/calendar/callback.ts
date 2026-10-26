import "server-only";
import { NextResponse } from "next/server";
import { getUser, has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { redirectUriFor } from "@/lib/drive";
import { CAL_STATE_COOKIE, CAL_STATE_PREFIX, googleConfigured } from "./oauth";
import { exchangeCalendarCode, saveConnection } from "./service";

export const isCalendarState = (state: string | null) => !!state && state.startsWith(CAL_STATE_PREFIX);

/**
 * Retorno do OAuth do Google Agenda. Chega em /api/drive/callback (a URI de redirecionamento já autorizada no Google Cloud);
 * o `state` com prefixo "cal:" + o cookie próprio distinguem de uma conexão do Drive.
 */
export async function handleCalendarCallback(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/agenda?google=${q}`, url.origin));
    r.cookies.delete({ name: CAL_STATE_COOKIE, path: "/api" });
    return r;
  };
  const user = await getUser();
  if (!user || !has(user, "agenda")) return NextResponse.redirect(new URL("/?negado=1", url.origin));
  if (!googleConfigured()) return back("nao_configurado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // o ":" do prefixo "cal:" vai codificado (%3A) no cookie; sem decodificar o state nunca bate
  const rawCookie = request.headers.get("cookie")?.match(new RegExp(`${CAL_STATE_COOKIE}=([^;]+)`))?.[1];
  let cookie = rawCookie;
  try {
    cookie = rawCookie ? decodeURIComponent(rawCookie) : rawCookie;
  } catch {}
  if (!state || !cookie || cookie !== state) return back("estado");
  if (url.searchParams.get("error")) return back("negado");
  if (!code) return back("estado");

  try {
    const tokens = await exchangeCalendarCode(code, redirectUriFor(url.origin));
    const r = await saveConnection(user.id, tokens);
    if (!r.ok) return back(r.error === "escopo" ? "escopo" : "sem_refresh");
    await audit(user, "agenda_google_conectada", `Conectou o Google Agenda${r.email ? ` (${r.email})` : ""}`, { entity: "agenda" });
    return back("ok");
  } catch (e) {
    console.error("[calendar/callback]", e instanceof Error ? e.message : "erro");
    return back("troca");
  }
}
