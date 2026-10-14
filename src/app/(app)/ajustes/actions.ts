"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, like, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { StageKind } from "@/lib/db/schema";

export async function updateProfile(_: unknown, form: FormData) {
  const user = await requireUser();
  const name = String(form.get("name") || "").trim();
  if (!name) return { error: "Informe seu nome." };
  await db
    .update(schema.users)
    .set({ name, phone: String(form.get("phone") || "").trim() || null })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true, msg: "Perfil atualizado" };
}

export async function changePassword(_: unknown, form: FormData) {
  const user = await requireUser();
  const current = String(form.get("current") || "");
  const next = String(form.get("next") || "");
  if (next.length < 8) return { error: "A nova senha precisa ter pelo menos 8 caracteres." };
  const [u] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!u || !verifyPassword(current, u.hash)) return { error: "Senha atual incorreta." };
  await db.update(schema.users).set({ passwordHash: hashPassword(next) }).where(eq(schema.users.id, user.id));
  return { ok: true, msg: "Senha alterada" };
}

export async function saveStage(id: number, data: { name?: string; color?: string; kind?: StageKind }) {
  await requireUser(["admin"]);
  await db.update(schema.stages).set(data).where(eq(schema.stages.id, id));
  revalidatePath("/", "layout");
}

export async function moveStage(id: number, dir: -1 | 1) {
  await requireUser(["admin"]);
  const all = await db.select().from(schema.stages).orderBy(schema.stages.position);
  const i = all.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  await db.update(schema.stages).set({ position: all[j].position }).where(eq(schema.stages.id, all[i].id));
  await db.update(schema.stages).set({ position: all[i].position }).where(eq(schema.stages.id, all[j].id));
  revalidatePath("/", "layout");
}

export async function addStage(name: string) {
  await requireUser(["admin"]);
  if (!name.trim()) return;
  const [{ top }] = await db.select({ top: max(schema.stages.position) }).from(schema.stages);
  await db.insert(schema.stages).values({ name: name.trim(), position: (top ?? 0) + 1, kind: "aberto" });
  revalidatePath("/", "layout");
}

export async function removeStage(id: number) {
  await requireUser(["admin"]);
  const [{ n }] = await db.select({ n: count() }).from(schema.deals).where(eq(schema.deals.stageId, id));
  if (n > 0) return { error: `Mova os ${n} negócios desta etapa antes de excluí-la.` };
  await db.delete(schema.stages).where(eq(schema.stages.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Remove tudo que foi criado pelo `npm run db:demo` (origem "exemplo"). */
export async function clearDemoData() {
  await requireUser(["admin"]);
  const demo = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.source, "exemplo"));
  const ids = demo.map((d) => d.id);
  if (ids.length) {
    // transações/negócios ligados aos contatos de exemplo caem em cascata
    await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids));
  }
  await db.delete(schema.transactions).where(and(like(schema.transactions.notes, "%[exemplo]%")));
  await db.delete(schema.events).where(like(schema.events.description, "%[exemplo]%"));
  revalidatePath("/", "layout");
  return { ok: true, n: ids.length };
}
