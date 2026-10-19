import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, Plus, TriangleAlert } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PERIODS, getDashboard, parsePeriod } from "@/lib/finance";
import { fmtDate, money, moneyShort, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/page-header";
import { Section } from "@/components/crm/section";
import { MonthlyColumns } from "./charts";
import { HBars } from "./bars";

export const metadata: Metadata = { title: "Painel financeiro" };

/** Variação percentual contra o período anterior (null se não há base de comparação). */
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

function Delta({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">sem período anterior</span>;
  if (value === 0) return <span className="text-xs text-muted-foreground">igual ao período anterior</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-success" : "text-destructive")}>
      <Icon className="size-3.5" />
      {up ? "+" : "−"}
      {Math.abs(value)}% <span className="font-normal text-muted-foreground">vs. período anterior</span>
    </span>
  );
}

function Tile({ label, value, sub, alert }: { label: string; value: string; sub?: React.ReactNode; alert?: boolean }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border bg-card p-3.5 sm:p-4">
      <span className="label">{label}</span>
      <span className={cn("num-xl text-[21px] whitespace-nowrap sm:text-[26px]", alert && "text-destructive")}>{value}</span>
      {sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default async function FinanceDashboard({ searchParams }: PageProps<"/financeiro">) {
  const user = await requireAccess("financeiro");
  const sp = await searchParams;
  const period = parsePeriod(sp.p);
  const d = await getDashboard(period);
  const canEdit = has(user, "financeiro", "edit");
  const canDeals = has(user, "negocios");
  const t = d.totals;
  const margin = t.inDone > 0 ? Math.round((t.result / t.inDone) * 100) : null;
  const curKey = todayISO().slice(0, 7);
  const lateTotal = d.overdue.inTotal + d.overdue.outTotal;

  return (
    <>
      <PageBody className="grid gap-5 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
        <div data-tour="fin-period" className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "6m" ? "/financeiro" : `/financeiro?p=${p.key}`}
              aria-current={period === p.key ? "true" : undefined}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] max-md:min-h-10 text-muted-foreground transition-colors hover:border-foreground/30",
                period === p.key && "border-foreground bg-foreground text-background hover:border-foreground",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        {canEdit && (
          <Button asChild data-tour="page-actions" className="ml-auto">
            <Link href="/financeiro/lancamentos?novo=receita">
              <Plus /> Lançamento
            </Link>
          </Button>
        )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.6fr)]">
          <section data-tour="fin-hero" className="grid content-between gap-4 rounded-xl border bg-card p-5">
            <div className="grid gap-1.5">
              <span className="label">Resultado do período</span>
              <span className={cn("num-xl text-[42px] whitespace-nowrap sm:text-[54px]", t.result < 0 && "text-destructive")}>
                {t.result < 0 ? "−" : ""}
                {money(Math.abs(t.result))}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                recebido {money(t.inDone)} − pago {money(t.outDone)}
                {margin !== null && ` · margem ${margin}%`}
              </span>
            </div>
            <p className="text-[12px] leading-snug text-muted-foreground">
              Considera só o que já foi pago ou recebido. O que ainda está em aberto aparece em “A receber” e “A pagar”.
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <Tile label="Recebido" value={moneyShort(t.inDone)} sub={<Delta value={pct(t.inDone, t.prevIn)} goodWhenUp />} />
            <Tile label="Pago" value={moneyShort(t.outDone)} sub={<Delta value={pct(t.outDone, t.prevOut)} goodWhenUp={false} />} />
            <Tile label="A receber" value={moneyShort(t.inOpen)} sub={d.overdue.inCount ? `${d.overdue.inCount} em atraso (${moneyShort(d.overdue.inTotal)})` : "nada em atraso"} alert={d.overdue.inCount > 0} />
            <Tile label="A pagar" value={moneyShort(t.outOpen)} sub={d.overdue.outCount ? `${d.overdue.outCount} em atraso (${moneyShort(d.overdue.outTotal)})` : "nada em atraso"} alert={d.overdue.outCount > 0} />
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-3">
          <Section tour="fin-chart" title="Receita × despesa por mês" className="lg:col-span-2">
            <MonthlyColumns data={d.series} selectedKey={curKey} title="Receita e despesa por mês" />
          </Section>

          <Section
            title="Atenção"
            action={
              <Link href="/financeiro/lancamentos?v=abertos" className="inline-flex items-center text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-md:min-h-10">
                ver em aberto
              </Link>
            }
          >
            <div className="grid gap-4">
              {lateTotal > 0 ? (
                <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px]">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="grid gap-0.5">
                    <span className="font-medium">Em atraso</span>
                    {d.overdue.inCount > 0 && (
                      <span className="text-muted-foreground">
                        {d.overdue.inCount} a receber · <span className="num text-foreground">{money(d.overdue.inTotal)}</span>
                      </span>
                    )}
                    {d.overdue.outCount > 0 && (
                      <span className="text-muted-foreground">
                        {d.overdue.outCount} a pagar · <span className="num text-foreground">{money(d.overdue.outTotal)}</span>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-muted/50 p-3 text-[13px] text-muted-foreground">Nada em atraso. 👌</p>
              )}
              <div className="grid gap-2">
                <h3 className="label">Próximos 14 dias</h3>
                {d.nextDue.length ? (
                  <ul className="grid gap-2.5">
                    {d.nextDue.map((n) => (
                      <li key={n.id} className="flex items-center gap-2.5 text-[13px]">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, var(${n.kind === "receita" ? "--fin-in" : "--fin-out"}) 14%, transparent)`, color: `var(${n.kind === "receita" ? "--fin-in" : "--fin-out"})` }}>
                          {n.kind === "receita" ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                        </span>
                        <span className="grid min-w-0 flex-1 leading-tight">
                          <span className="truncate">{n.description}</span>
                          <span className="text-xs text-muted-foreground">
                            {n.kind === "receita" ? "a receber" : "a pagar"} · {fmtDate(n.dueDate, "EEE, dd/MM")}
                          </span>
                        </span>
                        <span className="num shrink-0">{money(Number(n.amountCents))}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted-foreground">Nenhum vencimento nos próximos 14 dias.</p>
                )}
              </div>
            </div>
          </Section>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-3">
          <Section tour="fin-forecast" title="Previsão de caixa · próximos 6 meses" className="lg:col-span-2">
            <MonthlyColumns data={d.forecast} mode="aberto" title="Previsão de caixa dos próximos seis meses" />
          </Section>

          <Section
            title="Funil e vendas"
            action={
              canDeals ? (
                <Link href="/negocios" className="inline-flex items-center text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-md:min-h-10">
                  abrir funil
                </Link>
              ) : undefined
            }
          >
            <div className="grid gap-4">
              <div className="grid gap-1">
                <span className="label">Previsão ponderada</span>
                <span className="num-xl text-[28px]">{money(d.pipeline.weighted)}</span>
                <span className="text-[12px] text-muted-foreground">
                  de {money(d.pipeline.total)} em {d.pipeline.n} negócios em andamento, pesados pela chance de cada etapa
                </span>
              </div>
              <div className="grid gap-1 border-t pt-4">
                <span className="label">Ticket médio · negócios fechados</span>
                <span className="num-xl text-[22px]">{d.won.n ? money(d.won.avg) : "—"}</span>
                <span className="text-[12px] text-muted-foreground">{d.won.n} {d.won.n === 1 ? "negócio fechado" : "negócios fechados"} no período</span>
              </div>
            </div>
          </Section>
        </div>

        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Section title="Receita por categoria">
            <HBars items={d.categoriesIn} tone="in" />
          </Section>
          <Section title="Despesa por categoria">
            <HBars items={d.categoriesOut} tone="out" />
          </Section>
          <Section title="Receita por serviço">
            <HBars items={d.byService} tone="in" empty="Vincule lançamentos a negócios para ver a receita por serviço." />
          </Section>
          <Section title="Maiores clientes">
            <HBars items={d.topClients} tone="in" empty="Vincule lançamentos a clientes para ver o ranking." />
          </Section>
        </div>
      </PageBody>
    </>
  );
}
