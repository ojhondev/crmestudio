import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { getSheet, loadTabs } from "@/lib/sheets/server";
import { SheetEditor } from "@/components/sheets/editor";

export const metadata: Metadata = { title: "Planilha" };

export default async function SheetPage({ params }: PageProps<"/planilhas/[id]">) {
  const { id } = await params;
  const user = await requireAccess("planilhas");
  const sheet = await getSheet(id, user);
  if (!sheet) notFound();
  const canEdit = has(user, "planilhas", "edit");
  const [tabs, deals, contacts] = await Promise.all([
    loadTabs(id),
    canEdit ? db.select({ id: schema.deals.id, title: schema.deals.title }).from(schema.deals).where(dealScope(user)).orderBy(desc(schema.deals.updatedAt)).limit(200) : Promise.resolve([]),
    canEdit ? db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).orderBy(asc(schema.contacts.name)).limit(500) : Promise.resolve([]),
  ]);

  return (
    <SheetEditor
      key={`${sheet.id}:${sheet.version}`}
      sheet={{ id: sheet.id, name: sheet.name, version: sheet.version, favorite: sheet.favorite, dealId: sheet.dealId, contactId: sheet.contactId }}
      tabs={tabs}
      canEdit={canEdit}
      canManage={has(user, "planilhas", "manage")}
      deals={deals.map((d) => ({ value: d.id, label: d.title }))}
      contacts={contacts.map((c) => ({ value: c.id, label: c.name }))}
    />
  );
}
