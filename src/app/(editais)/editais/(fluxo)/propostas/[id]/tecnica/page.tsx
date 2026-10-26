import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getConfig } from "@/lib/propostas/server";
import { suggestAtestadosFor } from "@/lib/propostas/suggest";
import { loadFlowBundle } from "@/lib/editais-app/flow-data";
import { TecnicaFlow } from "@/components/editais-app/flows/tecnica-flow";

export const metadata: Metadata = { title: "Proposta técnica" };

export default async function Page({ params }: PageProps<"/editais/propostas/[id]/tecnica">) {
  const { id } = await params;
  const { b } = await loadFlowBundle(id);
  const [cfg, suggestions, [doc]] = await Promise.all([
    getConfig(),
    suggestAtestadosFor(id, 10),
    db.select({ content: schema.documents.content }).from(schema.documents).where(and(eq(schema.documents.editalId, id), eq(schema.documents.templateSlug, "prop-tecnica"))).limit(1),
  ]);
  const f = ((doc?.content as { fields?: Record<string, string> } | undefined)?.fields ?? {}) as Record<string, string>;
  return (
    <TecnicaFlow
      editalId={id}
      organ={b.edital.organ}
      object={b.edital.object}
      suggestions={suggestions}
      technical={cfg.technical.map((t) => ({ id: t.id, name: t.name, profession: t.profession, registry: t.registry }))}
      existing={{ compreensao: f.compreensao ?? "", metodologia: f.metodologia ?? "", cronograma: f.cronograma ?? "" }}
    />
  );
}
