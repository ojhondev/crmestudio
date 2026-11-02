import { NextResponse } from "next/server";
import { getUser, has } from "@/lib/auth";
import { redirectUriFor } from "@/lib/drive";
import { contactsAuthUrl, googleConfigured, newContactsState, PPL_STATE_COOKIE } from "@/lib/contacts-import/google";

/** Inicia a conexão da PRÓPRIA pessoa com o Google Contatos (somente leitura). Volta em /api/drive/callback (URI já autorizada). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));
  if (!has(user, "contatos", "edit") || user.ownOnly) return NextResponse.redirect(new URL("/?negado=1", url.origin));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/contatos/importar?google=nao_configurado", url.origin));

  const state = newContactsState();
  const res = NextResponse.redirect(contactsAuthUrl(redirectUriFor(url.origin), state, user.email));
  res.cookies.set(PPL_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api", maxAge: 600 });
  return res;
}
