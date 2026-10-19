import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";
import { FIRST_ALLOWED, atLeast, resolvePermissions, type Level, type ModuleKey, type Permissions } from "@/lib/permissions";

const COOKIE = "restaura_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const SECRET = process.env.AUTH_SECRET || "";

function sign(payload: string) {
  if (!SECRET) throw new Error("AUTH_SECRET não configurado.");
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Token: `userId|versão|expira.assinatura`. A versão muda ao trocar a senha ou desativar a conta. */
function readToken(token: string): { userId: string; version: number } | null {
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const got = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  const [userId, version, exp] = payload.split("|");
  if (!userId || version === undefined || !(Number(exp) > Date.now())) return null;
  return { userId, version: Number(version) };
}

export async function createSession(userId: string, version: number) {
  const payload = `${userId}|${version}|${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  /** tipo de conta: admin · equipe · parceiro (as permissões reais estão em `perms`) */
  role: Role;
  title: string | null;
  profile: string;
  perms: Permissions;
  /** vê só os próprios negócios e a própria agenda */
  ownOnly: boolean;
  mustChangePassword: boolean;
};

/** Usuário logado (memoizado por request) ou null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  const parsed = token ? readToken(token) : null;
  if (!parsed) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, parsed.userId)).limit(1);
  if (!u || !u.active || u.sessionVersion !== parsed.version) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    title: u.title,
    profile: u.profile,
    perms: resolvePermissions(u),
    ownOnly: u.role === "admin" ? false : u.ownOnly,
    mustChangePassword: u.mustChangePassword,
  };
});

/** Pessoa logada (qualquer permissão). Quem ainda usa senha provisória vai trocar antes. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/primeiro-acesso");
  return user;
}

export const has = (user: Pick<SessionUser, "perms">, module: ModuleKey, level: Level = "view") => atLeast(user.perms[module], level);

/** Primeira tela que a pessoa pode ver (ou o painel). */
export function homeFor(user: Pick<SessionUser, "perms">) {
  return FIRST_ALLOWED.find((f) => has(user, f.module))?.href ?? "/";
}

/**
 * Exige um nível mínimo no módulo. É a regra de verdade: roda no servidor em toda página e ação.
 * Sem permissão, a pessoa volta para o painel (que é aberto a todos).
 */
export async function requireAccess(module: ModuleKey, level: Level = "view") {
  const user = await requireUser();
  if (!has(user, module, level)) redirect("/?negado=1");
  return user;
}

/** Nova versão de sessão: derruba todos os aparelhos logados nesta conta. */
export function nextSessionVersion(current: number) {
  return current + 1;
}
