"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess, requireUser, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { normalizePhone, parseLocalInput, parseMoney } from "@/lib/format";
import { afterResponse, fireDealEvent, fireTaskEvent, stageTriggers } from "@/lib/automations-engine";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "__none" ? s : null;
};

const isPartnerAccount = (u: SessionUser) => u.role === "parceiro";

/** Quem tem "só os próprios" acessa apenas negócios em que é dono ou parceiro indicado. */
async function assertDealAccess(user: SessionUser, dealId: string) {
  const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
  if (!d) throw new Error("Negócio não encontrado");
  if (user.ownOnly && d.partnerId !== user.id && d.ownerId !== user.id) throw new Error("Sem acesso");
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
        ownerId: isPartnerAccount(user) ? null : user.id,
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
  const user = await requireAccess("negocios", "edit");
  const fields = dealFields(form);
  if (!fields.title) return { error: "Dê um nome ao negócio." };
  const stageId = Number(form.get("stageId"));
  const contactId = await resolveContact(form, user);
  const [{ top }] = await db
    .select({ top: max(schema.deals.position) })
    .from(schema.deals)
    .where(eq(schema.deals.stageId, stageId));
  // quem só vê os próprios não escolhe responsável/parceiro: o negócio fica no nome dele
  const ownerId = user.ownOnly ? (isPartnerAccount(user) ? null : user.id) : (fields.ownerId ?? user.id);
  const partnerId = user.ownOnly ? (isPartnerAccount(user) ? user.id : null) : fields.partnerId;
  const [deal] = await db
    .insert(schema.deals)
    .values({ ...fields, ownerId, partnerId, contactId, stageId, position: (top ?? 0) + 1 })
    .returning({ id: schema.deals.id });
  await db.insert(schema.activities).values({ dealId: deal.id, contactId, userId: user.id, type: "nota", body: "Negócio criado" });
  afterResponse(() => fireDealEvent(["deal_created"], deal.id, user, { eventKey: deal.id }));
  revalidatePath("/", "layout");
  return { ok: true, id: deal.id };
}

export async function updateDeal(_: unknown, form: FormData) {
  const user = await requireAccess("negocios", "edit");
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
      ownerId: user.ownOnly ? current.ownerId : fields.ownerId,
      partnerId: user.ownOnly ? current.partnerId : fields.partnerId,
      contactId,
      stageId,
      lostReason: str(form.get("lostReason")),
      updatedAt: new Date(),
    })
    .where(eq(schema.deals.id, id));
  if (stageId !== current.stageId) {
    const moved = await logStageChange(user, id, contactId, stageId);
    afterResponse(() => fireDealEvent(stageTriggers(moved.kind), id, user, { eventKey: `${stageId}:${Date.now()}` }));
  }
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
  const user = await requireAccess("negocios", "edit");
  const current = await assertDealAccess(user, dealId);
  await db.update(schema.deals).set({ stageId, position, updatedAt: new Date() }).where(eq(schema.deals.id, dealId));
  let kind: string | null = null;
  if (stageId !== current.stageId) {
    kind = (await logStageChange(user, dealId, current.contactId, stageId)).kind;
    const k = kind as "aberto" | "ganho" | "perdido";
    afterResponse(() => fireDealEvent(stageTriggers(k), dealId, user, { eventKey: `${stageId}:${Date.now()}` }));
  }
  revalidatePath("/", "layout");
  return { kind };
}

export async function deleteDeal(dealId: string) {
  const user = await requireAccess("negocios", "manage");
  const deal = await assertDealAccess(user, dealId);
  await db.delete(schema.deals).where(eq(schema.deals.id, dealId));
  await audit(user, "negocio_excluido", `Excluiu o negócio “${deal.title}”`, { entity: "negocio", entityId: dealId, meta: { valueCents: deal.valueCents } });
  revalidatePath("/", "layout");
  redirect("/negocios");
}

/** Registrar algo num negócio exige editar Negócios; só num contato, editar Contatos. */
export async function addActivity(_: unknown, form: FormData) {
  const user = await requireUser();
  const dealId = str(form.get("dealId"));
  const contactId = str(form.get("contactId"));
  const body = String(form.get("body") || "").trim();
  if (!body) return { error: "Escreva algo." };
  if (dealId) {
    if (!has(user, "negocios", "edit")) return { error: "Você não tem permissão para editar negócios." };
    await assertDealAccess(user, dealId);
  } else {
    if (user.ownOnly || !has(user, "contatos", "edit")) return { error: "Você não tem permissão para editar contatos." };
  }
  await db.insert(schema.activities).values({
    dealId,
    contactId: user.ownOnly ? null : contactId,
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
  const contactId = user.ownOnly ? null : str(form.get("contactId"));
  if (dealId) {
    if (!has(user, "negocios", "edit")) return { error: "Você não tem permissão para editar negócios." };
    await assertDealAccess(user, dealId);
  } else if (!has(user, "contatos", "edit") && !has(user, "negocios", "edit")) {
    return { error: "Você não tem permissão para criar tarefas." };
  }
  await db.insert(schema.tasks).values({
    title,
    dueAt: parseLocalInput(due),
    dealId,
    contactId,
    assigneeId: user.ownOnly ? user.id : (str(form.get("assigneeId")) ?? user.id),
    createdById: user.id,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Cada pessoa mexe nas próprias tarefas; nas dos outros, só quem edita Negócios ou Contatos (e não é "só os próprios"). */
async function assertTaskAccess(user: SessionUser, taskId: string) {
  const [t] = await db.select({ assigneeId: schema.tasks.assigneeId }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!t) throw new Error("Tarefa não encontrada");
  if (t.assigneeId === user.id) return;
  if (user.ownOnly || (!has(user, "negocios", "edit") && !has(user, "contatos", "edit"))) throw new Error("Sem acesso");
}

export async function toggleTask(taskId: string, done: boolean) {
  await assertTaskAccess(await requireUser(), taskId);
  // doneAt continua sendo a fonte de "concluída"; o status do módulo Tarefas acompanha
  if (done) {
    const doneAt = new Date();
    const [prev] = await db.select({ doneAt: schema.tasks.doneAt }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
    await db.update(schema.tasks).set({ doneAt, status: "concluida" }).where(eq(schema.tasks.id, taskId));
    if (!prev?.doneAt) {
      const actor = await requireUser();
      afterResponse(() => fireTaskEvent("task_completed", taskId, actor, { eventKey: String(doneAt.getTime()) }));
    }
  }
  else {
    await db.update(schema.tasks).set({ doneAt: null }).where(eq(schema.tasks.id, taskId));
    await db.update(schema.tasks).set({ status: "a_fazer" }).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.status, "concluida")));
  }
  revalidatePath("/", "layout");
}

export async function deleteTask(taskId: string) {
  await assertTaskAccess(await requireUser(), taskId);
  await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
  revalidatePath("/", "layout");
}
