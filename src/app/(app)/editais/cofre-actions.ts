"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isCofreType } from "@/lib/propostas/types";
import { cleanLink } from "@/lib/propostas/links";

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

type CofreInput = { id?: string; type: string; title: string; number?: string; issuer?: string; issuedAt?: string; validUntil?: string; url?: string; notes?: string; ownerId?: string | null };

export async function saveCofreDocAction(input: CofreInput): Promise<{ error: string } | { ok: true; id: string }> {
  const user = await requireAccess("editais", "edit");
  if (!isCofreType(input.type)) return { error: "Escolha o tipo do documento." };
  const title = str(input.title, 160);
  if (!title) return { error: "Dê um nome ao documento." };
  if (input.issuedAt && !isDay(input.issuedAt)) return { error: "Data de emissão inválida." };
  if (input.validUntil && !isDay(input.validUntil)) return { error: "Data de validade inválida." };
  if (input.issuedAt && input.validUntil && input.validUntil < input.issuedAt) return { error: "A validade não pode ser antes da emissão." };
  const url = cleanLink(input.url);
  if (input.url?.trim() && !url) return { error: "O link precisa começar com https:// (cole o link do Drive ou do site que emitiu)." };
  if (input.ownerId && !isId(input.ownerId)) return { error: "Responsável inválido." };
  const values = {
    type: input.type,
    title,
    number: str(input.number, 80) || null,
    issuer: str(input.issuer, 120) || null,
    issuedAt: input.issuedAt || null,
    validUntil: input.validUntil || null,
    url,
    notes: str(input.notes, 500) || null,
    ownerId: input.ownerId || null,
    updatedAt: new Date(),
  };
  let id = input.id;
  if (id) {
    if (!isId(id)) return { error: "Pedido inválido." };
    await db.update(schema.cofreDocs).set(values).where(eq(schema.cofreDocs.id, id));
  } else {
    const [row] = await db.insert(schema.cofreDocs).values({ ...values, ownerId: values.ownerId ?? user.id }).returning({ id: schema.cofreDocs.id });
    id = row.id;
  }
  await audit(user, input.id ? "cofre_atualizado" : "cofre_criado", `${input.id ? "Atualizou" : "Cadastrou"} no cofre: ${title}`, { entity: "cofre", entityId: id });
  revalidatePath("/editais/cofre");
  revalidatePath("/editais", "layout");
  return { ok: true, id };
}

export async function deleteCofreDocAction(id: string): Promise<{ error: string } | { ok: true }> {
  const user = await requireAccess("editais", "manage");
  if (!isId(id)) return { error: "Pedido inválido." };
  const [row] = await db.select({ title: schema.cofreDocs.title }).from(schema.cofreDocs).where(eq(schema.cofreDocs.id, id)).limit(1);
  if (!row) return { error: "Documento não encontrado." };
  await db.delete(schema.cofreDocs).where(eq(schema.cofreDocs.id, id));
  await audit(user, "cofre_excluido", `Removeu do cofre: ${row.title}`, { entity: "cofre", entityId: id });
  revalidatePath("/editais/cofre");
  revalidatePath("/editais", "layout");
  return { ok: true };
}
