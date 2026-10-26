import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { googleConfig, googleConfigured } from "@/lib/drive/google";

/**
 * Retorno do "Entrar com Google". Só entra quem já tem conta ATIVA na Equipe com o mesmo e-mail
 * (verificado pelo Google): ter uma conta Google não cria acesso sozinho.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (erro: string) => {
    const r = NextResponse.redirect(new URL(`/login?erro=${erro}`, url.origin));
    r.cookies.delete({ name: "google_login_state", path: "/api/auth/google" });
    return r;
  };
  if (!googleConfigured()) return back("google_indisponivel");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("cookie")?.match(/google_login_state=([^;]+)/)?.[1];
  if (url.searchParams.get("error")) return back("google_cancelado");
  if (!code || !state || !cookie || cookie !== state) return back("google_estado");

  try {
    const c = googleConfig();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokens.access_token) return back("google_falha");

    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    const info = (await infoRes.json()) as { email?: string; email_verified?: boolean };
    const email = (info.email ?? "").trim().toLowerCase();
    if (!infoRes.ok || !email || info.email_verified !== true) return back("google_falha");

    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!u || !u.active) {
      await audit(null, "login_falhou", `Entrar com Google recusado: sem conta ativa (${email})`, { entity: "usuario", entityId: email });
      return back("google_sem_conta");
    }

    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    await audit({ id: u.id, name: u.name }, "login", "Entrou no sistema com Google", { entity: "usuario", entityId: u.id });
    await createSession(u.id, u.sessionVersion);
    const r = NextResponse.redirect(new URL(u.mustChangePassword ? "/primeiro-acesso" : "/", url.origin));
    r.cookies.delete({ name: "google_login_state", path: "/api/auth/google" });
    return r;
  } catch (e) {
    console.error("[auth/google]", e);
    return back("google_falha");
  }
}
