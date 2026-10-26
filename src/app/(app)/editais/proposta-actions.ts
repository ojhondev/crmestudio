"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseLocalInput, todayISO } from "@/lib/format";
import { dayToInstant, dueFromDeadline } from "@/lib/propostas/dates";
import { stepStatusFromItems } from "@/lib/propostas/progress";
import { suggestAtestadosFor } from "@/lib/propostas/suggest";
import { LOSS_STATUSES, STEP_BY_KEY, isDossieStatus, isStepKey, isStepStatus, type DossieStatus, type StepStatus } from "@/lib/propostas/types";
import { applyChecklist, applyMatrix, createPriceSheet, editalNote, generateDocs, insertAtestados, moveDealFor, setTaskDone, startProposta, syncTasks } from "@/lib/propostas/ops";
import { dayOf, deadlineOf, getConfig, matrixKeyFor } from "@/lib/propostas/server";

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
type Res = { error: string } | { ok: true; error?: undefined; [k: string]: unknown };

function refresh(editalId: string) {
  revalidatePath(`/editais/proposta/${editalId}`);
  revalidatePath("/editais");
  revalidatePath("/");
}

async function dossieOf(editalId: string) {
  if (!isId(editalId)) return null;
  const [row] = await db
    .select({ d: schema.propostaDossies, e: schema.editais })
    .from(schema.propostaDossies)
    .innerJoin(schema.editais, eq(schema.propostaDossies.editalId, schema.editais.id))
    .where(eq(schema.propostaDossies.editalId, editalId))
    .limit(1);
  return row ?? null;
}

/** Item → dossiê (para saber a qual edital pertence e conferir que existe). */
async function itemOf(itemId: string) {
  if (!isId(itemId)) return null;
  const [row] = await db
    .select({ i: schema.propostaItems, d: schema.propostaDossies })
    .from(schema.propostaItems)
    .innerJoin(schema.propostaDossies, eq(schema.propostaItems.dossieId, schema.propostaDossies.id))
    .where(eq(schema.propostaItems.id, itemId))
    .limit(1);
  return row ?? null;
}

async function personName(id: string | null) {
  if (!id) return null;
  const [u] = await db.select({ name: schema.users.name, active: schema.users.active }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return u?.active ? u.name : null;
}

/* --------------------------------- começar --------------------------------- */

/** “Vou participar”: cria o dossiê e monta o que é repetível. */
export async function participarAction(editalId: string, opts: { templateKey?: string; withDeal?: boolean; withTasks?: boolean } = {}): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  if (!isId(editalId)) return { error: "Pedido inválido." };
  const r = await startProposta(user, editalId, { templateKey: str(opts.templateKey, 60) || undefined, withDeal: opts.withDeal !== false, withTasks: opts.withTasks !== false });
  if ("error" in r) return r;
  if (r.created) await audit(user, "proposta_iniciada", "Iniciou a esteira de proposta de um edital", { entity: "edital", entityId: editalId });
  refresh(editalId);
  revalidatePath("/", "layout");
  return { ok: true, created: r.created, notes: r.notes, items: r.items, tasks: r.tasks };
}

/* --------------------------------- dados do dossiê --------------------------------- */

export async function updateDossieAction(editalId: string, patch: { numero?: string; processo?: string; sessionAt?: string | null; ownerId?: string | null }): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  if (!row) return { error: "Dossiê não encontrado." };
  const set: Partial<typeof schema.propostaDossies.$inferInsert> = { updatedAt: new Date() };
  if (patch.numero !== undefined) set.numero = str(patch.numero, 80) || null;
  if (patch.processo !== undefined) set.processo = str(patch.processo, 80) || null;
  if (patch.sessionAt !== undefined) {
    const d = patch.sessionAt ? parseLocalInput(patch.sessionAt) : null;
    if (patch.sessionAt && !d) return { error: "Data inválida." };
    set.sessionAt = d;
  }
  if (patch.ownerId !== undefined) {
    if (patch.ownerId && !(await personName(patch.ownerId))) return { error: "Pessoa não encontrada." };
    set.ownerId = patch.ownerId || null;
  }
  await db.update(schema.propostaDossies).set(set).where(eq(schema.propostaDossies.id, row.d.id));
  if (patch.ownerId !== undefined) {
    await db.update(schema.editais).set({ ownerId: patch.ownerId || null, updatedAt: new Date() }).where(eq(schema.editais.id, editalId));
    await editalNote(editalId, user, "responsavel", `Responsável da proposta: ${(await personName(patch.ownerId ?? null)) ?? "ninguém"}`);
  }
  if (patch.sessionAt !== undefined) await editalNote(editalId, user, "proposta", patch.sessionAt ? `Data limite da proposta ajustada para ${patch.sessionAt.replace("T", " ")}` : "Data limite voltou a ser a do portal");
  refresh(editalId);
  return { ok: true };
}

