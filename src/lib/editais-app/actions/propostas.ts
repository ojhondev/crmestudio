"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { editalNote, toggleItem } from "@/lib/propostas/ops";
import { STEP_BY_KEY, isStepKey, isStepStatus } from "@/lib/propostas/types";
import {
  addItemAction as engineAddItem,
  generateDocsAction,
  recalcDeadlinesAction,
  removeItemAction as engineRemoveItem,
  setStepAction as engineSetStep,
  syncTasksAction,
  updateDossieAction,
  updateItemAction as engineUpdateItem,
} from "@/app/(app)/editais-avancado/proposta-actions";
import { accessTo, shareFor } from "../authz";
import { notifyAssigned } from "../collab";
import { partnerMayWorkOn, STAFF_ONLY_STEPS, type EditaisActor } from "../access";
import { requireEditais } from "../session";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
type Err = { error: string };
type Ok = { ok: true };
const errOf = (r: unknown): string | null => (r && typeof r === "object" && "error" in r && (r as Err).error ? (r as Err).error : null);

function refresh(editalId: string) {
  revalidatePath("/editais", "layout");
  revalidatePath(`/editais/propostas/${editalId}`);
}

async function itemWithEdital(itemId: string) {
  if (!isId(itemId)) return null;
  const [r] = await db
    .select({ i: schema.propostaItems, editalId: schema.propostaDossies.editalId })
    .from(schema.propostaItems)
    .innerJoin(schema.propostaDossies, eq(schema.propostaItems.dossieId, schema.propostaDossies.id))
    .where(eq(schema.propostaItems.id, itemId))
    .limit(1);
  return r ?? null;
}

const staffEdit = (a: EditaisActor) => a.kind === "staff" && atLeast(a.level, "edit");

/** Marca/desmarca um item do checklist. Equipe: qualquer item. Parceiro: só o que foi atribuído a ele e só se pode contribuir. */
export async function toggleItemAction(itemId: string, done: boolean): Promise<Err | Ok> {
  const { actor, user } = await requireEditais();
  const row = await itemWithEdital(itemId);
  if (!row) return { error: "Item não encontrado." };
  if (actor.kind === "staff") {
    if (!staffEdit(actor)) return { error: "Seu acesso a Editais é só de consulta." };
  } else {
    const share = await shareFor(actor, row.editalId);
    if (!partnerMayWorkOn(actor, share, row.i.assigneeId)) return { error: "Este item não está atribuído a você." };
  }
  const r = await toggleItem(user, itemId, !!done);
  if ("error" in r) return r;
  if (actor.kind === "partner") await editalNote(row.editalId, user, "proposta", `${done ? "Concluiu" : "Reabriu"} (parceiro): ${row.i.title.slice(0, 120)}`);
  refresh(row.editalId);
  return { ok: true };
}

/** Muda a situação de uma etapa. Parceiro: só etapas atribuídas a ele, exceto envio e resultado. */
export async function stepStatusAction(editalId: string, key: string, status: string): Promise<Err | Ok> {
  const { actor, user } = await requireEditais();
  if (!isId(editalId) || !isStepKey(key) || !isStepStatus(status)) return { error: "Pedido inválido." };
  if (actor.kind === "staff") {
    if (!staffEdit(actor)) return { error: "Seu acesso a Editais é só de consulta." };
    const r = await engineSetStep(editalId, key, { status });
    const e = errOf(r);
    return e ? { error: e } : { ok: true };
  }
  if ((STAFF_ONLY_STEPS as readonly string[]).includes(key)) return { error: "Esta etapa é conduzida pela equipe." };
  const share = await shareFor(actor, editalId);
  const [step] = await db
    .select({ s: schema.propostaSteps })
    .from(schema.propostaSteps)
    .innerJoin(schema.propostaDossies, eq(schema.propostaSteps.dossieId, schema.propostaDossies.id))
    .where(and(eq(schema.propostaDossies.editalId, editalId), eq(schema.propostaSteps.key, key)))
    .limit(1);
  if (!step || !partnerMayWorkOn(actor, share, step.s.assigneeId)) return { error: "Esta etapa não está atribuída a você." };
  await db.update(schema.propostaSteps).set({ status, doneAt: status === "concluida" ? new Date() : null }).where(eq(schema.propostaSteps.id, step.s.id));
  await editalNote(editalId, user, "proposta", `Etapa “${STEP_BY_KEY[key].label}” (parceiro): ${status === "concluida" ? "concluída" : status === "em_andamento" ? "em andamento" : "reaberta"}`);
  refresh(editalId);
  return { ok: true };
}

