import "server-only";
import { NextResponse } from "next/server";
import { getUser, has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { redirectUriFor } from "@/lib/drive";
import { exchangeContactsCode, googleConfigured, PPL_STATE_COOKIE, saveConnection } from "./google";
import { cookieMatchesState } from "./state";

export { isContactsState } from "./google";

/**
 * Retorno do OAuth do Google Contatos. Chega em /api/drive/callback (URI já autorizada no Google Cloud);
 * o `state` com prefixo "ppl:" + o cookie próprio distinguem de Drive e Agenda.
 */
export async function handleContactsCallback(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/contatos/importar?google=${q}`, url.origin));
    r.cookies.delete({ name: PPL_STATE_COOKIE, path: "/api" });
    return r;
  };
  const user = await getUser();
  if (!user || !has(user, "contatos", "edit") || user.ownOnly) return NextResponse.redirect(new URL("/?negado=1", url.origin));
  if (!googleConfigured()) return back("nao_configurado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!cookieMatchesState(request.headers.get("cookie"), PPL_STATE_COOKIE, state)) return back("estado");
  if (url.searchParams.get("error")) return back("negado");
  if (!code) return back("estado");

  try {
    const tokens = await exchangeContactsCode(code, redirectUriFor(url.origin));
    const r = await saveConnection(user.id, tokens);
    if (!r.ok) return back(r.error === "escopo" ? "escopo" : "sem_refresh");
    await audit(user, "contatos_google_conectado", `Conectou o Google Contatos${r.email ? ` (${r.email})` : ""}`, { entity: "contato" });
    return back("ok");
  } catch (e) {
    console.error("[contatos/callback]", e instanceof Error ? e.message : "erro");
    return back("troca");
  }
}