/** Recalcula os prazos de trás para frente (itens do modelo ainda abertos e etapas não concluídas). */
export async function recalcDeadlinesAction(editalId: string): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  if (!row) return { error: "Dossiê não encontrado." };
  const deadline = dayOf(deadlineOf(row.d, row.e));
  if (!deadline) return { error: "O edital não tem data limite. Informe uma em “Dados da proposta”." };
  const today = todayISO();
  const items = await db.select().from(schema.propostaItems).where(and(eq(schema.propostaItems.dossieId, row.d.id), eq(schema.propostaItems.done, false)));
  let n = 0;
  for (const it of items) {
    if (it.offsetDays === null) continue;
    const due = dayToInstant(dueFromDeadline(deadline, it.offsetDays, today).day);
    await db.update(schema.propostaItems).set({ dueAt: due }).where(eq(schema.propostaItems.id, it.id));
    if (it.taskId) await db.update(schema.tasks).set({ dueAt: due }).where(eq(schema.tasks.id, it.taskId));
    n++;
  }
  const steps = await db.select().from(schema.propostaSteps).where(eq(schema.propostaSteps.dossieId, row.d.id));
  for (const s of steps) {
    const def = STEP_BY_KEY[s.key as keyof typeof STEP_BY_KEY];
    if (!def || s.status === "concluida" || s.status === "nao_se_aplica") continue;
    const day = def.offset === null ? deadline : dueFromDeadline(deadline, def.offset, today).day;
    await db.update(schema.propostaSteps).set({ dueAt: dayToInstant(day) }).where(eq(schema.propostaSteps.id, s.id));
  }
  await editalNote(editalId, user, "proposta", `Prazos recalculados a partir de ${deadline.split("-").reverse().join("/")}`);
  refresh(editalId);
  return { ok: true, items: n };
}

/* --------------------------------- etapas --------------------------------- */

export async function setStepAction(editalId: string, key: string, patch: { status?: string; assigneeId?: string | null; dueDay?: string | null }): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  if (!row || !isStepKey(key)) return { error: "Etapa não encontrada." };
  const [step] = await db.select().from(schema.propostaSteps).where(and(eq(schema.propostaSteps.dossieId, row.d.id), eq(schema.propostaSteps.key, key))).limit(1);
  if (!step) return { error: "Etapa não encontrada." };
  const set: Partial<typeof schema.propostaSteps.$inferInsert> = {};
  if (patch.status !== undefined) {
    if (!isStepStatus(patch.status)) return { error: "Situação inválida." };
    set.status = patch.status;
    set.doneAt = patch.status === "concluida" ? new Date() : null;
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId && !(await personName(patch.assigneeId))) return { error: "Pessoa não encontrada." };
    set.assigneeId = patch.assigneeId || null;
  }
  if (patch.dueDay !== undefined) {
    if (patch.dueDay && !isDay(patch.dueDay)) return { error: "Data inválida." };
    set.dueAt = patch.dueDay ? dayToInstant(patch.dueDay) : null;
  }
  if (!Object.keys(set).length) return { ok: true };
  await db.update(schema.propostaSteps).set(set).where(eq(schema.propostaSteps.id, step.id));

  if (patch.status !== undefined && patch.status !== step.status) {
    const label = STEP_BY_KEY[key].label;
    await editalNote(editalId, user, "proposta", `Etapa “${label}”: ${patch.status === "concluida" ? "concluída" : patch.status === "em_andamento" ? "em andamento" : patch.status === "nao_se_aplica" ? "não se aplica" : "reaberta"}`);
    if (key === "envio") {
      if (patch.status === "concluida") {
        if (row.e.triage === "em_proposta" || row.e.triage === "em_analise" || row.e.triage === "interessante") {
          await db.update(schema.editais).set({ triage: "proposta_enviada", updatedAt: new Date() }).where(eq(schema.editais.id, editalId));
        }
        const cfg = await getConfig();
        const moved = await moveDealFor(user, row.e.dealId, "enviada", { stageName: cfg.stageSent });
        if (moved) await editalNote(editalId, user, "negocio", `Negócio movido para “${moved}”`);
      } else if (step.status === "concluida" && row.e.triage === "proposta_enviada") {
        await db.update(schema.editais).set({ triage: "em_proposta", updatedAt: new Date() }).where(eq(schema.editais.id, editalId));
      }
    }
  }
  refresh(editalId);
  return { ok: true };
}

