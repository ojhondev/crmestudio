"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, like, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSession, requireAccess, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
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
  const [u] = await db.select({ hash: schema.users.passwordHash, version: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!u || !verifyPassword(current, u.hash)) return { error: "Senha atual incorreta." };
  // nova versão de sessão: desconecta os outros aparelhos; este continua logado
  const version = u.version + 1;
  await db.update(schema.users).set({ passwordHash: hashPassword(next), sessionVersion: version }).where(eq(schema.users.id, user.id));
  await createSession(user.id, version);
  await audit(user, "senha_trocada", "Trocou a própria senha", { entity: "usuario", entityId: user.id });
  return { ok: true, msg: "Senha alterada. Os outros aparelhos foram desconectados." };
}

export async function saveStage(id: number, data: { name?: string; color?: string; kind?: StageKind }) {
  await requireAccess("configuracoes", "manage");
  await db.update(schema.stages).set(data).where(eq(schema.stages.id, id));
  revalidatePath("/", "layout");
}

export async function moveStage(id: number, dir: -1 | 1) {
  await requireAccess("configuracoes", "manage");
  const all = await db.select().from(schema.stages).orderBy(schema.stages.position);
  const i = all.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  await db.update(schema.stages).set({ position: all[j].position }).where(eq(schema.stages.id, all[i].id));
  await db.update(schema.stages).set({ position: all[i].position }).where(eq(schema.stages.id, all[j].id));
  revalidatePath("/", "layout");
}

export async function addStage(name: string) {
  await requireAccess("configuracoes", "manage");
  if (!name.trim()) return;
  const [{ top }] = await db.select({ top: max(schema.stages.position) }).from(schema.stages);
  await db.insert(schema.stages).values({ name: name.trim(), position: (top ?? 0) + 1, kind: "aberto" });
  revalidatePath("/", "layout");
}

export async function removeStage(id: number) {
  await requireAccess("configuracoes", "manage");
  const [{ n }] = await db.select({ n: count() }).from(schema.deals).where(eq(schema.deals.stageId, id));
  if (n > 0) return { error: `Mova os ${n} negócios desta etapa antes de excluí-la.` };
  await db.delete(schema.stages).where(eq(schema.stages.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Remove tudo que foi criado pelo `npm run db:demo` (origem "exemplo"). */
export async function clearDemoData() {
  const user = await requireAccess("configuracoes", "manage");
  const demo = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.source, "exemplo"));
  const ids = demo.map((d) => d.id);
  if (ids.length) {
    // transações/negócios ligados aos contatos de exemplo caem em cascata
    await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids));
  }
  await db.delete(schema.transactions).where(and(like(schema.transactions.notes, "%[exemplo]%")));
  await db.delete(schema.events).where(like(schema.events.description, "%[exemplo]%"));
  await audit(user, "exemplos_removidos", `Removeu ${ids.length} contatos de exemplo`, { entity: "sistema" });
  revalidatePath("/", "layout");
  return { ok: true, n: ids.length };
}
