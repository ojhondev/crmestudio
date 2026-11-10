"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { TALENT_STATUS } from "@/lib/talentos";

/** Muda a etapa do cadastro e/ou salva as anotações internas. */
export async function updateTalent(id: string, _: unknown, form: FormData) {
  const user = await requireAccess("contatos", "edit");
  const status = String(form.get("status") || "");
  if (!(TALENT_STATUS as readonly string[]).includes(status)) return { error: "Etapa inválida." };
  const notas = String(form.get("notas") || "").trim().slice(0, 4000) || null;
  const [t] = await db.select({ nome: schema.talentos.nome, status: schema.talentos.status }).from(schema.talentos).where(eq(schema.talentos.id, id));
  if (!t) return { error: "Cadastro não encontrado." };
  await db.update(schema.talentos).set({ status, notas, updatedAt: new Date() }).where(eq(schema.talentos.id, id));
  await audit(user, "talento_atualizado", `Banco de Talentos: ${t.nome} → ${status}`, { entity: "talento", entityId: id });
  revalidatePath("/contatos/talentos", "layout");
  return { ok: true };
}

export async function deleteTalent(id: string) {
  const user = await requireAccess("contatos", "manage");
  const [t] = await db.select({ nome: schema.talentos.nome }).from(schema.talentos).where(eq(schema.talentos.id, id));
  await db.delete(schema.talentos).where(eq(schema.talentos.id, id));
  await audit(user, "talento_excluido", `Excluiu o cadastro “${t?.nome ?? id}” do Banco de Talentos`, { entity: "talento", entityId: id });
  revalidatePath("/contatos/talentos", "layout");
  redirect("/contatos/talentos");
}
