"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword, randomToken } from "@/lib/password";
import type { Role } from "@/lib/db/schema";

const ROLES: Role[] = ["admin", "equipe", "parceiro"];
const tempPassword = () => randomToken(8).replace(/[-_]/g, "x");

export async function createMember(_: unknown, form: FormData) {
  await requireUser(["admin"]);
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const role = String(form.get("role")) as Role;
  if (!name || !email) return { error: "Nome e e-mail são obrigatórios." };
  if (!ROLES.includes(role)) return { error: "Papel inválido." };
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) return { error: "Já existe uma conta com esse e-mail." };
  const password = tempPassword();
  await db.insert(schema.users).values({
    name,
    email,
    role,
    title: String(form.get("title") || "").trim() || null,
    phone: String(form.get("phone") || "").trim() || null,
    passwordHash: hashPassword(password),
    calendarToken: randomToken(),
  });
  revalidatePath("/equipe");
  return { ok: true, email, password };
}

export async function updateMember(id: string, data: { role?: Role; active?: boolean }) {
  const me = await requireUser(["admin"]);
  if (id === me.id && (data.active === false || (data.role && data.role !== "admin")))
    return { error: "Você não pode remover o seu próprio acesso de administrador." };
  if (data.role && !ROLES.includes(data.role)) return { error: "Papel inválido." };
  await db.update(schema.users).set(data).where(eq(schema.users.id, id));
  revalidatePath("/equipe");
  return { ok: true };
}

export async function resetPassword(id: string) {
  const me = await requireUser(["admin"]);
  if (id === me.id) return { error: "Troque a sua senha em Ajustes." };
  const password = tempPassword();
  const [u] = await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(password) })
    .where(and(eq(schema.users.id, id), ne(schema.users.id, me.id)))
    .returning({ email: schema.users.email });
  return { ok: true, email: u?.email, password };
}
