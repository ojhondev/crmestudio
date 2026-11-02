"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireUser, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { disconnect, getConnection, isLive } from "@/lib/contacts-import/google";
import { existingFor, finishBatch, googlePage, importChunk, listPending, startBatch, syncConnection, undoBatch, type StartInput } from "@/lib/contacts-import/service";
import type { Candidate, Existing } from "@/lib/contacts-import/types";

/** Quem pode importar: edita contatos e não é "só os próprios" (parceiros não importam). */
async function importer(): Promise<SessionUser> {
  const user = await requireUser();
  if (!has(user, "contatos", "edit") || user.ownOnly) redirect("/?negado=1");
  return user;
}
const actor = (u: SessionUser) => ({ id: u.id, name: u.name });

/** Contatos do CRM que coincidem com um trecho da lista (para a prévia). */
export async function checkExisting(items: Candidate[]): Promise<Existing[]> {
  await importer();
  if (!Array.isArray(items) || items.length > 1000) return [];
  return existingFor(items);
}

export async function startImport(input: StartInput) {
  const user = await importer();
  const b = await startBatch(actor(user), input);
  return { id: b.id, label: b.label, source: b.source };
}

export async function importPart(batchId: string, ownerId: string | null, items: Candidate[]) {
  const user = await importer();
  if (!Array.isArray(items)) return { error: "Dados inválidos." };
  return importChunk(actor(user), batchId, ownerId, items);
}

export async function finishImport(batchId: string, syncToken: string | null, pendingExternalIds: string[]): Promise<{ error: string } | { id: string; created: number; updated: number; skipped: number }> {
  const user = await importer();
  const r = await finishBatch(actor(user), batchId, { syncToken, pendingExternalIds });
  revalidatePath("/contatos", "layout");
  if ("error" in r && r.error) return { error: r.error };
  if (!("batch" in r) || !r.batch) return { error: "Importação não encontrada." };
  return { created: r.batch.created, updated: r.batch.updated, skipped: r.batch.skipped, id: r.batch.id };
}

export async function undoImport(batchId: string) {
  const user = await importer();
  const r = await undoBatch({ ...actor(user), canManage: has(user, "contatos", "manage") }, batchId);
  revalidatePath("/contatos", "layout");
  return r;
}

/** Uma página do Google Contatos (até 1000). O navegador chama em laço até acabar, mostrando o progresso. */
export async function googleContactsPage(pageToken: string | null) {
  const user = await importer();
  return googlePage(actor(user), { pageToken });
}

export async function pendingList(): Promise<Candidate[]> {
  const user = await importer();
  return listPending(user.id);
}

export async function discardPending() {
  const user = await importer();
  const c = await getConnection(user.id);
  if (c) await db.delete(schema.contactPending).where(eq(schema.contactPending.connectionId, c.id));
  revalidatePath("/contatos/importar");
  return { ok: true };
}

export async function syncNow() {
  const user = await importer();
  const c = await getConnection(user.id);
  if (!isLive(c)) return { ok: false, error: "O Google Contatos não está conectado." };
  const r = await syncConnection(c.id);
  revalidatePath("/contatos", "layout");
  if (!r.ok) return { ok: false, error: r.error ?? (r.skipped === "sem_importacao_inicial" ? "Faça primeiro a importação completa dos contatos." : "Não foi possível sincronizar.") };
  return { ok: true, created: r.created, updated: r.updated, pending: r.pending, fetched: r.fetched };
}

export async function saveAuto(autoSync: boolean, autoMode: "confirmar" | "direto") {
  const user = await importer();
  const c = await getConnection(user.id);
  if (!isLive(c)) return { ok: false, error: "O Google Contatos não está conectado." };
  await db
    .update(schema.contactConnections)
    .set({ autoSync: !!autoSync, autoMode: autoMode === "direto" ? "direto" : "confirmar", updatedAt: new Date() })
    .where(eq(schema.contactConnections.id, c.id));
  await audit(user, "contatos_sync_config", `Sincronização automática do Google Contatos: ${autoSync ? `ligada (${autoMode === "direto" ? "entram direto" : "aguardam confirmação"})` : "desligada"}`, { entity: "contato" });
  revalidatePath("/contatos/importar");
  return { ok: true };
}

export async function disconnectGoogle() {
  const user = await importer();
  await disconnect(user.id);
  await audit(user, "contatos_google_desconectado", "Desconectou o Google Contatos (contatos já importados foram mantidos)", { entity: "contato" });
  revalidatePath("/contatos/importar");
  return { ok: true };
}