/* --------------------------------- checklist --------------------------------- */

export async function addItemAction(editalId: string, stepKey: string, title: string, dueDay?: string | null): Promise<Res> {
  await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  const text = str(title, 200);
  if (!row || !isStepKey(stepKey) || !text) return { error: "Escreva o item." };
  if (dueDay && !isDay(dueDay)) return { error: "Data inválida." };
  const [{ top }] = await db.select({ top: sql<number>`coalesce(max(${schema.propostaItems.position}), -1)::int` }).from(schema.propostaItems).where(eq(schema.propostaItems.dossieId, row.d.id));
  const cfg = await getConfig();
  await db.insert(schema.propostaItems).values({ dossieId: row.d.id, stepKey, title: text, position: top + 1, dueAt: dueDay ? dayToInstant(dueDay) : null, assigneeId: row.d.ownerId ?? cfg.roles.coordenacao ?? null });
  refresh(editalId);
  return { ok: true };
}

export async function updateItemAction(itemId: string, patch: { title?: string; dueDay?: string | null; assigneeId?: string | null }): Promise<Res> {
  await requireAccess("editais", "edit");
  const row = await itemOf(itemId);
  if (!row) return { error: "Item não encontrado." };
  const set: Partial<typeof schema.propostaItems.$inferInsert> = {};
  if (patch.title !== undefined) {
    const t = str(patch.title, 200);
    if (!t) return { error: "O item precisa de um texto." };
    set.title = t;
  }
  if (patch.dueDay !== undefined) {
    if (patch.dueDay && !isDay(patch.dueDay)) return { error: "Data inválida." };
    set.dueAt = patch.dueDay ? dayToInstant(patch.dueDay) : null;
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId && !(await personName(patch.assigneeId))) return { error: "Pessoa não encontrada." };
    set.assigneeId = patch.assigneeId || null;
  }
  await db.update(schema.propostaItems).set(set).where(eq(schema.propostaItems.id, itemId));
  if (row.i.taskId) {
    const tset: Partial<typeof schema.tasks.$inferInsert> = {};
    if (set.dueAt !== undefined) tset.dueAt = set.dueAt;
    if (set.assigneeId !== undefined) tset.assigneeId = set.assigneeId;
    if (Object.keys(tset).length) await db.update(schema.tasks).set(tset).where(eq(schema.tasks.id, row.i.taskId));
  }
  const [e] = await db.select({ id: schema.editais.id }).from(schema.editais).where(eq(schema.editais.id, row.d.editalId)).limit(1);
  if (e) refresh(e.id);
  return { ok: true };
}

export async function toggleItemAction(itemId: string, done: boolean): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  const row = await itemOf(itemId);
  if (!row) return { error: "Item não encontrado." };
  await db.update(schema.propostaItems).set({ done, doneAt: done ? new Date() : null }).where(eq(schema.propostaItems.id, itemId));
  await setTaskDone(row.i.taskId, done);
  // a etapa acompanha o checklist (todos feitos → concluída; algum feito → em andamento)
  const [step] = await db.select().from(schema.propostaSteps).where(and(eq(schema.propostaSteps.dossieId, row.d.id), eq(schema.propostaSteps.key, row.i.stepKey))).limit(1);
  if (step) {
    const siblings = await db
      .select({ done: schema.propostaItems.done, taskDone: schema.tasks.doneAt })
      .from(schema.propostaItems)
      .leftJoin(schema.tasks, eq(schema.propostaItems.taskId, schema.tasks.id))
      .where(and(eq(schema.propostaItems.dossieId, row.d.id), eq(schema.propostaItems.stepKey, row.i.stepKey)));
    const next: StepStatus = stepStatusFromItems(step.status as StepStatus, siblings.map((s) => ({ done: s.done || !!s.taskDone })));
    if (next !== step.status) {
      await db.update(schema.propostaSteps).set({ status: next, doneAt: next === "concluida" ? new Date() : null }).where(eq(schema.propostaSteps.id, step.id));
      if (next === "concluida") await editalNote(row.d.editalId, user, "proposta", `Etapa “${STEP_BY_KEY[step.key as keyof typeof STEP_BY_KEY]?.label ?? step.key}” concluída (todos os itens feitos)`);
    }
  }
  refresh(row.d.editalId);
  return { ok: true };
}

