"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { detectDriveUrl, KINDS } from "@/lib/drive/detect";
import type { DriveKind } from "@/lib/db/schema";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
const tagsOf = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((t) => str(t, 40).toLowerCase()).filter(Boolean))].slice(0, 12) : []);
const refresh = () => {
  revalidatePath("/drive");
  revalidatePath("/negocios/[id]", "page");
  revalidatePath("/contatos/[id]", "page");
};

export type ItemInput = {
  url: string;
  title?: string;
  kind?: DriveKind | "";
  folderId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  project?: string;
  tags?: string[];
  notes?: string;
};

async function checkRefs(i: { folderId: string | null; contactId: string | null; dealId: string | null }) {
  if (i.folderId && !(await db.select({ id: schema.driveFolders.id }).from(schema.driveFolders).where(eq(schema.driveFolders.id, i.folderId)).limit(1)).length) return "Pasta não encontrada.";
  if (i.contactId && !(await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.id, i.contactId)).limit(1)).length) return "Cliente não encontrado.";
  if (i.dealId && !(await db.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.id, i.dealId)).limit(1)).length) return "Negócio não encontrado.";
  return null;
}

/** Registra um link do Drive (pasta ou arquivo) no CRM. */
export async function addLink(input: ItemInput): Promise<Result<{ id: string }>> {
  const user = await requireAccess("drive", "edit");
  const d = detectDriveUrl(str(input.url, 2000));
  if (!d.ok) return { ok: false, error: d.error };
  const refs = { folderId: uuidOrNull(input.folderId), contactId: uuidOrNull(input.contactId), dealId: uuidOrNull(input.dealId) };
  const bad = await checkRefs(refs);
  if (bad) return { ok: false, error: bad };
  const kind = (KINDS as string[]).includes(input.kind ?? "") ? (input.kind as DriveKind) : d.kind;
  const title = str(input.title, 200) || (kind === "pasta" ? "Pasta do Drive" : "Arquivo do Drive");
  const [row] = await db
    .insert(schema.driveItems)
    .values({ provider: "links", kind, title, url: d.url, externalId: d.externalId, ...refs, project: str(input.project, 160) || null, tags: tagsOf(input.tags), notes: str(input.notes, 2000) || null, createdById: user.id })
    .returning({ id: schema.driveItems.id });
  await audit(user, "drive_link_criado", `Registrou o ${kind === "pasta" ? "pasta" : "arquivo"} “${title}” do Drive`, { entity: "drive", entityId: row.id });
  refresh();
  return { ok: true, id: row.id };
}

export async function updateItem(id: string, input: Omit<ItemInput, "url"> & { url?: string }): Promise<Result> {
  const user = await requireAccess("drive", "edit");
  if (!UUID.test(id)) return { ok: false, error: "Item inválido." };
  const refs = { folderId: uuidOrNull(input.folderId), contactId: uuidOrNull(input.contactId), dealId: uuidOrNull(input.dealId) };
  const bad = await checkRefs(refs);
  if (bad) return { ok: false, error: bad };
  const set: Partial<typeof schema.driveItems.$inferInsert> = {
    ...refs,
    title: str(input.title, 200) || "Sem título",
    project: str(input.project, 160) || null,
    tags: tagsOf(input.tags),
    notes: str(input.notes, 2000) || null,
    updatedAt: new Date(),
  };
  if (input.url) {
    const d = detectDriveUrl(str(input.url, 2000));
    if (!d.ok) return { ok: false, error: d.error };
    set.url = d.url;
    set.externalId = d.externalId;
  }
  if ((KINDS as string[]).includes(input.kind ?? "")) set.kind = input.kind as DriveKind;
  const [row] = await db.update(schema.driveItems).set(set).where(eq(schema.driveItems.id, id)).returning({ title: schema.driveItems.title });
  if (!row) return { ok: false, error: "Item não encontrado." };
  await audit(user, "drive_link_editado", `Editou o item “${row.title}” do Drive`, { entity: "drive", entityId: id });
  refresh();
  return { ok: true };
}

export async function moveItem(id: string, folderId: string | null): Promise<Result> {
  const user = await requireAccess("drive", "edit");
  if (!UUID.test(id)) return { ok: false, error: "Item inválido." };
  const target = uuidOrNull(folderId);
  const bad = await checkRefs({ folderId: target, contactId: null, dealId: null });
  if (bad) return { ok: false, error: bad };
  const [row] = await db.update(schema.driveItems).set({ folderId: target, updatedAt: new Date() }).where(eq(schema.driveItems.id, id)).returning({ title: schema.driveItems.title });
  if (!row) return { ok: false, error: "Item não encontrado." };
  await audit(user, "drive_link_movido", `Moveu “${row.title}” para outra pasta do CRM`, { entity: "drive", entityId: id });
  refresh();
  return { ok: true };
}

