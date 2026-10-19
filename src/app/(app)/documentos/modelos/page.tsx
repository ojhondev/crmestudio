import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { BUILTIN_CLAUSES, BUILTIN_CONTRACTS, REVIEW_NOTE } from "@/lib/docs/templates";
import { PageBody, PageHeader } from "@/components/page-header";
import { Templates } from "./templates-client";

export const metadata: Metadata = { title: "Modelos e cláusulas" };

export default async function TemplatesPage() {
  await requireAccess("documentos", "manage");
  const custom = await db.select().from(schema.docTemplates).orderBy(asc(schema.docTemplates.name));
  return (
    <>
      <div className="px-5 pt-6 sm:px-8 lg:px-10">
        <Link href="/documentos" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Documentos
        </Link>
      </div>
      <PageHeader eyebrow="Documentos" title="Modelos e cláusulas" description={REVIEW_NOTE} />
      <PageBody>
        <Templates
          custom={custom.map((t) => ({ id: t.id, kind: t.kind, name: t.name, description: t.description }))}
          builtinContracts={BUILTIN_CONTRACTS.map((t) => ({ name: t.name, description: t.description }))}
          builtinClauses={BUILTIN_CLAUSES.map((c) => ({ name: c.name, description: c.description }))}
        />
      </PageBody>
    </>
  );
}