export async function addItemAction(editalId: string, stepKey: string, title: string, dueDay?: string | null): Promise<Err | Ok> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe adiciona itens." };
  const r = await engineAddItem(editalId, stepKey, title, dueDay);
  const e = errOf(r);
  return e ? { error: e } : { ok: true };
}

export async function removeItemAction(itemId: string): Promise<Err | Ok> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe remove itens." };
  const r = await engineRemoveItem(itemId);
  const e = errOf(r);
  return e ? { error: e } : { ok: true };
}

/** Atribui o item (a equipe ou um parceiro que contribui nesta proposta). O parceiro recebe um aviso. */
export async function assignItemAction(itemId: string, assigneeId: string | null): Promise<Err | Ok> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe atribui itens." };
  const row = await itemWithEdital(itemId);
  if (!row) return { error: "Item não encontrado." };
  if (assigneeId) {
    const [u] = await db.select({ profile: schema.users.profile }).from(schema.users).where(eq(schema.users.id, assigneeId)).limit(1);
    if (u?.profile === "parceiro_editais") {
      // parceiro só recebe item de proposta que enxerga e em que pode contribuir
      const [sh] = await db
        .select({ id: schema.editalShares.id })
        .from(schema.editalShares)
        .where(and(eq(schema.editalShares.editalId, row.editalId), eq(schema.editalShares.partnerId, assigneeId), eq(schema.editalShares.scope, "proposta"), eq(schema.editalShares.role, "contribuir")))
        .limit(1);
      if (!sh) return { error: "Compartilhe a proposta com este parceiro (com “Pode contribuir”) antes de atribuir tarefas." };
    }
  }
  const r = await engineUpdateItem(itemId, { assigneeId });
  const e = errOf(r);
  if (e) return { error: e };
  if (assigneeId) await notifyAssigned(actor, assigneeId, row.editalId, row.i.title, itemId);
  return { ok: true };
}

export async function stepAssigneeAction(editalId: string, key: string, assigneeId: string | null): Promise<Err | Ok> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe atribui etapas." };
  const r = await engineSetStep(editalId, key, { assigneeId });
  const e = errOf(r);
  return e ? { error: e } : { ok: true };
}

export async function dossieDataAction(editalId: string, patch: { numero?: string; processo?: string; sessionAt?: string | null; ownerId?: string | null }): Promise<Err | Ok> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe altera os dados da proposta." };
  const r = await updateDossieAction(editalId, patch);
  const e = errOf(r);
  return e ? { error: e } : { ok: true };
}

export async function recalcAction(editalId: string): Promise<Err | Ok> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe recalcula prazos." };
  const r = await recalcDeadlinesAction(editalId);
  const e = errOf(r);
  if (!e) refresh(editalId);
  return e ? { error: e } : { ok: true };
}

export async function generateDocsFlowAction(editalId: string): Promise<Err | { ok: true; created: number }> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe gera documentos." };
  const r = (await generateDocsAction(editalId)) as { created?: number; error?: string };
  if (r.error) return { error: r.error };
  refresh(editalId);
  return { ok: true, created: r.created ?? 0 };
}

export async function syncTasksFlowAction(editalId: string): Promise<Err | { ok: true; created: number }> {
  const { actor } = await requireEditais();
  if (!staffEdit(actor)) return { error: "Só a equipe cria tarefas." };
  const r = (await syncTasksAction(editalId)) as { created?: number; error?: string };
  if (r.error) return { error: r.error };
  refresh(editalId);
  return { ok: true, created: r.created ?? 0 };
}

/** Quem pode ver a proposta: usado pelas telas para checar antes de abrir os assistentes. */
export async function canOpenProposta(editalId: string): Promise<boolean> {
  const { actor } = await requireEditais();
  return (await accessTo(actor, editalId)).proposta;
}
