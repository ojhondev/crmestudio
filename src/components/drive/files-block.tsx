import { desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, type SessionUser } from "@/lib/auth";
import { Section } from "@/components/crm/section";
import { FilesList } from "./files-list";

/**
 * Bloco "Arquivos" do detalhe do negócio/contato: links do Drive vinculados (a pasta do Drive do cliente aparece primeiro).
 * Some para quem não tem acesso ao módulo Drive.
 */
export async function FilesBlock({ user, dealId, contactId }: { user: SessionUser; dealId?: string; contactId?: string | null }) {
  if (!has(user, "drive") || user.ownOnly) return null;
  const dealIds = contactId && !dealId ? (await db.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.contactId, contactId))).map((d) => d.id) : [];
  const where = dealId
    ? or(eq(schema.driveItems.dealId, dealId), contactId ? eq(schema.driveItems.contactId, contactId) : undefined)
    : or(contactId ? eq(schema.driveItems.contactId, contactId) : undefined, dealIds.length ? inArray(schema.driveItems.dealId, dealIds) : undefined);
  const rows = await db
    .select({ id: schema.driveItems.id, kind: schema.driveItems.kind, title: schema.driveItems.title, url: schema.driveItems.url, tags: schema.driveItems.tags, dealId: schema.driveItems.dealId })
    .from(schema.driveItems)
    .where(where)
    .orderBy(desc(schema.driveItems.updatedAt))
    .limit(60);
  rows.sort((a, b) => Number(b.kind === "pasta") - Number(a.kind === "pasta"));

  return (
    <Section title="Arquivos">
      <FilesList items={rows} dealId={dealId ?? null} contactId={contactId ?? null} canEdit={has(user, "drive", "edit")} canManage={has(user, "drive", "manage")} />
    </Section>
  );
}
