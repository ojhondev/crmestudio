import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { todayISO } from "@/lib/format";
import type { SheetRow } from "@/lib/csv";

const t = schema.transactions;

export type Period = "mes" | "3m" | "6m" | "12m" | "ano";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "mes", label: "Este mês" },
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "12m", label: "12 meses" },
  { key: "ano", label: "Ano" },
];

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export function periodRange(p: Period, today = todayISO()) {
  const cur = today.slice(0, 7);
  let months: string[];
  if (p === "ano") months = Array.from({ length: 12 }, (_, i) => `${cur.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`);
  else {
    const n = p === "mes" ? 1 : p === "3m" ? 3 : p === "6m" ? 6 : 12;
    months = Array.from({ length: n }, (_, i) => addMonths(cur, i - (n - 1)));
  }
  return { months, from: `${months[0]}-01`, to: `${addMonths(months[months.length - 1], 1)}-01` };
}

export const parsePeriod = (v: unknown): Period => (PERIODS.some((p) => p.key === v) ? (v as Period) : "6m");

const num = (v: unknown) => Number(v ?? 0);

export type MonthPoint = { key: string; inPaid: number; inOpen: number; outPaid: number; outOpen: number };
export type Ranked = { label: string; value: number };

export async function getDashboard(period: Period) {
  const today = todayISO();
  const { months, from, to } = periodRange(period, today);
  const curMonth = today.slice(0, 7);
  const fMonths = Array.from({ length: 6 }, (_, i) => addMonths(curMonth, i));
  const fTo = `${addMonths(curMonth, 6)}-01`;
  // período anterior de mesmo tamanho (para a variação)
  const prevFrom = `${addMonths(months[0], -months.length)}-01`;

  const ym = sql<string>`to_char(${t.dueDate}, 'YYYY-MM')`;
  const paid = sql<number>`coalesce(sum(${t.amountCents}) filter (where ${t.paidAt} is not null),0)::bigint`;
  const open = sql<number>`coalesce(sum(${t.amountCents}) filter (where ${t.paidAt} is null),0)::bigint`;
  const inRange = and(gte(t.dueDate, from), lt(t.dueDate, to));

  const [monthly, prev, forecast, overdue, byCategory, byService, topClients, nextDue, pipeline, won] = await Promise.all([
    db.select({ m: ym, kind: t.kind, paid, open }).from(t).where(inRange).groupBy(ym, t.kind),
    db
      .select({ kind: t.kind, paid })
      .from(t)
      .where(and(gte(t.dueDate, prevFrom), lt(t.dueDate, from)))
      .groupBy(t.kind),
    db
      .select({ m: ym, kind: t.kind, open })
      .from(t)
      .where(and(isNull(t.paidAt), gte(t.dueDate, `${curMonth}-01`), lt(t.dueDate, fTo)))
      .groupBy(ym, t.kind),
    db
      .select({ kind: t.kind, total: sql<number>`coalesce(sum(${t.amountCents}),0)::bigint`, n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(isNull(t.paidAt), lt(t.dueDate, today)))
      .groupBy(t.kind),
    db
      .select({ kind: t.kind, label: sql<string>`coalesce(nullif(trim(${t.category}),''),'Sem categoria')`, total: sql<number>`sum(${t.amountCents})::bigint` })
      .from(t)
      .where(inRange)
      .groupBy(t.kind, sql`2`),
    db
      .select({ label: sql<string>`coalesce(${schema.deals.service},'Sem serviço definido')`, total: sql<number>`sum(${t.amountCents})::bigint` })
      .from(t)
      .leftJoin(schema.deals, eq(t.dealId, schema.deals.id))
      .where(and(inRange, eq(t.kind, "receita")))
      .groupBy(sql`1`),
    db
      .select({ label: schema.contacts.name, total: sql<number>`sum(${t.amountCents})::bigint` })
      .from(t)
      .innerJoin(schema.contacts, eq(t.contactId, schema.contacts.id))
      .where(and(inRange, eq(t.kind, "receita")))
      .groupBy(schema.contacts.name)
      .orderBy(desc(sql`2`))
      .limit(5),
    db
      .select({ id: t.id, kind: t.kind, description: t.description, amountCents: t.amountCents, dueDate: t.dueDate, dealId: t.dealId })
      .from(t)
      .where(and(isNull(t.paidAt), gte(t.dueDate, today), lte(t.dueDate, new Date(Date.parse(today + "T12:00:00Z") + 14 * 864e5).toISOString().slice(0, 10))))
      .orderBy(asc(t.dueDate))
      .limit(8),
    db
      .select({
        total: sql<number>`coalesce(sum(${schema.deals.valueCents}),0)::bigint`,
        weighted: sql<number>`coalesce(sum(${schema.deals.valueCents} * ${schema.stages.probability} / 100.0),0)::bigint`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.deals)
      .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
      .where(eq(schema.stages.kind, "aberto")),
    db
      .select({ n: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(${schema.deals.valueCents}),0)::bigint` })
      .from(schema.deals)
      .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
      .where(and(eq(schema.stages.kind, "ganho"), gte(schema.deals.closedAt, new Date(`${from}T00:00:00-03:00`)), lt(schema.deals.closedAt, new Date(`${to}T00:00:00-03:00`)))),
  ]);

  const series: MonthPoint[] = months.map((key) => {
    const g = (kind: string) => monthly.find((r) => r.m === key && r.kind === kind);
    return { key, inPaid: num(g("receita")?.paid), inOpen: num(g("receita")?.open), outPaid: num(g("despesa")?.paid), outOpen: num(g("despesa")?.open) };
  });
  const fSeries: MonthPoint[] = fMonths.map((key) => {
    const g = (kind: string) => forecast.find((r) => r.m === key && r.kind === kind);
    return { key, inPaid: num(g("receita")?.open), inOpen: 0, outPaid: num(g("despesa")?.open), outOpen: 0 };
  });

  const sum = (f: (p: MonthPoint) => number) => series.reduce((s, p) => s + f(p), 0);
  const inDone = sum((p) => p.inPaid);
  const outDone = sum((p) => p.outPaid);
  const inOpenTotal = sum((p) => p.inOpen);
  const outOpenTotal = sum((p) => p.outOpen);
  const prevIn = num(prev.find((r) => r.kind === "receita")?.paid);
  const prevOut = num(prev.find((r) => r.kind === "despesa")?.paid);

  const rank = (kind: "receita" | "despesa", max = 6): Ranked[] => {
    const all = byCategory
      .filter((r) => r.kind === kind)
      .map((r) => ({ label: r.label, value: num(r.total) }))
      .sort((a, b) => b.value - a.value);
    if (all.length <= max) return all;
    const head = all.slice(0, max - 1);
    return [...head, { label: "Outras", value: all.slice(max - 1).reduce((s, r) => s + r.value, 0) }];
  };

  const lateIn = overdue.find((o) => o.kind === "receita");
  const lateOut = overdue.find((o) => o.kind === "despesa");

  return {
    months,
    series,
    forecast: fSeries,
    totals: { inDone, outDone, result: inDone - outDone, inOpen: inOpenTotal, outOpen: outOpenTotal, prevIn, prevOut },
    overdue: { inTotal: num(lateIn?.total), inCount: lateIn?.n ?? 0, outTotal: num(lateOut?.total), outCount: lateOut?.n ?? 0 },
    categoriesIn: rank("receita"),
    categoriesOut: rank("despesa"),
    byService: byService
      .map((r) => ({ label: r.label, value: num(r.total) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    topClients: topClients.map((r) => ({ label: r.label, value: num(r.total) })),
    nextDue,
    pipeline: { total: num(pipeline[0]?.total), weighted: num(pipeline[0]?.weighted), n: pipeline[0]?.n ?? 0 },
    won: { n: won[0]?.n ?? 0, avg: num(won[0]?.avg) },
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/** Linhas da planilha (com nomes de cliente/negócio) para um intervalo [from, to) ou só os em aberto. */
export async function getSheetRows(opts: { from?: string; to?: string; onlyOpen?: boolean }): Promise<SheetRow[]> {
  const where = [
    opts.from ? gte(t.dueDate, opts.from) : undefined,
    opts.to ? lt(t.dueDate, opts.to) : undefined,
    opts.onlyOpen ? isNull(t.paidAt) : undefined,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const rows = await db
    .select({
      id: t.id,
      due: t.dueDate,
      kind: t.kind,
      description: t.description,
      category: t.category,
      amountCents: t.amountCents,
      paidAt: t.paidAt,
      notes: t.notes,
      contact: schema.contacts.name,
      deal: schema.deals.title,
    })
    .from(t)
    .leftJoin(schema.contacts, eq(t.contactId, schema.contacts.id))
    .leftJoin(schema.deals, eq(t.dealId, schema.deals.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(t.dueDate), asc(t.createdAt))
    .limit(3000);
  return rows.map((r) => ({
    id: r.id,
    due: r.due,
    kind: r.kind,
    description: r.description,
    category: r.category ?? "",
    amountCents: Number(r.amountCents),
    paidAt: r.paidAt ?? "",
    contact: r.contact ?? "",
    deal: r.deal ?? "",
    notes: r.notes ?? "",
  }));
}

/** Associa nomes digitados na planilha a clientes/negócios existentes (sem diferenciar maiúsculas). */
export async function resolveNames(contacts: string[], deals: string[]) {
  const lc = (s: string) => s.trim().toLowerCase();
  const cs = [...new Set(contacts.map(lc).filter(Boolean))];
  const ds = [...new Set(deals.map(lc).filter(Boolean))];
  const [cRows, dRows] = await Promise.all([
    cs.length ? db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).where(inArray(sql`lower(${schema.contacts.name})`, cs)) : [],
    ds.length ? db.select({ id: schema.deals.id, title: schema.deals.title, contactId: schema.deals.contactId }).from(schema.deals).where(inArray(sql`lower(${schema.deals.title})`, ds)) : [],
  ]);
  return {
    contact: new Map(cRows.map((r) => [lc(r.name), r.id])),
    deal: new Map(dRows.map((r) => [lc(r.title), r.id])),
  };
}
