import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { filtersToQuery, parseFilters } from "@/lib/editais/filters";
import { getEdital, listEditais, recentRuns } from "@/lib/editais/queries";
import { sweepStaleRuns } from "@/lib/editais/ingest";
import { counts, getPropostaBrief, propostasOverview } from "@/lib/propostas/server";
import { ToolbarFilters } from "./filter-bar";
import { EditaisList } from "./list";
import { EditalSheet } from "./detail";
import { RunStatus, ScanButton } from "./scan";
import { EditaisTabs } from "./tabs";
import { PropostasList } from "./propostas-list";

export const metadata: Metadata = { title: "Editais de restauro" };
// a varredura rápida (botão “Buscar oportunidades”) roda depois da resposta e precisa do teto de 60 s
export const maxDuration = 60;

export default async function EditaisPage({ searchParams }: PageProps<"/editais">) {
  const user = await requireAccess("editais");
  const sp = await searchParams;
  const canEdit = has(user, "editais", "edit");
  const canManage = has(user, "editais", "manage");
  const tabs = async () => {
    const c = await counts().catch(() => ({ andamento: 0, cofreAlerta: 0 }));
    return <EditaisTabs canManage={canManage} andamento={c.andamento} cofreAlerta={c.cofreAlerta} />;
  };

  if (sp.aba === "propostas") {
    const f = sp.situacao === "encerradas" || sp.situacao === "todas" ? sp.situacao : "andamento";
    const [data, tabsEl] = await Promise.all([propostasOverview(f), tabs()]);
    return (
      <>
        <PageToolbar title="Editais" tabs={tabsEl} />
        <ToolArea>
          <div className="grid gap-4 p-4 sm:p-5">
            <PropostasList data={data} filter={f} />
          </div>
        </ToolArea>
      </>
    );
  }

  const filters = parseFilters(sp);
  const id = typeof sp.id === "string" ? sp.id : "";

  await sweepStaleRuns().catch(() => {});
  const [data, runs, detail, team, tabsEl, brief] = await Promise.all([
    listEditais(filters, user.id),
    recentRuns(6),
    id ? getEdital(id) : null,
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)),
    tabs(),
    id ? getPropostaBrief(id) : null,
  ]);
  const people = team;
  const exportQs = filtersToQuery({ ...filters, page: 1 });

  return (
    <>
      <PageToolbar
        title="Editais"
        filters={<ToolbarFilters key={filters.q} filters={filters} team={people} />}
        tabs={tabsEl}
        actions={
          <>
            {canEdit && <ScanButton />}
            <Button asChild size="sm" variant="outline" className="max-md:h-11">
              <a href={`/editais/exportar${exportQs ? `?${exportQs}` : ""}`} download>
                <Download /> Exportar CSV
              </a>
            </Button>
          </>
        }
      />
      <ToolArea>
        <div className="grid gap-4 p-4 sm:p-5">
          <RunStatus initial={runs} />
          <EditaisList data={data} filters={filters} canEdit={canEdit} />
        </div>
      </ToolArea>
      <EditalSheet data={detail} brief={brief} canEdit={canEdit} canDeal={has(user, "negocios", "edit") && has(user, "contatos", "edit")} canTask={has(user, "tarefas", "edit")} team={people} />
    </>
  );
}
