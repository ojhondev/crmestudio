import type { Metadata } from "next";
import { getConfig } from "@/lib/propostas/server";
import { loadFlowBundle } from "@/lib/editais-app/flow-data";
import { ResultadoFlow } from "@/components/editais-app/flows/resultado-flow";

export const metadata: Metadata = { title: "Resultado" };

export default async function Page({ params }: PageProps<"/editais/propostas/[id]/resultado">) {
  const { id } = await params;
  const { b } = await loadFlowBundle(id);
  const cfg = await getConfig();
  const d = b.dossie;
  const open = d.status === "andamento";
  return (
    <ResultadoFlow
      editalId={id}
      organ={b.edital.organ}
      lossReasons={cfg.lossReasons}
      initial={{ status: open ? "" : d.status, value: d.resultValueCents ? (d.resultValueCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "", reason: d.resultReason ?? "", notes: d.resultNotes ?? "" }}
    />
  );
}