export async function removeItemAction(itemId: string): Promise<Res> {
  await requireAccess("editais", "edit");
  const row = await itemOf(itemId);
  if (!row) return { error: "Item não encontrado." };
  await db.delete(schema.propostaItems).where(eq(schema.propostaItems.id, itemId));
  // a tarefa criada para o item sai junto, se ainda estiver aberta (concluída fica como histórico)
  if (row.i.taskId) await db.delete(schema.tasks).where(and(eq(schema.tasks.id, row.i.taskId), sql`${schema.tasks.doneAt} is null`));
  refresh(row.d.editalId);
  return { ok: true };
}

export async function moveItemAction(itemId: string, dir: "up" | "down"): Promise<Res> {
  await requireAccess("editais", "edit");
  const row = await itemOf(itemId);
  if (!row) return { error: "Item não encontrado." };
  const siblings = await db.select().from(schema.propostaItems).where(and(eq(schema.propostaItems.dossieId, row.d.id), eq(schema.propostaItems.stepKey, row.i.stepKey))).orderBy(asc(schema.propostaItems.position), asc(schema.propostaItems.createdAt));
  const idx = siblings.findIndex((s) => s.id === itemId);
  const other = siblings[dir === "up" ? idx - 1 : idx + 1];
  if (idx < 0 || !other) return { ok: true };
  // troca as posições (se forem iguais, desempata pela ordem atual)
  const a = siblings[idx].position;
  const b = other.position;
  await db.update(schema.propostaItems).set({ position: a === b ? (dir === "up" ? b - 1 : b + 1) : b }).where(eq(schema.propostaItems.id, itemId));
  if (a !== b) await db.update(schema.propostaItems).set({ position: a }).where(eq(schema.propostaItems.id, other.id));
  refresh(row.d.editalId);
  return { ok: true };
}

/** Troca o modelo (opcional) e acrescenta o que falta; cria as tarefas dos itens que ainda não têm. Nunca duplica nem apaga. */
export async function applyChecklistAction(editalId: string, templateKey?: string): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  if (!row) return { error: "Dossiê não encontrado." };
  const key = str(templateKey, 60);
  if (key && key !== row.d.templateKey) {
    const [t] = await db.select({ key: schema.propostaTemplates.key }).from(schema.propostaTemplates).where(and(eq(schema.propostaTemplates.key, key), eq(schema.propostaTemplates.type, "checklist"))).limit(1);
    if (!t) return { error: "Modelo não encontrado." };
    await db.update(schema.propostaDossies).set({ templateKey: key, matrixKey: matrixKeyFor(key), updatedAt: new Date() }).where(eq(schema.propostaDossies.id, row.d.id));
  }
  const { created } = await applyChecklist(user, row.d.id);
  const tasks = has(user, "tarefas", "edit") ? (await syncTasks(user, row.d.id)).created : 0;
  if (created || tasks) await editalNote(editalId, user, "proposta", `Checklist atualizado: ${created} item(ns) novo(s)${tasks ? `, ${tasks} tarefa(s) criada(s)` : ""}`);
  refresh(editalId);
  revalidatePath("/tarefas");
  return { ok: true, created, tasks };
}

export async function syncTasksAction(editalId: string): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  if (!has(user, "tarefas", "edit")) return { error: "Para criar tarefas você precisa de acesso de edição a Tarefas." };
  const row = await dossieOf(editalId);
  if (!row) return { error: "Dossiê não encontrado." };
  const { created } = await syncTasks(user, row.d.id);
  if (created) await editalNote(editalId, user, "tarefa", `${created} tarefa(s) criada(s) no quadro “Editais”`);
  refresh(editalId);
  revalidatePath("/tarefas");
  return { ok: true, created };
}

/* --------------------------------- matriz de habilitação --------------------------------- */

