import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IN_DEVELOPMENT } from "@/lib/modules-status";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { DriveBrowser } from "@/components/drive/drive-browser";

export const metadata: Metadata = { title: "Drive" };

/** Títulos dos projetos do site, para sugerir no campo "projeto" (o banco do site pode estar indisponível). */
async function siteProjectTitles() {
  try {
    const { listProjects } = await import("@/lib/site");
    return (await listProjects()).map((p) => p.title);
  } catch {
    return [];
  }
}

export default async function DrivePage({ searchParams }: PageProps<"/drive">) {
  if (IN_DEVELOPMENT.drive) redirect("/");
  const user = await requireAccess("drive");
  const sp = await searchParams;
  const pasta = typeof sp.pasta === "string" && /^[0-9a-f-]{36}$/i.test(sp.pasta) ? sp.pasta : null;

  const [folders, items, contacts, deals, projects] = await Promise.all([
    db.select({ id: schema.driveFolders.id, name: schema.driveFolders.name, parentId: schema.driveFolders.parentId }).from(schema.driveFolders),
    db
      .select({
        id: schema.driveItems.id,
        kind: schema.driveItems.kind,
        title: schema.driveItems.title,
        url: schema.driveItems.url,
        folderId: schema.driveItems.folderId,
        contactId: schema.driveItems.contactId,
        contactName: schema.contacts.name,
        dealId: schema.driveItems.dealId,
        dealTitle: schema.deals.title,
        project: schema.driveItems.project,
        tags: schema.driveItems.tags,
        notes: schema.driveItems.notes,
        favorite: schema.driveItems.favorite,
        updatedAt: schema.driveItems.updatedAt,
        provider: schema.driveItems.provider,
      })
      .from(schema.driveItems)
      .leftJoin(schema.contacts, eq(schema.driveItems.contactId, schema.contacts.id))
      .leftJoin(schema.deals, eq(schema.driveItems.dealId, schema.deals.id))
      .orderBy(desc(schema.driveItems.updatedAt))
      .limit(3000),
    db.select({ id: schema.contacts.id, name: schema.contacts.name, company: schema.contacts.company }).from(schema.contacts).orderBy(schema.contacts.name).limit(1500),
    db.select({ id: schema.deals.id, title: schema.deals.title }).from(schema.deals).orderBy(desc(schema.deals.updatedAt)).limit(800),
    siteProjectTitles(),
  ]);

  return (
    <DriveBrowser
      folders={folders}
      items={items.map((i) => ({ ...i, updatedAt: i.updatedAt.toISOString() }))}
      contacts={contacts.map((c) => ({ value: c.id, label: c.company ? `${c.name} · ${c.company}` : c.name }))}
      deals={deals.map((d) => ({ value: d.id, label: d.title }))}
      projects={projects}
      currentFolder={pasta}
      canEdit={has(user, "drive", "edit")}
      canManage={has(user, "drive", "manage")}
    />
  );
}
