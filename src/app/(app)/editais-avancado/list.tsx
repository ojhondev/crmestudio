"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, FileSearch, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { fmtDate, moneyShort } from "@/lib/format";
import { PAGE_SIZE, type EditalFilters } from "@/lib/editais/filters";
import type { EditalDTO, ListResult } from "@/lib/editais/queries";
import { Deadline, EsferaChip, KindChip, ScoreBadge, TriagePill } from "./bits";
import { Chip, useGo } from "./filter-bar";

const place = (e: EditalDTO) => [e.city, e.uf].filter(Boolean).join(" · ") || "Local não informado";

function useOpen() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (id: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set("id", id);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };
}

export function EditaisList({ data, filters, canEdit }: { data: ListResult; filters: EditalFilters; canEdit: boolean }) {
  const go = useGo();
  const open = useOpen();
  const { rows, total, ufCounts, kpis } = data;
  const hasFilters = !!(filters.q || filters.tipos.length || filters.ufs.length || filters.city || filters.esfera || filters.prazo || filters.triagem || filters.owner || filters.vmin !== null || filters.vmax !== null);

  return (
    <div className="grid gap-4">
      <div data-tour="edital-kpis" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi label="Abertos e relevantes" value={kpis.abertos} onClick={() => go({ ...filters, situacao: "aberto", triagem: "", prazo: 0, rel: 50, tipos: [], ufs: [], q: "" })} />
        <Kpi label="Novos · 7 dias" value={kpis.novos} accent onClick={() => go({ ...filters, triagem: "novo", sort: "recentes", prazo: 0 })} />
        <Kpi label="Encerram em 7 dias" value={kpis.encerrando7} accent={kpis.encerrando7 > 0} onClick={() => go({ ...filters, prazo: 7, triagem: "ativos", sort: "prazo" })} />
        <Kpi label="Acompanhando" value={kpis.interessantes} onClick={() => go({ ...filters, triagem: "ativos", situacao: "aberto" })} />
      </div>

      <div data-tour="edital-tipos" className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
        <span className="label shrink-0">Tipo</span>
        <Chip active={!filters.tipos.length} onClick={() => go({ ...filters, tipos: [] })}>
          Todos
        </Chip>
        <Chip active={filters.tipos.includes("projeto") && !filters.tipos.includes("execucao")} onClick={() => go({ ...filters, tipos: ["projeto"] })}>
          Projeto de restauro
        </Chip>
        <Chip active={filters.tipos.includes("execucao") && !filters.tipos.includes("projeto")} onClick={() => go({ ...filters, tipos: ["execucao"] })}>
          Execução (obra)
        </Chip>
        <Chip active={filters.tipos.length === 1 && filters.tipos[0] === "laudo"} onClick={() => go({ ...filters, tipos: ["laudo"] })}>
          Laudo / consultoria
        </Chip>
      </div>

      {ufCounts.length > 0 && (
        <div data-tour="edital-ufs" className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
          <span className="label shrink-0">Estados</span>
          {ufCounts.map((u) => (
            <Chip key={u.uf} active={filters.ufs.includes(u.uf)} onClick={() => go({ ...filters, ufs: filters.ufs.includes(u.uf) ? filters.ufs.filter((x) => x !== u.uf) : [...filters.ufs, u.uf] })}>
              {u.uf} <span className="num ml-1.5 tabular-nums opacity-70">{u.n}</span>
            </Chip>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {total} {total === 1 ? "edital" : "editais"}
        {hasFilters ? " com os filtros aplicados" : ""}
        {total > rows.length ? ` · mostrando ${rows.length}` : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={FileSearch} title={hasFilters ? "Nenhum edital com esses filtros" : "Nenhum edital relevante por enquanto"}>
          {hasFilters ? "Afrouxe os filtros (relevância, situação ou estados) para ver mais." : canEdit ? "Use “Buscar oportunidades” para procurar editais de restauro no PNCP." : "As buscas rodam todo dia. Volte em breve."}
        </EmptyState>
      ) : (
        <>
          <ul data-tour="edital-list-m" className="grid gap-2.5 lg:hidden">
            {rows.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => open(e.id)} className="grid w-full gap-1.5 rounded-xl border bg-card px-4 py-3 text-left active:bg-muted/50">
                  <span className="flex items-center justify-between gap-2">
                    <ScoreBadge score={e.score} />
                    <Deadline daysLeft={e.daysLeft} situation={e.situation} />
                  </span>
                  <span className="line-clamp-3 text-[15px] leading-snug font-medium break-words">{e.title}</span>
                  <span className="text-[13px] break-words text-muted-foreground">{e.organ}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" /> {place(e)}
                    </span>
                    <span className="num tabular-nums">{e.valueCents ? moneyShort(e.valueCents) : "valor não informado"}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <KindChip kind={e.kind} />
                    <EsferaChip esfera={e.esfera} />
                    <TriagePill triage={e.triage} />
                    {e.ownerName && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="size-3" /> {e.ownerName.split(" ")[0]}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div data-tour="edital-list" className="overflow-x-auto rounded-xl border bg-card max-lg:hidden">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Relevância</th>
                  <th className="px-4 py-2.5 font-medium">Objeto e órgão</th>
                  <th className="px-4 py-2.5 font-medium">Local</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-4 py-2.5 font-medium">Prazo</th>
                  <th className="px-4 py-2.5 font-medium">Triagem</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => open(e.id)} className="group cursor-pointer border-b align-top last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <ScoreBadge score={e.score} />
                    </td>
                    <td className="max-w-[460px] px-4 py-3">
                      <span className="line-clamp-2 font-medium group-hover:underline">{e.title}</span>
                      <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                        {e.organ}
                        {e.ownerName ? ` · resp. ${e.ownerName.split(" ")[0]}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {place(e)}
                      <span className="mt-0.5 block">
                        <EsferaChip esfera={e.esfera} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <KindChip kind={e.kind} />
                    </td>
                    <td className="num px-4 py-3 text-right whitespace-nowrap tabular-nums">{e.valueCents ? moneyShort(e.valueCents) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Deadline daysLeft={e.daysLeft} situation={e.situation} />
                      {e.closeAt && <span className="block text-xs text-muted-foreground">{fmtDate(e.closeAt, "dd/MM/yy HH:mm")}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <TriagePill triage={e.triage} />
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      <ChevronRight className="size-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > rows.length && rows.length >= PAGE_SIZE * filters.page && (
            <Button variant="outline" className="mx-auto max-md:h-11" onClick={() => go({ ...filters, page: filters.page + 1 })}>
              Mostrar mais ({total - rows.length} restantes)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, onClick, accent }: { label: string; value: number; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="grid gap-0.5 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/20 max-md:min-h-16">
      <span className="label">{label}</span>
      <span className={cn("num-xl text-[24px] sm:text-[28px]", accent && value > 0 && "text-brand")}>{value}</span>
    </button>
  );
}
