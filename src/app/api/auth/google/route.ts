import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { googleConfig, googleConfigured } from "@/lib/drive/google";

/** Início do "Entrar com Google": só pede identidade (e-mail e perfil), nunca acesso ao Drive. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?erro=google_indisponivel", url.origin));
  const state = crypto.randomBytes(24).toString("base64url");
  const params = new URLSearchParams({
    client_id: googleConfig().clientId,
    redirect_uri: `${url.origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("google_login_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