export async function addRequirementAction(editalId: string, title: string, cofreType?: string | null): Promise<Res> {
  await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  const t = str(title, 200);
  if (!row || !t) return { error: "Escreva a exigência." };
  const [{ top }] = await db.select({ top: sql<number>`coalesce(max(${schema.propostaRequirements.position}), -1)::int` }).from(schema.propostaRequirements).where(eq(schema.propostaRequirements.dossieId, row.d.id));
  await db.insert(schema.propostaRequirements).values({ dossieId: row.d.id, title: t, cofreType: str(cofreType, 40) || null, position: top + 1 });
  refresh(editalId);
  return { ok: true };
}

export async function updateRequirementAction(reqId: string, patch: { title?: string; mode?: string; cofreDocId?: string | null; cofreType?: string | null; notes?: string }): Promise<Res> {
  await requireAccess("editais", "edit");
  if (!isId(reqId)) return { error: "Pedido inválido." };
  const [r] = await db.select({ r: schema.propostaRequirements, editalId: schema.propostaDossies.editalId }).from(schema.propostaRequirements).innerJoin(schema.propostaDossies, eq(schema.propostaRequirements.dossieId, schema.propostaDossies.id)).where(eq(schema.propostaRequirements.id, reqId)).limit(1);
  if (!r) return { error: "Exigência não encontrada." };
  const set: Partial<typeof schema.propostaRequirements.$inferInsert> = {};
  if (patch.title !== undefined) {
    const t = str(patch.title, 200);
    if (!t) return { error: "A exigência precisa de um texto." };
    set.title = t;
  }
  if (patch.mode !== undefined) {
    if (!["auto", "na", "ok_manual"].includes(patch.mode)) return { error: "Situação inválida." };
    set.mode = patch.mode;
  }
  if (patch.cofreDocId !== undefined) {
    if (patch.cofreDocId && !isId(patch.cofreDocId)) return { error: "Documento inválido." };
    set.cofreDocId = patch.cofreDocId || null;
  }
  if (patch.cofreType !== undefined) set.cofreType = str(patch.cofreType, 40) || null;
  if (patch.notes !== undefined) set.notes = str(patch.notes, 300) || null;
  await db.update(schema.propostaRequirements).set(set).where(eq(schema.propostaRequirements.id, reqId));
  refresh(r.editalId);
  return { ok: true };
}

export async function removeRequirementAction(reqId: string): Promise<Res> {
  await requireAccess("editais", "edit");
  if (!isId(reqId)) return { error: "Pedido inválido." };
  const [r] = await db.select({ editalId: schema.propostaDossies.editalId }).from(schema.propostaRequirements).innerJoin(schema.propostaDossies, eq(schema.propostaRequirements.dossieId, schema.propostaDossies.id)).where(eq(schema.propostaRequirements.id, reqId)).limit(1);
  if (!r) return { error: "Exigência não encontrada." };
  await db.delete(schema.propostaRequirements).where(eq(schema.propostaRequirements.id, reqId));
  refresh(r.editalId);
  return { ok: true };
}

export async function applyMatrixAction(editalId: string, matrixKey?: string): Promise<Res> {
  await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  if (!row) return { error: "Dossiê não encontrado." };
  const { created } = await applyMatrix(row.d.id, str(matrixKey, 60) || null);
  refresh(editalId);
  return { ok: true, created };
}

/* --------------------------------- documentos, planilha, atestados --------------------------------- */

export async function generateDocsAction(editalId: string, slugs?: string[]): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  if (!has(user, "documentos", "edit")) return { error: "Para gerar documentos você precisa de acesso de edição a Documentos." };
  const row = await dossieOf(editalId);
  if (!row) return { error: "Dossiê não encontrado." };
  const clean = Array.isArray(slugs) ? slugs.filter((s) => typeof s === "string" && /^[a-z0-9-]{1,40}$/.test(s)) : undefined;
  const r = await generateDocs(user, editalId, clean);
  if (r.created.length) {
    await editalNote(editalId, user, "proposta", `Documentos da proposta gerados: ${r.created.map((c) => c.title.split(" — ")[0]).join(", ")}`);
    await audit(user, "proposta_documentos", `Gerou ${r.created.length} documento(s) da proposta`, { entity: "edital", entityId: editalId });
  }
  refresh(editalId);
  revalidatePath("/documentos");
  return { ok: true, created: r.created.length, skipped: r.skipped };
}

export async function createPriceSheetAction(editalId: string): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  if (!has(user, "planilhas", "edit")) return { error: "Para criar a planilha você precisa de acesso de edição a Planilhas." };
  const r = await createPriceSheet(user, editalId);
  if ("error" in r) return r;
  if (r.created) await editalNote(editalId, user, "proposta", "Planilha de preços criada");
  refresh(editalId);
  revalidatePath("/planilhas");
  return { ok: true, id: r.id, created: r.created };
}

