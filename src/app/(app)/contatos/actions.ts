"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { normalizePhone, parseMoney } from "@/lib/format";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "__none" ? s : null;
};

function contactFields(form: FormData) {
  return {
    name: String(form.get("name") || "").trim(),
    email: str(form.get("email"))?.toLowerCase() ?? null,
    phone: normalizePhone(str(form.get("phone"))),
    company: str(form.get("company")),
    role: str(form.get("role")),
    city: str(form.get("city")),
    state: str(form.get("state"))?.toUpperCase().slice(0, 2) ?? null,
    source: str(form.get("source")),
    ownerId: str(form.get("ownerId")),
    notes: str(form.get("notes")),
    tags: String(form.get("tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/** Novo lead: cria o contato e (opcional) já abre um negócio na 1ª etapa. */
export async function createContact(_: unknown, form: FormData) {
  const user = await requireUser(["admin", "equipe"]);
  const fields = contactFields(form);
  if (!fields.name) return { error: "Informe o nome." };
  const [c] = await db
    .insert(schema.contacts)
    .values({ ...fields, ownerId: fields.ownerId ?? user.id })
    .returning({ id: schema.contacts.id });

  if (form.get("createDeal") === "on") {
    const [first] = await db.select().from(schema.stages).orderBy(schema.stages.position).limit(1);
    const [{ top }] = await db.select({ top: max(schema.deals.position) }).from(schema.deals).where(eq(schema.deals.stageId, first.id));
    const [deal] = await db
      .insert(schema.deals)
      .values({
        title: str(form.get("dealTitle")) ?? `${fields.company ?? fields.name}`,
        contactId: c.id,
        stageId: first.id,
        valueCents: parseMoney(form.get("dealValue")),
        service: str(form.get("service")),
        ownerId: fields.ownerId ?? user.id,
        position: (top ?? 0) + 1,
      })
      .returning({ id: schema.deals.id });
    await db.insert(schema.activities).values({ dealId: deal.id, contactId: c.id, userId: user.id, type: "nota", body: "Lead cadastrado" });
  }
  revalidatePath("/", "layout");
  return { ok: true, id: c.id };
}

export async function updateContact(_: unknown, form: FormData) {
  await requireUser(["admin", "equipe"]);
  const id = String(form.get("id"));
  const fields = contactFields(form);
  if (!fields.name) return { error: "Informe o nome." };
  await db.update(schema.contacts).set({ ...fields, updatedAt: new Date() }).where(eq(schema.contacts.id, id));
  // mantém a conversa de WhatsApp ligada ao número atualizado
  if (fields.phone) {
    await db
      .update(schema.conversations)
      .set({ contactId: id })
      .where(eq(schema.conversations.phone, fields.phone));
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteContact(id: string) {
  await requireUser(["admin", "equipe"]);
  await db.delete(schema.contacts).where(eq(schema.contacts.id, id));
  revalidatePath("/", "layout");
  redirect("/contatos");
}
