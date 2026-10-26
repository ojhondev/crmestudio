import type { Metadata } from "next";
import { todayISO } from "@/lib/format";
import { loadFlowBundle } from "@/lib/editais-app/flow-data";
import { HabilitacaoFlow } from "@/components/editais-app/flows/habilitacao-flow";

export const metadata: Metadata = { title: "Habilitação" };

export default async function Page({ params }: PageProps<"/editais/propostas/[id]/habilitacao">) {
  const { id } = await params;
  const { b } = await loadFlowBundle(id);
  return <HabilitacaoFlow editalId={id} organ={b.edital.organ} sessionDay={b.deadlineDay} today={todayISO()} rows={b.matrix} docs={b.cofre} />;
}