export async function toggleFavorite(id: string, value: boolean): Promise<Result> {
  await requireAccess("drive", "edit");
  if (!UUID.test(id)) return { ok: false, error: "Item inválido." };
  await db.update(schema.driveItems).set({ favorite: !!value }).where(eq(schema.driveItems.id, id));
  refresh();
  return { ok: true };
}

export async function deleteItem(id: string): Promise<Result> {
  const user = await requireAccess("drive", "manage");
  if (!UUID.test(id)) return { ok: false, error: "Item inválido." };
  const [row] = await db.delete(schema.driveItems).where(eq(schema.driveItems.id, id)).returning({ title: schema.driveItems.title });
  if (!row) return { ok: false, error: "Item não encontrado." };
  await audit(user, "drive_link_excluido", `Removeu “${row.title}” do CRM (o arquivo continua no Drive)`, { entity: "drive", entityId: id });
  refresh();
  return { ok: true };
}

/* --------------------------------- pastas virtuais --------------------------------- */

export async function createFolder(name: string, parentId: string | null): Promise<Result<{ id: string }>> {
  const user = await requireAccess("drive", "edit");
  const n = str(name, 120);
  if (!n) return { ok: false, error: "Dê um nome para a pasta." };
  const parent = uuidOrNull(parentId);
  const bad = await checkRefs({ folderId: parent, contactId: null, dealId: null });
  if (bad) return { ok: false, error: bad };
  const [f] = await db.insert(schema.driveFolders).values({ name: n, parentId: parent, createdById: user.id }).returning({ id: schema.driveFolders.id });
  await audit(user, "drive_pasta_criada", `Criou a pasta “${n}” no Drive do CRM`, { entity: "drive_pasta", entityId: f.id });
  refresh();
  return { ok: true, id: f.id };
}

export async function renameFolder(id: string, name: string): Promise<Result> {
  const user = await requireAccess("drive", "edit");
  const n = str(name, 120);
  if (!UUID.test(id) || !n) return { ok: false, error: "Nome inválido." };
  await db.update(schema.driveFolders).set({ name: n }).where(eq(schema.driveFolders.id, id));
  await audit(user, "drive_pasta_editada", `Renomeou uma pasta do Drive do CRM para “${n}”`, { entity: "drive_pasta", entityId: id });
  refresh();
  return { ok: true };
}

/** Exclui a pasta virtual: subpastas sobem um nível e os itens vão para a raiz (nada é apagado do Drive). */
export async function deleteFolder(id: string): Promise<Result> {
  const user = await requireAccess("drive", "manage");
  if (!UUID.test(id)) return { ok: false, error: "Pasta inválida." };
  const [f] = await db.select().from(schema.driveFolders).where(eq(schema.driveFolders.id, id)).limit(1);
  if (!f) return { ok: false, error: "Pasta não encontrada." };
  await db.update(schema.driveFolders).set({ parentId: f.parentId }).where(eq(schema.driveFolders.parentId, id));
  await db.update(schema.driveItems).set({ folderId: f.parentId }).where(eq(schema.driveItems.folderId, id));
  await db.delete(schema.driveFolders).where(eq(schema.driveFolders.id, id));
  await audit(user, "drive_pasta_excluida", `Excluiu a pasta “${f.name}” do Drive do CRM (itens preservados)`, { entity: "drive_pasta", entityId: id });
  refresh();
  return { ok: true };
}

/* ------------------------------------- Google ------------------------------------- */

export async function disconnectGoogle(): Promise<Result> {
  const user = await requireAccess("drive", "manage");
  await db.delete(schema.driveConnections).where(eq(schema.driveConnections.provider, "google"));
  await audit(user, "drive_desconectado", "Desconectou o Google Drive", { entity: "drive" });
  revalidatePath("/drive/conexao");
  return { ok: true };
}

/** Registra no CRM um arquivo/pasta navegado pela API do Google. */
export async function importGoogleEntry(e: { id: string; name: string; url: string | null; kind: DriveKind }, folderId: string | null): Promise<Result> {
  const user = await requireAccess("drive", "edit");
  const d = e.url ? detectDriveUrl(e.url) : null;
  if (!d || !d.ok) return { ok: false, error: "Item sem link." };
  const [row] = await db
    .insert(schema.driveItems)
    .values({ provider: "google", kind: (KINDS as string[]).includes(e.kind) ? e.kind : d.kind, title: str(e.name, 200) || "Arquivo do Drive", url: d.url, externalId: str(e.id, 200), folderId: uuidOrNull(folderId), createdById: user.id })
    .returning({ id: schema.driveItems.id });
  await audit(user, "drive_link_criado", `Registrou “${e.name}” do Google Drive no CRM`, { entity: "drive", entityId: row.id });
  refresh();
  return { ok: true };
}
