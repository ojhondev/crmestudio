import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getUser, has } from "@/lib/auth";
import { authUrl, googleConfigured } from "@/lib/drive/google";
import { redirectUriFor } from "@/lib/drive";

/** Inicia a conexão com o Google Drive (só quem gerencia o Drive). Sem credenciais, volta com aviso. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getUser();
  if (!user || !has(user, "drive", "manage")) return NextResponse.redirect(new URL("/?negado=1", url.origin));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/drive/conexao?erro=nao_configurado", url.origin));

  const state = crypto.randomBytes(18).toString("base64url");
  const res = NextResponse.redirect(authUrl(redirectUriFor(url.origin), state));
  res.cookies.set("drive_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/drive", maxAge: 600 });
  return res;
}
