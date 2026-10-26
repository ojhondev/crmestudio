import Link from "next/link";
import { AlertTriangle, ChevronRight, ClipboardList, Trophy, User } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { fmtDate, moneyShort } from "@/lib/format";
import type { PropostasOverview } from "@/lib/propostas/server";
import { DOSSIE_STATUS_LABEL } from "@/lib/propostas/types";
import { KindChip } from "./bits";
import { Countdown, ProgressBar, StatusPill, stepLabelOf } from "./proposta-bits";

function Kpi({ label, value, href, accent }: { label: string; value: number; href?: string; accent?: boolean }) {
  const inner = (
    <>
      <span className="label">{label}</span>
      <span className={cn("num-xl text-[24px] sm:text-[28px]", accent && value > 0 && "text-brand")}>{value}</span>
    </>
  );
  const cls = "grid gap-0.5 rounded-xl border bg-card px-4 py-3 text-left max-md:min-h-16";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-foreground/20")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

const FILTERS = [
  { v: "andamento", l: "Em andamento" },
  { v: "encerradas", l: "Encerradas" },
  { v: "todas", l: "Todas" },
] as const;

export function PropostasList({ data, filter }: { data: PropostasOverview; filter: "andamento" | "encerradas" | "todas" }) {
  const { rows, kpis, stats } = data;
  const pill = (active: boolean) => cn("inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[13px] whitespace-nowrap max-md:min-h-11", active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30");
  return (
    <div className="grid gap-4">
      <div data-tour="proposta-kpis" className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <Kpi label="Em andamento" value={kpis.andamento} />
        <Kpi label="Sessão em até 7 dias" value={kpis.urgentes} accent />
        <Kpi label="Etapas atrasadas" value={kpis.etapasAtrasadas} accent />
        <Kpi label="Habilitação com pendência" value={kpis.comPendencia} accent />
        <Kpi label="Sem responsável" value={kpis.semResponsavel} accent />
      </div>

      <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
        {FILTERS.map((f) => (
          <Link key={f.v} href={`/editais?aba=propostas${f.v === "andamento" ? "" : `&situacao=${f.v}`}`} aria-current={filter === f.v} className={pill(filter === f.v)}>
            {f.l}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={filter === "andamento" ? "Nenhuma proposta em andamento" : "Nada por aqui ainda"}>
          {filter === "andamento" ? (
            <>
              Comece por <strong>Oportunidades</strong>: abra um edital e toque em <strong>Vou participar</strong>. O CRM monta o checklist com prazos, as tarefas e a matriz de habilitação.
            </>
          ) : (
            "Quando uma proposta tiver resultado (ganhou, perdeu ou desistência), ela aparece aqui."
          )}
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-2 lg:hidden">
            {rows.map((r) => (
              <li key={r.editalId}>
                <Link href={`/editais/proposta/${r.editalId}`} className="grid gap-2 rounded-xl border bg-card px-3.5 py-3 transition-colors hover:border-foreground/25 max-md:min-h-11">
                  <span className="line-clamp-2 text-[14px] leading-snug font-medium break-words">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.organ} · {r.place || "local não informado"}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.status === "andamento" ? <Countdown daysLeft={r.daysLeft} urgency={r.urgency} /> : <StatusPill status={r.status} />}
                    {r.valueCents ? <span className="num text-xs tabular-nums text-muted-foreground">{moneyShort(r.valueCents)}</span> : null}
                    {r.matrix.problems > 0 && r.status === "andamento" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                        <AlertTriangle className="size-3.5" /> {r.matrix.problems} na habilitação
                      </span>
                    )}
                  </span>
                  {r.status === "andamento" && (
                    <span className="grid gap-1">
                      <ProgressBar pct={r.progress.pct} />
                      <span className="flex justify-between text-xs text-muted-foreground">
                        <span>{r.progress.pct}% · {stepLabelOf(r.currentStep)}</span>
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3" /> {r.ownerName?.split(" ")[0] ?? "sem responsável"}
                        </span>
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <div data-tour="proposta-list" className="overflow-x-auto rounded-xl border bg-card max-lg:hidden">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Edital</th>
                  <th className="px-4 py-2.5 font-medium">Prazo</th>
                  <th className="px-4 py-2.5 font-medium">Andamento</th>
                  <th className="px-4 py-2.5 font-medium">Habilitação</th>
                  <th className="px-4 py-2.5 font-medium">Responsável</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.editalId} className="group border-b align-top last:border-0 hover:bg-muted/50">
                    <td className="max-w-[420px] px-4 py-3">
                      <Link href={`/editais/proposta/${r.editalId}`} className="line-clamp-2 font-medium group-hover:underline">
                        {r.title}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {r.organ} · {r.place}
                        <KindChip kind={r.kind} />
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.status === "andamento" ? <Countdown daysLeft={r.daysLeft} urgency={r.urgency} /> : <StatusPill status={r.status} />}
                      {r.deadlineDay && <span className="mt-1 block text-xs text-muted-foreground">{fmtDate(r.deadlineDay)}</span>}
                    </td>
                    <td className="w-56 px-4 py-3">
                      {r.status === "andamento" ? (
                        <div className="grid gap-1">
                          <ProgressBar pct={r.progress.pct} />
                          <span className="text-xs text-muted-foreground">
                            {r.progress.pct}% · {stepLabelOf(r.currentStep)}
                            {r.progress.overdueSteps ? <span className="font-medium text-brand"> · {r.progress.overdueSteps} atrasada(s)</span> : null}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.resultReason ?? DOSSIE_STATUS_LABEL[r.status as keyof typeof DOSSIE_STATUS_LABEL]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.matrix.total === 0 || r.status !== "andamento" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : r.matrix.problems > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                          <AlertTriangle className="size-3.5" /> {r.matrix.problems} pendência(s)
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.matrix.ok}/{r.matrix.total} em dia</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.ownerName ?? <span className="text-brand">Sem responsável</span>}</td>
                    <td className="num px-4 py-3 text-right whitespace-nowrap tabular-nums">{r.valueCents ? moneyShort(r.valueCents) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      <ChevronRight className="size-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {stats.overall.total > 0 && (
        <section data-tour="proposta-stats" className="grid gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground" />
            <h2 className="text-[15px] font-semibold">Aprendizado das propostas</h2>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Taxa de êxito geral: <strong className="num text-foreground">{stats.overall.rate}%</strong> ({stats.overall.won} ganhas em {stats.overall.total} decididas). Desistências e propostas em andamento não entram na conta.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <RateTable title="Por tipo" rows={stats.byKind.map((g) => ({ ...g, label: g.label === "execucao" ? "Execução (obra)" : g.label === "projeto" ? "Projeto" : g.label === "projeto_execucao" ? "Projeto + obra" : g.label === "laudo" ? "Laudo" : g.label }))} />
            <RateTable title="Por órgão" rows={stats.byOrgan} />
            <div className="grid content-start gap-1.5">
              <h3 className="label">Motivos mais comuns de perda</h3>
              {stats.reasons.length ? (
                <ul className="grid gap-1 text-[13px]">
                  {stats.reasons.map((r) => (
                    <li key={r.reason} className="flex justify-between gap-3">
                      <span className="break-words">{r.reason}</span>
                      <span className="num tabular-nums text-muted-foreground">{r.n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma perda registrada ainda.</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RateTable({ title, rows }: { title: string; rows: { label: string; total: number; won: number; rate: number }[] }) {
  return (
    <div className="grid content-start gap-1.5">
      <h3 className="label">{title}</h3>
      {rows.length ? (
        <ul className="grid gap-1 text-[13px]">
          {rows.map((g) => (
            <li key={g.label} className="flex justify-between gap-3">
              <span className="min-w-0 break-words">{g.label}</span>
              <span className="num shrink-0 tabular-nums text-muted-foreground">
                {g.won}/{g.total} · {g.rate}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Sem resultados ainda.</p>
      )}
    </div>
  );
}
