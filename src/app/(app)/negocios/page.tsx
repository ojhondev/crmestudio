import type { Metadata } from "next";
import { has, requireAccess } from "@/lib/auth";
import { getBoard } from "@/lib/deals";
import { getFormOptions } from "@/lib/options";
import { money } from "@/lib/format";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { Kanban } from "./kanban";
import { NewDealButton } from "./deal-form";

export const metadata: Metadata = { title: "Negócios" };

export default async function DealsPage() {
  const user = await requireAccess("negocios");
  const [{ stages, deals }, options] = await Promise.all([getBoard(user), getFormOptions(user)]);
  const canEdit = has(user, "negocios", "edit");
  const openIds = new Set(stages.filter((s) => s.kind === "aberto").map((s) => s.id));
  const open = deals.filter((d) => openIds.has(d.stageId));
  const pipeline = open.reduce((s, d) => s + d.valueCents, 0);

  return (
    <>
      <PageToolbar
        title="Negócios"
        filters={
          <p className="text-[13px] whitespace-nowrap text-muted-foreground">
            {open.length} em andamento · <span className="font-semibold text-foreground">{money(pipeline)}</span> no funil
            {!canEdit && " · somente leitura"}
          </p>
        }
        actions={canEdit ? <NewDealButton options={options} isPartner={user.ownOnly} /> : undefined}
      />
      <ToolArea scroll={false}>
        <Kanban stages={stages} deals={deals} canEdit={canEdit} canLaunch={has(user, "financeiro", "edit")} />
      </ToolArea>
    </>
  );
}
