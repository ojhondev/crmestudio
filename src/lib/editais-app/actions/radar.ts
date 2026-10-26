"use server";

import { revalidatePath } from "next/cache";
import { has } from "@/lib/auth";
import { requestScanAction, setOwner, setTriage } from "@/app/(app)/editais-avancado/actions";
import { staffCan, isRole, isScope } from "../access";
import { addComment, markInterest, reviewDocument, type CommentInput } from "../collab";
import { shareEditais, unshare, updateShare, type ShareInput } from "../partners";
import { parseRadar } from "../radar-filters";
import { radarPage, type RadarCard } from "../radar";
import { requireEditais } from "../session";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
type Err = { error: string };

function refresh() {
  revalidatePath("/editais", "layout");
}

/** “Tenho interesse”: a equipe marca na triagem; o parceiro registra o interesse na conversa. */
export async function interestAction(editalId: string): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  if (!isId(editalId)) return { error: "Pedido inválido." };
  if (actor.kind === "partner") {
    const r = await markInterest(actor, editalId);
    refresh();
    return r;
  }
  if (!staffCan(actor, "edit")) return { error: "Seu acesso a Editais é só de consulta." };
  const r = await setTriage(editalId, "interessante");
  refresh();
  return "error" in r && r.error ? { error: r.error } : { ok: true };
}

/** Descarta com o motivo escolhido (1 toque). Só a equipe. */
export async function discardAction(editalId: string, reason: string): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  if (!staffCan(actor, "edit")) return { error: "Só a equipe pode descartar." };
  const r = await setTriage(editalId, "descartado", reason);
  refresh();
  return "error" in r && r.error ? { error: r.error } : { ok: true };
}

/** Volta um edital descartado para “novo”. */
export async function restoreAction(editalId: string): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  if (!staffCan(actor, "edit")) return { error: "Só a equipe pode restaurar." };
  const r = await setTriage(editalId, "novo");
  refresh();
  return "error" in r && r.error ? { error: r.error } : { ok: true };
}

export async function ownerAction(editalId: string, ownerId: string | null): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  if (!staffCan(actor, "edit")) return { error: "Só a equipe pode mudar o responsável." };
  const r = await setOwner(editalId, ownerId);
  refresh();
  return "error" in r && r.error ? { error: r.error } : { ok: true };
}

/** Botão “Buscar oportunidades”. */
export async function scanAction() {
  const { actor, user } = await requireEditais();
  if (!staffCan(actor, "edit") || !has(user, "editais", "edit")) return { error: "Só a equipe pode buscar oportunidades." } as Err;
  return requestScanAction();
}

/** “Carregar mais” do Radar: a próxima página com os MESMOS filtros (a autorização é refeita aqui). */
export async function radarMoreAction(query: string, page: number): Promise<{ rows: RadarCard[]; hasMore: boolean } | Err> {
  const { actor } = await requireEditais();
  const sp = new URLSearchParams(typeof query === "string" ? query.slice(0, 600) : "");
  const f = { ...parseRadar(sp, { partner: actor.kind === "partner" }), page: Math.max(2, Math.min(50, Number(page) || 2)) };
  return radarPage(actor, f);
}

/* ------------------------------ compartilhar ------------------------------ */

export async function shareAction(input: ShareInput): Promise<Err | { ok: true; created: number; updated: number }> {
  const { actor } = await requireEditais();
  if (!staffCan(actor, "edit")) return { error: "Só a equipe compartilha editais." };
  if (!isRole(input.role) || !isScope(input.scope)) return { error: "Pedido inválido." };
  const r = await shareEditais({ id: actor.id, name: actor.name }, input);
  refresh();
  return r;
}

export async function unshareAction(editalId: string, partnerId: string): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  if (!staffCan(actor, "edit")) return { error: "Só a equipe altera compartilhamentos." };
  const r = await unshare({ id: actor.id, name: actor.name }, editalId, partnerId);
  refresh();
  return r;
}

export async function updateShareAction(shareId: string, patch: { role?: string; scope?: string; showDocs?: boolean; showSheet?: boolean; docIds?: string[] }): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  if (!staffCan(actor, "edit")) return { error: "Só a equipe altera compartilhamentos." };
  const r = await updateShare(shareId, patch);
  refresh();
  return r;
}

/* ------------------------------ conversa ------------------------------ */

export async function commentAction(input: CommentInput): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  const r = await addComment(actor, input);
  if ("error" in r) return r;
  refresh();
  return { ok: true };
}

export async function reviewAction(commentId: string, status: "aprovado" | "ajustar"): Promise<Err | { ok: true }> {
  const { actor } = await requireEditais();
  if (!staffCan(actor, "edit")) return { error: "Só a equipe revisa documentos." };
  const r = await reviewDocument(actor, commentId, status);
  refresh();
  return r;
}
