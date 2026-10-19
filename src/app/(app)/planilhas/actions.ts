"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dealScope } from "@/lib/deals";
import { getSheet, insertSheet, loadTabs, maybeSnapshot, replaceTabs } from "@/lib/sheets/server";
import { isTemplateKey, templateTabs } from "@/lib/sheets/templates";
import type { TabData } from "@/lib/sheets/types";

const str = (v: unknown, max = 160) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function checkLinks(user: Awaited<ReturnType<typeof requireAccess>>, dealId?: string | null, contactId?: string | null) {
  let deal: string | null = null;
  let contact: string | null = null;
  if (dealId) {
    const [d] = await db.select({ id: schema.deals.id, contactId: schema.deals.contactId }).from(schema.deals).where(and(eq(schema.deals.id, dealId), dealScope(user))).limit(1);
    if (!d) return { error: "Negócio não encontrado." } as const;
    deal = d.id;
    contact = d.contactId;
  }
  if (contactId) {
    const [c] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1);
    if (!c) return { error: "Contato não encontrado." } as const;
    contact = c.id;
  }
  return { deal, contact } as const;
}

export async function createSheet(input: { template?: string; name?: string; dealId?: string | null; contactId?: string | null }) {
  const user = await requireAccess("planilhas", "edit");
  const links = await checkLinks(user, input.dealId, input.contactId);
  if ("error" in links) return { error: links.error };
  const key = isTemplateKey(input.template) ? input.template : "branca";
  const tpl = templateTabs(key);
  const name = str(input.name) || tpl.name;
  const sheet = await insertSheet({ name, ownerId: user.id, tabs: tpl.tabs, dealId: links.deal, contactId: links.contact, meta: { origem: key } });
  await audit(user, "planilha_criada", `Criou a planilha “${name}”`, { entity: "planilha", entityId: sheet.id });
  revalidatePath("/planilhas");
  redirect(`/planilhas/${sheet.id}`);
}

export async function renameSheet(id: string, name: string) {
  const user = await requireAccess("planilhas", "edit");
  const sheet = await getSheet(id, user);
  if (!sheet) return { error: "Planilha não encontrada." };
  const n = str(name);
  if (!n) return { error: "Dê um nome à planilha." };
  await db.update(schema.sheets).set({ name: n, updatedAt: new Date() }).where(eq(schema.sheets.id, id));
  revalidatePath("/planilhas");
  return { ok: true as const, name: n };
}

export async function toggleFavorite(id: string, favorite: boolean) {
  const user = await requireAccess("planilhas", "view");
  const sheet = await getSheet(id, user);
  if (!sheet) return { error: "Planilha não encontrada." };
  await db.update(schema.sheets).set({ favorite }).where(eq(schema.sheets.id, id));
  revalidatePath("/planilhas");
  return { ok: true as const };
}

export async function linkSheet(id: string, dealId: string | null, contactId: string | null) {
  const user = await requireAccess("planilhas", "edit");
  const sheet = await getSheet(id, user);
  if (!sheet) return { error: "Planilha não encontrada." };
  const links = await checkLinks(user, dealId, contactId);
  if ("error" in links) return { error: links.error };
  await db.update(schema.sheets).set({ dealId: links.deal, contactId: links.contact, updatedAt: new Date() }).where(eq(schema.sheets.id, id));
  revalidatePath("/planilhas");
  revalidatePath(`/planilhas/${id}`);
  return { ok: true as const };
}

export async function duplicateSheet(id: string) {
  const user = await requireAccess("planilhas", "edit");
  const sheet = await getSheet(id, user);
  if (!sheet) return { error: "Planilha não encontrada." };
  const tabs = await loadTabs(id);
  const copy = await insertSheet({ name: `Cópia de ${sheet.name}`.slice(0, 160), ownerId: user.id, tabs, dealId: sheet.dealId, contactId: sheet.contactId });
  await audit(user, "planilha_criada", `Duplicou a planilha “${sheet.name}”`, { entity: "planilha", entityId: copy.id });
  revalidatePath("/planilhas");
  redirect(`/planilhas/${copy.id}`);
}

export async function deleteSheet(id: string) {
  const user = await requireAccess("planilhas", "manage");
  const sheet = await getSheet(id, user);
  if (!sheet) return { error: "Planilha não encontrada." };
  await db.delete(schema.sheets).where(eq(schema.sheets.id, id));
  await audit(user, "planilha_excluida", `Excluiu a planilha “${sheet.name}”`, { entity: "planilha", entityId: id });
  revalidatePath("/planilhas");
  return { ok: true as const };
}

/* ------------------------------- histórico de versões ------------------------------- */

export async function listVersions(id: string) {
  const user = await requireAccess("planilhas", "view");
  const sheet = await getSheet(id, user);
  if (!sheet) return [];
  const rows = await db
    .select({ id: schema.sheetVersions.id, label: schema.sheetVersions.label, createdAt: schema.sheetVersions.createdAt, by: schema.users.name })
    .from(schema.sheetVersions)
    .leftJoin(schema.users, eq(schema.sheetVersions.createdById, schema.users.id))
    .where(eq(schema.sheetVersions.sheetId, id))
    .orderBy(desc(schema.sheetVersions.createdAt))
    .limit(40);
  return rows.map((r) => ({ id: r.id, label: r.label, at: r.createdAt.toISOString(), by: r.by }));
}

export async function createVersion(id: string, label: string) {
  const user = await requireAccess("planilhas", "edit");
  const sheet = await getSheet(id, user);
  if (!sheet) return { error: "Planilha não encontrada." };
  await maybeSnapshot(id, user.id, { force: true, label: str(label, 80) || "Versão salva" });
  return { ok: true as const };
}

export async function restoreVersion(id: string, versionId: number) {
  const user = await requireAccess("planilhas", "edit");
  const sheet = await getSheet(id, user);
  if (!sheet) return { error: "Planilha não encontrada." };
  const [v] = await db.select().from(schema.sheetVersions).where(and(eq(schema.sheetVersions.id, versionId), eq(schema.sheetVersions.sheetId, id))).limit(1);
  if (!v) return { error: "Versão não encontrada." };
  await maybeSnapshot(id, user.id, { force: true, label: "Antes de restaurar" });
  const { sanitizeTab } = await import("@/lib/sheets/sanitize");
  const tabs = (Array.isArray(v.snapshot) ? v.snapshot : []).map((t, i) => sanitizeTab(t, `t${i}`)) as TabData[];
  await replaceTabs(id, tabs);
  await db.update(schema.sheets).set({ version: sheet.version + 1, updatedAt: new Date() }).where(eq(schema.sheets.id, id));
  await audit(user, "planilha_restaurada", `Restaurou uma versão da planilha “${sheet.name}”`, { entity: "planilha", entityId: id });
  revalidatePath(`/planilhas/${id}`);
  return { ok: true as const };
}