/** Sugere atestados do portfólio para o edital (ordenados por aderência). */
export async function suggestAtestadosAction(editalId: string): Promise<Res> {
  await requireAccess("editais");
  if (!isId(editalId)) return { error: "Pedido inválido." };
  return { ok: true, items: await suggestAtestadosFor(editalId) };
}

export async function insertAtestadosAction(editalId: string, portfolioIds: string[]): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  if (!has(user, "documentos", "edit")) return { error: "Para editar a proposta técnica você precisa de acesso de edição a Documentos." };
  const row = await dossieOf(editalId);
  if (!row) return { error: "Dossiê não encontrado." };
  const ids = (Array.isArray(portfolioIds) ? portfolioIds : []).filter(isId).slice(0, 12);
  const items = ids.length ? await db.select().from(schema.portfolioItems) : [];
  const picked = ids.map((id) => items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
  const r = await insertAtestados(user, editalId, picked);
  if ("error" in r) return r;
  await editalNote(editalId, user, "proposta", `${picked.length} atestado(s) do portfólio inseridos na proposta técnica`);
  refresh(editalId);
  revalidatePath("/documentos");
  return { ok: true, docId: r.docId };
}

/* --------------------------------- resultado --------------------------------- */

export async function setResultAction(editalId: string, input: { status: string; reason?: string; value?: string; notes?: string }): Promise<Res> {
  const user = await requireAccess("editais", "edit");
  const row = await dossieOf(editalId);
  if (!row || !isDossieStatus(input.status)) return { error: "Pedido inválido." };
  const status = input.status as DossieStatus;
  const reason = str(input.reason, 200);
  if (LOSS_STATUSES.includes(status) && !reason) return { error: "Escolha o motivo: ele vira aprendizado para as próximas propostas." };
  const cents = Math.round((Number(String(input.value ?? "").replace(/\./g, "").replace(",", ".")) || 0) * 100);
  const reopening = status === "andamento";
  await db
    .update(schema.propostaDossies)
    .set({ status, resultReason: reopening ? null : reason || null, resultValueCents: reopening ? null : cents || null, resultNotes: reopening ? null : str(input.notes, 600) || null, resultAt: reopening ? null : new Date(), updatedAt: new Date() })
    .where(eq(schema.propostaDossies.id, row.d.id));
  // reflete no edital (triagem) e no negócio
  const triage = status === "ganhou" ? "ganho" : status === "perdeu" || status === "desclassificada" ? "perdido" : status === "desistiu" ? "descartado" : row.e.triage === "ganho" || row.e.triage === "perdido" || row.e.triage === "descartado" ? "em_proposta" : row.e.triage;
  await db.update(schema.editais).set({ triage, discardReason: status === "desistiu" ? `Desistimos: ${reason}` : null, updatedAt: new Date() }).where(eq(schema.editais.id, editalId));
  const label = { ganhou: "Ganhou", perdeu: "Perdeu", desclassificada: "Desclassificada", desistiu: "Desistimos", andamento: "Reaberta" }[status];
  await editalNote(editalId, user, "proposta", `Resultado: ${label}${reason ? ` — ${reason}` : ""}`);
  if (status === "ganhou") {
    const m = await moveDealFor(user, row.e.dealId, "ganho");
    if (m) await editalNote(editalId, user, "negocio", `Negócio movido para “${m}”`);
  } else if (status === "perdeu" || status === "desclassificada" || status === "desistiu") {
    const m = await moveDealFor(user, row.e.dealId, "perdido", { lostReason: reason });
    if (m) await editalNote(editalId, user, "negocio", `Negócio movido para “${m}” (motivo: ${reason})`);
  }
  // a etapa “Resultado” acompanha
  await db.update(schema.propostaSteps).set({ status: reopening ? "a_fazer" : "concluida", doneAt: reopening ? null : new Date() }).where(and(eq(schema.propostaSteps.dossieId, row.d.id), eq(schema.propostaSteps.key, "resultado")));
  await audit(user, "proposta_resultado", `Resultado de uma proposta: ${label}`, { entity: "edital", entityId: editalId, meta: { reason } });
  refresh(editalId);
  revalidatePath("/", "layout");
  return { ok: true };
}
