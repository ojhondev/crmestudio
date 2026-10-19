import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { buildContext, getDoc, listEvents, renderContract } from "@/lib/docs/server";
import { missingVars, valueMap } from "@/lib/docs/variables";
import type { DocContent } from "@/lib/docs/types";
import { Workspace } from "./workspace";

export const metadata: Metadata = { title: "Documento" };

export default async function DocumentPage({ params }: PageProps<"/documentos/[id]">) {
  const { id } = await params;
  const user = await requireAccess("documentos");
  const doc = await getDoc(id, user);
  if (!doc) notFound();
  const content = doc.content as DocContent;

  const [ctx, events, versions, clauseRows, deals] = await Promise.all([
    buildContext(doc),
    listEvents(id),
    db.select().from(schema.documentVersions).where(eq(schema.documentVersions.documentId, id)).orderBy(desc(schema.documentVersions.createdAt)).limit(30),
    db.select().from(schema.docTemplates).where(eq(schema.docTemplates.kind, "clausula")),
    db.select({ id: schema.deals.id, title: schema.deals.title }).from(schema.deals).where(dealScope(user)).orderBy(desc(schema.deals.updatedAt)).limit(200),
  ]);
  const map = valueMap(ctx);
  const text = content.kind === "contrato" ? content.html : JSON.stringify(content.slides);
  const preview = {
    map,
    missing: missingVars(text, map),
    html: content.kind === "contrato" ? renderContract(content, map) : null,
    studioName: ctx.studio.name,
  };

  return (
    <>
      <div className="px-5 pt-5 sm:px-8 lg:px-10">
        <Link href="/documentos" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Documentos
        </Link>
      </div>
      <Workspace
        key={`${doc.id}:${doc.status}:${doc.version}`}
        doc={{
          id: doc.id,
          kind: doc.kind,
          number: doc.number,
          title: doc.title,
          status: doc.status,
          content,
          dealId: doc.dealId,
          publicToken: doc.publicToken,
          acceptedAt: doc.acceptedAt?.toISOString() ?? null,
          acceptedName: doc.acceptedName,
        }}
        deals={deals}
        customClauses={clauseRows.map((c) => ({ id: c.id, name: c.name, description: c.description, html: String((c.content as { html?: string }).html ?? "") }))}
        events={events.map((e) => ({ id: e.id, type: e.type, at: e.at.toISOString(), meta: (e.meta as Record<string, unknown> | null) ?? null }))}
        versions={versions.map((v) => ({ id: v.id, version: v.version, note: v.note, createdAt: v.createdAt.toISOString() }))}
        preview={preview}
        canEdit={has(user, "documentos", "edit")}
        canManage={has(user, "documentos", "manage")}
      />
    </>
  );
}
