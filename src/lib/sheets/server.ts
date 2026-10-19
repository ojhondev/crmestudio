import "server-only";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { joinTab, sanitizeTab, splitTab } from "./sanitize";
import type { TabData } from "./types";

/** Quem tem "só os próprias" vê apenas as planilhas que criou. */
export function sheetScope(user: SessionUser): SQL | undefined {
  return user.ownOnly ? eq(schema.sheets.ownerId, user.id) : undefined;
}

export async function getSheet(id: string, user: SessionUser) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(schema.sheets)
    .where(and(eq(schema.sheets.id, id), sheetScope(user)))
    .limit(1);
  return row ?? null;
}

export async function loadTabs(sheetId: string): Promise<TabData[]> {
  const rows = await db.select().from(schema.sheetTabs).where(eq(schema.sheetTabs.sheetId, sheetId)).orderBy(asc(schema.sheetTabs.position));
  return rows.map((r) => joinTab(r));
}

/** Cria uma planilha com as abas dadas (ids novos). */
export async function insertSheet(opts: { name: string; ownerId: string; tabs: TabData[]; dealId?: string | null; contactId?: string | null; meta?: Record<string, unknown> }) {
  const [sheet] = await db
    .insert(schema.sheets)
    .values({ name: opts.name.slice(0, 160), ownerId: opts.ownerId, dealId: opts.dealId ?? null, contactId: opts.contactId ?? null, meta: opts.meta ?? null })
    .returning();
  const tabs = opts.tabs.length ? opts.tabs : [sanitizeTab({ name: "Planilha1" })];
  for (let i = 0; i < tabs.length; i++) {
    const { grid, layout } = splitTab(tabs[i]);
    await db.insert(schema.sheetTabs).values({ sheetId: sheet.id, name: tabs[i].name, position: i, grid, layout });
  }
  return sheet;
}

const VERSION_EVERY_MS = 10 * 60_000;
const KEEP_VERSIONS = 40;

/** Guarda um instantâneo se o último tem mais de 10 minutos (ou se `force`). */
export async function maybeSnapshot(sheetId: string, userId: string, opts: { force?: boolean; label?: string } = {}) {
  if (!opts.force) {
    const [last] = await db.select({ at: schema.sheetVersions.createdAt }).from(schema.sheetVersions).where(eq(schema.sheetVersions.sheetId, sheetId)).orderBy(desc(schema.sheetVersions.createdAt)).limit(1);
    if (last && Date.now() - last.at.getTime() < VERSION_EVERY_MS) return false;
  }
  const tabs = await loadTabs(sheetId);
  await db.insert(schema.sheetVersions).values({ sheetId, label: opts.label ?? null, snapshot: tabs, createdById: userId });
  const old = await db
    .select({ id: schema.sheetVersions.id })
    .from(schema.sheetVersions)
    .where(eq(schema.sheetVersions.sheetId, sheetId))
    .orderBy(desc(schema.sheetVersions.createdAt))
    .offset(KEEP_VERSIONS);
  if (old.length) await db.delete(schema.sheetVersions).where(and(eq(schema.sheetVersions.sheetId, sheetId), inArray(schema.sheetVersions.id, old.map((o) => o.id))));
  return true;
}

export async function replaceTabs(sheetId: string, tabs: TabData[]) {
  await db.delete(schema.sheetTabs).where(eq(schema.sheetTabs.sheetId, sheetId));
  for (let i = 0; i < tabs.length; i++) {
    const { grid, layout } = splitTab(tabs[i]);
    await db.insert(schema.sheetTabs).values({ sheetId, name: tabs[i].name, position: i, grid, layout });
  }
}

