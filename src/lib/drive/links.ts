import "server-only";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DriveUnavailable, type DriveEntry, type DriveProvider, type UploadInput } from "./types";

const fromItem = (r: typeof schema.driveItems.$inferSelect): DriveEntry => ({
  id: r.id,
  name: r.title,
  kind: r.kind,
  isFolder: r.kind === "pasta",
  url: r.url,
  modifiedAt: r.updatedAt.toISOString(),
  parentId: r.folderId,
});

/** Provedor "links": arquivos do Drive registrados por URL e organizados em pastas virtuais do CRM. */
export const linksProvider: DriveProvider = {
  id: "links",
  label: "Links do Drive",
  async isReady() {
    return true;
  },
  async listFolder(folderId) {
    const [folders, items] = await Promise.all([
      db.select().from(schema.driveFolders).where(folderId ? eq(schema.driveFolders.parentId, folderId) : isNull(schema.driveFolders.parentId)),
      db.select().from(schema.driveItems).where(folderId ? eq(schema.driveItems.folderId, folderId) : isNull(schema.driveItems.folderId)),
    ]);
    return [
      ...folders.map((f): DriveEntry => ({ id: f.id, name: f.name, kind: "pasta", isFolder: true, url: null, parentId: f.parentId, modifiedAt: f.createdAt.toISOString() })),
      ...items.map(fromItem),
    ];
  },
  async search(q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const rows = await db
      .select()
      .from(schema.driveItems)
      .where(or(ilike(schema.driveItems.title, like), ilike(schema.driveItems.project, like), ilike(schema.driveItems.notes, like)))
      .limit(100);
    return rows.map(fromItem);
  },
  async getMeta(id) {
    const [r] = await db.select().from(schema.driveItems).where(and(eq(schema.driveItems.id, id))).limit(1);
    return r ? fromItem(r) : null;
  },
  async openUrl(id) {
    return (await this.getMeta(id))?.url ?? null;
  },
  async upload(_input: UploadInput): Promise<DriveEntry> {
    void _input;
    throw new DriveUnavailable("O modo por links não envia arquivos: suba o arquivo no Google Drive e cole o link aqui.");
  },
  async createFolder(name, parentId) {
    const [f] = await db.insert(schema.driveFolders).values({ name: name.trim().slice(0, 120), parentId: parentId ?? null }).returning();
    return { id: f.id, name: f.name, kind: "pasta", isFolder: true, url: null, parentId: f.parentId };
  },
};
