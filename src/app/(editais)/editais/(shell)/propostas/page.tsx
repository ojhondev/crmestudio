import type { Metadata } from "next";
import { requireEditais } from "@/lib/editais-app/session";
import { boardData } from "@/lib/editais-app/propostas";
import { PageTitle, PageWrap } from "@/components/editais-app/primitives";
import { PropostasView } from "@/components/editais-app/propostas-view";

export const metadata: Metadata = { title: "Propostas" };

export default async function PropostasPage({ searchParams }: PageProps<"/editais/propostas">) {
  const { actor } = await requireEditais();
  const sp = await searchParams;
  const rp = Math.max(1, Math.min(20, Number(typeof sp.rp === "string" ? sp.rp : 1) || 1));
  const view = sp.v === "lista" ? "lista" : "quadro";
  const data = await boardData(actor, { finishedPage: rp });
  return (
    <PageWrap>
      <PageTitle title="Propostas" sub={actor.kind === "staff" ? "Do edital ao resultado, no seu ritmo." : "As propostas compartilhadas com você."} />
      <PropostasView cards={data.cards} counts={data.counts} staff={actor.kind === "staff"} hasMoreFinished={data.hasMoreFinished} moreHref={`/editais/propostas?rp=${rp + 1}${view === "lista" ? "&v=lista" : ""}`} initialView={view} />
    </PageWrap>
  );
}
