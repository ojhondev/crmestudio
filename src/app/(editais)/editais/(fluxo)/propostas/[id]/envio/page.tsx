import type { Metadata } from "next";
import { toLocalInput } from "@/lib/format";
import { loadFlowBundle } from "@/lib/editais-app/flow-data";
import { EnvioFlow } from "@/components/editais-app/flows/envio-flow";

export const metadata: Metadata = { title: "Revisão e envio" };

export default async function Page({ params }: PageProps<"/editais/propostas/[id]/envio">) {
  const { id } = await params;
  const { b } = await loadFlowBundle(id);
  const items = b.items.filter((i) => i.stepKey === "revisao").map((i) => ({ id: i.id, title: i.title, done: i.done }));
  return <EnvioFlow editalId={id} organ={b.edital.organ} items={items} nowLocal={toLocalInput(new Date())} />;
}
