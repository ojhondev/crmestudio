import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getBoard } from "@/lib/deals";
import { getFormOptions } from "@/lib/options";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Kanban } from "./kanban";
import { NewDealButton } from "./deal-form";

export const metadata: Metadata = { title: "Negócios" };

export default async function DealsPage() {
  const user = await requireUser();
  const [{ stages, deals }, options] = await Promise.all([getBoard(user), getFormOptions(user)]);
  const openIds = new Set(stages.filter((s) => s.kind === "aberto").map((s) => s.id));
  const open = deals.filter((d) => openIds.has(d.stageId));
  const pipeline = open.reduce((s, d) => s + d.valueCents, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="Funil de vendas"
        title="Negócios"
        description={
          <>
            {open.length} em andamento · <span className="text-foreground">{money(pipeline)}</span> no funil
          </>
        }
        actions={<NewDealButton options={options} isPartner={user.role === "parceiro"} />}
      />
      <Kanban stages={stages} deals={deals} />
    </div>
  );
}
