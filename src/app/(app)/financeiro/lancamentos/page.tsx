import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { fmtDate, money, moneyInt, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { FinanceTable, TransactionDialogLauncher } from "./finance-table";

export const metadata: Metadata = { title: "Financeiro" };

function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export default async function FinancePage({ searchParams }: PageProps<"/financeiro">) {
  const user = await requireAccess("financeiro");
  const canEdit = has(user, "financeiro", "edit");
  const canDelete = has(user, "financeiro", "manage");
  const sp = await searchParams;
  const today = todayISO();
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const from = `${month}-01`;
  const to = `${shift(month, 1)}-01`;
  const view = typeof sp.v === "string" ? sp.v : "todos";

  const [rows, overdue, deals, contacts] = await Promise.all([
    db
      .select({
        id: schema.transactions.id,
        kind: schema.transactions.kind,
        description: schema.transactions.description,
        category: schema.transactions.category,
        amountCents: schema.transactions.amountCents,
        dueDate: schema.transactions.dueDate,
        paidAt: schema.transactions.paidAt,
        dealId: schema.transactions.dealId,
        contactId: schema.transactions.contactId,
        notes: schema.transactions.notes,
        dealTitle: schema.deals.title,
        contactName: schema.contacts.name,
      })
      .from(schema.transactions)
      .leftJoin(schema.deals, eq(schema.transactions.dealId, schema.deals.id))
      .leftJoin(schema.contacts, eq(schema.transactions.contactId, schema.contacts.id))
      .where(and(gte(schema.transactions.dueDate, from), lt(schema.transactions.dueDate, to)))
      .orderBy(asc(schema.transactions.dueDate), asc(schema.transactions.createdAt)),
    db
      .select({
        kind: schema.transactions.kind,
        total: sql<number>`coalesce(sum(${schema.transactions.amountCents}),0)::bigint`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.transactions)
      .where(and(isNull(schema.transactions.paidAt), lt(schema.transactions.dueDate, today)))
      .groupBy(schema.transactions.kind),
    db
      .select({
        id: schema.deals.id,
        name: schema.deals.title,
        valueCents: schema.deals.valueCents,
        contactId: schema.deals.contactId,
      })
      .from(schema.deals)
      .orderBy(asc(schema.deals.title)),
    db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).orderBy(asc(schema.contacts.name)),
  ]);

  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + Number(r.amountCents), 0);
  const inPlanned = sum((r) => r.kind === "receita");
  const inDone = sum((r) => r.kind === "receita" && !!r.paidAt);
  const outPlanned = sum((r) => r.kind === "despesa");
  const outDone = sum((r) => r.kind === "despesa" && !!r.paidAt);
  const lateIn = overdue.find((o) => o.kind === "receita");
  const lateOut = overdue.find((o) => o.kind === "despesa");

  const filtered = rows.filter((r) =>
    view === "receitas" ? r.kind === "receita" : view === "despesas" ? r.kind === "despesa" : view === "abertos" ? !r.paidAt : true,
  );

  const presetDeal = typeof sp.deal === "string" ? deals.find((d) => d.id === sp.deal) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Fluxo de caixa"
        actions={
          canEdit ? (
          <TransactionDialogLauncher
            deals={deals.map(({ id, name }) => ({ id, name }))}
            contacts={contacts}
            openWith={
              sp.novo === "receita" || sp.novo === "despesa"
                ? {
                    kind: sp.novo,
                    dealId: presetDeal?.id,
                    contactId: presetDeal?.contactId ?? undefined,
                    amountCents: presetDeal?.valueCents,
                    description: presetDeal?.name,
                  }
                : undefined
            }
          />
          ) : undefined
        }
      />
      <PageBody className="grid gap-5">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Mês anterior">
            <Link href={`/financeiro/lancamentos?m=${shift(month, -1)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Próximo mês">
            <Link href={`/financeiro/lancamentos?m=${shift(month, 1)}`}>
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="ml-1 text-lg font-light capitalize">{fmtDate(`${month}-15`, "MMMM 'de' yyyy")}</h2>
        </div>

        <div data-tour="fin-kpis" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi label="Recebido no mês" value={moneyInt(inDone)} sub={`de ${money(inPlanned)} previstos`} progress={inPlanned ? inDone / inPlanned : 0} />
          <Kpi label="Pago no mês" value={moneyInt(outDone)} sub={`de ${money(outPlanned)} previstos`} progress={outPlanned ? outDone / outPlanned : 0} tone="muted" />
          <Kpi label="Resultado do mês" value={moneyInt(inDone - outDone)} sub={`previsto ${money(inPlanned - outPlanned)}`} tone={inDone - outDone < 0 ? "bad" : "good"} />
          <Kpi
            label="Em atraso"
            value={moneyInt(Number(lateIn?.total ?? 0))}
            sub={`${lateIn?.n ?? 0} a receber · ${money(Number(lateOut?.total ?? 0))} a pagar`}
            tone={lateIn?.n ? "bad" : undefined}
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {[
            ["todos", "Todos"],
            ["receitas", "Receitas"],
            ["despesas", "Despesas"],
            ["abertos", "Em aberto"],
          ].map(([k, label]) => (
            <Link
              key={k}
              href={`/financeiro/lancamentos?${new URLSearchParams({ m: month, ...(k !== "todos" ? { v: k } : {}) })}`}
              className={cn(
                "rounded-full border px-3 py-1 text-[12.5px] text-muted-foreground transition-colors hover:border-foreground/30",
                view === k && "border-foreground bg-foreground text-background",
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        <FinanceTable
          rows={filtered.map((r) => ({ ...r, amountCents: Number(r.amountCents) }))}
          today={today}
          deals={deals.map(({ id, name }) => ({ id, name }))}
          contacts={contacts}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </PageBody>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  progress,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  progress?: number;
  tone?: "good" | "bad" | "muted";
}) {
  return (
    <div className="grid gap-1 rounded-xl border bg-card p-4">
      <span className="label">{label}</span>
      <span className={cn("num-xl text-[22px] whitespace-nowrap sm:text-[26px]", tone === "bad" && "text-destructive", tone === "good" && "text-success")}>{value}</span>
      <span className="text-[12px] text-muted-foreground">{sub}</span>
      {progress !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", tone === "muted" ? "bg-foreground/40" : "bg-brand")} style={{ width: `${Math.min(progress, 1) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
