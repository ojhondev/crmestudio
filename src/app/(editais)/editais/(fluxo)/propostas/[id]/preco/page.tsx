import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getConfig } from "@/lib/propostas/server";
import { loadFlowBundle } from "@/lib/editais-app/flow-data";
import { PrecoFlow } from "@/components/editais-app/flows/preco-flow";

export const metadata: Metadata = { title: "Proposta de preço" };

export default async function Page({ params }: PageProps<"/editais/propostas/[id]/preco">) {
  const { id } = await params;
  const { b } = await loadFlowBundle(id);
  const [cfg, [doc]] = await Promise.all([getConfig(), db.select({ content: schema.documents.content }).from(schema.documents).where(and(eq(schema.documents.editalId, id), eq(schema.documents.templateSlug, "prop-carta"))).limit(1)]);
  const f = ((doc?.content as { fields?: Record<string, string> } | undefined)?.fields ?? {}) as Record<string, string>;
  return (
    <PrecoFlow
      editalId={id}
      organ={b.edital.organ}
      bdiPercent={cfg.bdiPercent}
      encargosPercent={cfg.encargosPercent}
      validityDays={cfg.validityDays}
      estimatedCents={b.edital.valueCents}
      sheetExists={!!b.sheet}
      existing={{ valor: f.valor_proposta ?? "", prazo: f.prazo_execucao ?? "", pagamento: f.condicoes_pagamento ?? "" }}
    />
  );
}
