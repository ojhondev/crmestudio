"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { normalizePhone, parseLocalInput, parseMoney } from "@/lib/format";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "__none" ? s : null;
};

async function assertDealAccess(user: SessionUser, dealId: string) {
  const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
  if (!d) throw new Error("Negócio não encontrado");
  if (user.role === "parceiro" && d.partnerId !== user.id && d.ownerId !== user.id) throw new Error("Sem acesso");
  return d;
}

/** Cria contato novo (se informado) ou usa o selecionado. */
async function resolveContact(form: FormData, user: SessionUser) {
  const newName = str(form.get("newContactName"));
  if (newName) {
    const [c] = await db
      .insert(schema.contacts)
      .values({
        name: newName,
        phone: normalizePhone(str(form.get("newContactPhone"))),
        email: str(form.get("newContactEmail"))?.toLowerCase() ?? null,
        company: str(form.get("newContactCompany")),
        source: str(form.get("source")),
        ownerId: user.role === "parceiro" ? null : user.id,
      })
      .returning({ id: schema.contacts.id });
    return c.id;
  }
  return str(form.get("contactId"));
}

function dealFields(form: FormData) {
  return {
    title: String(form.get("title") || "").trim(),
    valueCents: parseMoney(form.get("value")),
    service: str(form.get("service")),
    property: str(form.get("property")),
    location: str(form.get("location")),
    expectedClose: str(form.get("expectedClose")),
    ownerId: str(form.get("ownerId")),
    partnerId: str(form.get("partnerId")),
    notes: str(form.get("notes")),
  };
}

export async function createDeal(_: unknown, form: FormData) {
  const user = await requireUser();
  const fields = dealFields(form);
  if (!fields.title) return { error: "Dê um nome ao negócio." };
  const stageId = Number(form.get("stageId"));
  const contactId = await resolveContact(form, user);
  const [{ top }] = await db
    .select({ top: max(schema.deals.position) })
    .from(schema.deals)
    .where(eq(schema.deals.stageId, stageId));
  const [deal] = await db
    .insert(schema.deals)
    .values({
      ...fields,
      ownerId: fields.ownerId ?? (user.role === "parceiro" ? null : user.id),
      partnerId: user.role === "parceiro" ? user.id : fields.partnerId,
      contactId,
      stageId,
      position: (top ?? 0) + 1,
    })
    .returning({ id: schema.deals.id });
  await db.insert(schema.activities).values({ dealId: deal.id, contactId, userId: user.id, type: "nota", body: "Negócio criado" });
  revalidatePath("/", "layout");
  return { ok: true, id: deal.id };
}

export async function updateDeal(_: unknown, form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  const current = await assertDealAccess(user, id);
  const fields = dealFields(form);
  if (!fields.title) return { error: "Dê um nome ao negócio." };
  const contactId = await resolveContact(form, user);
  const stageId = Number(form.get("stageId")) || current.stageId;
  await db
    .update(schema.deals)
    .set({
      ...fields,
      ownerId: user.role === "parceiro" ? current.ownerId : fields.ownerId,
      partnerId: user.role === "parceiro" ? current.partnerId : fields.partnerId,
      contactId,
      stageId,
      lostReason: str(form.get("lostReason")),
      updatedAt: new Date(),
    })
    .where(eq(schema.deals.id, id));
  if (stageId !== current.stageId) await logStageChange(user, id, contactId, stageId);
  revalidatePath("/", "layout");
  return { ok: true };
}

async function logStageChange(user: SessionUser, dealId: string, contactId: string | null, stageId: number) {
  const [stage] = await db.select().from(schema.stages).where(eq(schema.stages.id, stageId));
  await db
    .update(schema.deals)
    .set({ closedAt: stage.kind === "aberto" ? null : new Date() })
    .where(eq(schema.deals.id, dealId));
  await db.insert(schema.activities).values({
    dealId,
    contactId,
    userId: user.id,
    type: "etapa",
    body: `Movido para “${stage.name}”`,
  });
  return stage;
}

/** Arrastar no Kanban. */
export async function moveDeal(dealId: string, stageId: number, position: number) {
  const user = await requireUser();
  const current = await assertDealAccess(user, dealId);
  await db.update(schema.deals).set({ stageId, position, updatedAt: new Date() }).where(eq(schema.deals.id, dealId));
  let kind: string | null = null;
  if (stageId !== current.stageId) kind = (await logStageChange(user, dealId, current.contactId, stageId)).kind;
  revalidatePath("/", "layout");
  return { kind };
}

export async function deleteDeal(dealId: string) {
  const user = await requireUser(["admin", "equipe"]);
  await assertDealAccess(user, dealId);
  await db.delete(schema.deals).where(eq(schema.deals.id, dealId));
  revalidatePath("/", "layout");
  redirect("/negocios");
}

export async function addActivity(_: unknown, form: FormData) {
  const user = await requireUser();
  const dealId = str(form.get("dealId"));
  const contactId = str(form.get("contactId"));
  const body = String(form.get("body") || "").trim();
  if (!body) return { error: "Escreva algo." };
  if (dealId) await assertDealAccess(user, dealId);
  else if (user.role === "parceiro") return { error: "Sem acesso." };
  await db.insert(schema.activities).values({
    dealId,
    contactId: user.role === "parceiro" ? null : contactId,
    userId: user.id,
    type: String(form.get("type") || "nota"),
    body,
  });
  if (dealId) await db.update(schema.deals).set({ updatedAt: new Date() }).where(eq(schema.deals.id, dealId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addTask(_: unknown, form: FormData) {
  const user = await requireUser();
  const title = String(form.get("title") || "").trim();
  if (!title) return { error: "Descreva a tarefa." };
  const due = str(form.get("dueAt"));
  const dealId = str(form.get("dealId"));
  const partner = user.role === "parceiro";
  if (dealId) await assertDealAccess(user, dealId);
  await db.insert(schema.tasks).values({
    title,
    dueAt: parseLocalInput(due),
    dealId,
    contactId: partner ? null : str(form.get("contactId")),
    assigneeId: partner ? user.id : (str(form.get("assigneeId")) ?? user.id),
    createdById: user.id,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Parceiro só mexe nas tarefas dele. */
async function assertTaskAccess(user: SessionUser, taskId: string) {
  if (user.role !== "parceiro") return;
  const [t] = await db.select({ assigneeId: schema.tasks.assigneeId }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!t || t.assigneeId !== user.id) throw new Error("Sem acesso");
}

export async function toggleTask(taskId: string, done: boolean) {
  await assertTaskAccess(await requireUser(), taskId);
  await db.update(schema.tasks).set({ doneAt: done ? new Date() : null }).where(eq(schema.tasks.id, taskId));
  revalidatePath("/", "layout");
}

export async function deleteTask(taskId: string) {
  await assertTaskAccess(await requireUser(), taskId);
  await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
  revalidatePath("/", "layout");
}
