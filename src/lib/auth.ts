import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";

const COOKIE = "restaura_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const SECRET = process.env.AUTH_SECRET || "";

function sign(payload: string) {
  if (!SECRET) throw new Error("AUTH_SECRET não configurado.");
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function readToken(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const got = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  const [userId, exp] = payload.split("|");
  if (!userId || !(Number(exp) > Date.now())) return null;
  return userId;
}

export async function createSession(userId: string) {
  const payload = `${userId}|${Date.now() + MAX_AGE * 1000}`;
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
  role: Role;
  title: string | null;
};

/** Usuário logado (memoizado por request) ou null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  const userId = token ? readToken(token) : null;
  if (!userId) return null;
  const [u] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      title: schema.users.title,
      active: schema.users.active,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title };
});

/** Exige login; opcionalmente restringe por papel. */
export async function requireUser(roles?: Role[]) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

/** O que cada papel enxerga no menu / pode acessar. */
export const access = {
  atendimento: ["admin", "equipe"] as Role[],
  financeiro: ["admin", "equipe"] as Role[],
  contatos: ["admin", "equipe"] as Role[],
  equipe: ["admin"] as Role[],
};

export function can(user: SessionUser, area: keyof typeof access) {
  return access[area].includes(user.role);
}
