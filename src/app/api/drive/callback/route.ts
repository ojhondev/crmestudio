import { NextResponse } from "next/server";
import { getUser, has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exchangeCode, fetchAccountEmail, googleConfigured, saveConnection } from "@/lib/drive/google";
import { redirectUriFor } from "@/lib/drive";
import { handleCalendarCallback, isCalendarState } from "@/lib/calendar/callback";

/**
 * Retorno do Google: troca o código por tokens e guarda criptografados.
 * Esta é também a URI de retorno do Google Agenda (já autorizada no Google Cloud): um `state` com prefixo "cal:" é
 * desviado para o fluxo da Agenda; qualquer outro segue exatamente o fluxo do Drive.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (isCalendarState(url.searchParams.get("state"))) return handleCalendarCallback(request);
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/drive/conexao?${q}`, url.origin));
    r.cookies.delete({ name: "drive_oauth_state", path: "/api/drive" });
    return r;
  };
  const user = await getUser();
  if (!user || !has(user, "drive", "manage")) return NextResponse.redirect(new URL("/?negado=1", url.origin));
  if (!googleConfigured()) return back("erro=nao_configurado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("cookie")?.match(/drive_oauth_state=([^;]+)/)?.[1];
  if (url.searchParams.get("error")) return back("erro=negado");
  if (!code || !state || !cookie || cookie !== state) return back("erro=estado");

  try {
    const tokens = await exchangeCode(code, redirectUriFor(url.origin));
    const email = await fetchAccountEmail(tokens.access_token);
    await saveConnection(tokens, user.id, email);
    await audit(user, "drive_conectado", `Conectou o Google Drive${email ? ` (${email})` : ""}`, { entity: "drive" });
    return back("ok=1");
  } catch (e) {
    console.error("[drive/callback]", e);
    return back("erro=troca");
  }
}
