import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PAGE_SIZE, daysLeft, effectiveSituation, type EditalFilters } from "./filters";
import type { EditalRow } from "@/lib/db/schema";

export type EditalDTO = {
  id: string;
  externalId: string;
  title: string;
  object: string;
  organ: string;
  unit: string | null;
  esfera: string | null;
  uf: string | null;
  city: string | null;
  modalidade: string | null;
  kind: string;
  kindWhy: string | null;
  score: number;
  matched: string[];
  valueCents: number | null;
  publishedAt: string | null;
  openAt: string | null;
  closeAt: string | null;
  /** situação efetiva (aberto vencido = encerrado) */
  situation: string;
  url: string | null;
  sourceUrl: string | null;
  triage: string;
  discardReason: string | null;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dealId: string | null;
  taskId: string | null;
  firstSeenAt: string;
  daysLeft: number | null;
};

export function toDTO(r: EditalRow, ownerName: string | null = null, nowMs = Date.now()): EditalDTO {
  return {
    id: r.id,
    externalId: r.externalId,
    title: r.title,
    object: r.object,
    organ: r.organ,
    unit: r.unit,
    esfera: r.esfera,
    uf: r.uf,
    city: r.city,
    modalidade: r.modalidade,
    kind: r.kind,
    kindWhy: r.kindWhy,
    score: r.score,
    matched: r.matched ?? [],
    valueCents: r.valueCents,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    openAt: r.openAt?.toISOString() ?? null,
    closeAt: r.closeAt?.toISOString() ?? null,
    situation: effectiveSituation(r, nowMs),
    url: r.url,
    sourceUrl: r.sourceUrl,
    triage: r.triage,
    discardReason: r.discardReason,
    notes: r.notes,
    ownerId: r.ownerId,
    ownerName,
    dealId: r.dealId,
    taskId: r.taskId,
    firstSeenAt: r.firstSeenAt.toISOString(),
    daysLeft: daysLeft(r.closeAt, nowMs),
  };
}

const E = schema.editais;

/** WHERE da lista. `skipUf` ignora o filtro de UF (usado nos contadores por UF). */
export function editalWhere(f: EditalFilters, userId: string, opts: { skipUf?: boolean } = {}): SQL | undefined {
  const now = new Date();
  const c: (SQL | undefined)[] = [];
  for (const w of f.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
    const like = `%${w.replace(/[%_]/g, "")}%`;
    c.push(or(ilike(E.title, like), ilike(E.object, like), ilike(E.organ, like), ilike(E.city, like), ilike(E.externalId, like)));
  }
  if (f.tipos.length) {
    const kinds = new Set<string>(f.tipos);
    if (kinds.has("projeto") || kinds.has("execucao")) kinds.add("projeto_execucao");
    c.push(inArray(E.kind, [...kinds]));
  }
  if (f.esfera) c.push(eq(E.esfera, f.esfera));
  if (!opts.skipUf && f.ufs.length) c.push(inArray(E.uf, f.ufs));
  if (f.city) c.push(ilike(E.city, `%${f.city.replace(/[%_]/g, "")}%`));
  if (f.vmin !== null) c.push(gte(E.valueCents, Math.round(f.vmin * 100)));
  if (f.vmax !== null) c.push(lte(E.valueCents, Math.round(f.vmax * 100)));
  if (f.situacao === "aberto") c.push(and(eq(E.situation, "aberto"), or(isNull(E.closeAt), gte(E.closeAt, now))));
  else if (f.situacao === "encerrado") c.push(or(eq(E.situation, "encerrado"), and(eq(E.situation, "aberto"), lte(E.closeAt, now))));
  else if (f.situacao !== "todos") c.push(eq(E.situation, f.situacao));
  if (f.prazo) c.push(and(gte(E.closeAt, now), lte(E.closeAt, new Date(now.getTime() + f.prazo * 864e5))));
  if (f.triagem === "" ) c.push(ne(E.triage, "descartado"));
  else if (f.triagem === "ativos") c.push(inArray(E.triage, ["novo", "interessante", "em_analise", "em_proposta", "proposta_enviada"]));
  else if (f.triagem !== "todos") c.push(eq(E.triage, f.triagem));
  if (f.rel > 0) c.push(gte(E.score, f.rel));
  if (f.owner) c.push(f.owner === "me" ? eq(E.ownerId, userId) : f.owner === "sem" ? isNull(E.ownerId) : eq(E.ownerId, f.owner));
  return and(...c);
}

const ORDER = {
  prazo: [sql`${E.closeAt} asc nulls last`, desc(E.score)],
  relevancia: [desc(E.score), sql`${E.closeAt} asc nulls last`],
  valor: [sql`${E.valueCents} desc nulls last`, desc(E.score)],
  recentes: [desc(E.firstSeenAt), desc(E.score)],
} as const;

export type ListResult = {
  rows: EditalDTO[];
  total: number;
  ufCounts: { uf: string; n: number }[];
  kpis: { novos: number; encerrando7: number; interessantes: number; abertos: number };
  lastRun: { status: string; finishedAt: string | null; stats: Record<string, unknown> } | null;
};

export async function listEditais(f: EditalFilters, userId: string): Promise<ListResult> {
  const where = editalWhere(f, userId);
  const now = new Date();
  const openNow = and(eq(E.situation, "aberto"), or(isNull(E.closeAt), gte(E.closeAt, now)), ne(E.triage, "descartado"), gte(E.score, 50));
  const [rows, [tot], ufRows, [k]] = await Promise.all([
    db
      .select({ e: E, ownerName: schema.users.name })
      .from(E)
      .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
      .where(where)
      .orderBy(...ORDER[f.sort])
      .limit(PAGE_SIZE * f.page),
    db.select({ n: sql<number>`count(*)::int` }).from(E).where(where),
    db
      .select({ uf: E.uf, n: sql<number>`count(*)::int` })
      .from(E)
      .where(editalWhere(f, userId, { skipUf: true }))
      .groupBy(E.uf),
    db
      .select({
        novos: sql<number>`count(*) filter (where ${E.triage} = 'novo' and ${E.firstSeenAt} > now() - interval '7 days')::int`,
        encerrando7: sql<number>`count(*) filter (where ${E.closeAt} <= now() + interval '7 days' and ${E.triage} <> 'novo')::int`,
        interessantes: sql<number>`count(*) filter (where ${E.triage} in ('interessante','em_analise','em_proposta'))::int`,
        abertos: sql<number>`count(*)::int`,
      })
      .from(E)
      .where(openNow),
  ]);
  const [run] = await db.select().from(schema.editalRuns).where(inArray(schema.editalRuns.status, ["concluida", "parcial"])).orderBy(desc(schema.editalRuns.id)).limit(1);
  const nowMs = now.getTime();
  return {
    rows: rows.map((r) => toDTO(r.e, r.ownerName, nowMs)),
    total: tot?.n ?? 0,
    ufCounts: ufRows.filter((r) => r.uf).map((r) => ({ uf: r.uf as string, n: r.n })).sort((a, b) => b.n - a.n),
    kpis: k ?? { novos: 0, encerrando7: 0, interessantes: 0, abertos: 0 },
    lastRun: run ? { status: run.status, finishedAt: run.finishedAt?.toISOString() ?? null, stats: run.stats } : null,
  };
}

export async function getEdital(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db
    .select({ e: E, ownerName: schema.users.name })
    .from(E)
    .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
    .where(eq(E.id, id));
  if (!r) return null;
  const events = await db.select().from(schema.editalEvents).where(eq(schema.editalEvents.editalId, id)).orderBy(desc(schema.editalEvents.at)).limit(60);
  return {
    edital: toDTO(r.e, r.ownerName),
    events: events.map((v) => ({ id: v.id, at: v.at.toISOString(), userName: v.userName, type: v.type, body: v.body })),
  };
}

/** Linhas para o CSV (mesmo filtro da tela, sem paginação, até 2000). */
export async function exportEditais(f: EditalFilters, userId: string) {
  const rows = await db
    .select({ e: E, ownerName: schema.users.name })
    .from(E)
    .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
    .where(editalWhere(f, userId))
    .orderBy(...ORDER[f.sort])
    .limit(2000);
  return rows.map((r) => toDTO(r.e, r.ownerName));
}

/** Bloco “Oportunidades de restauro” do Painel. */
export async function dashboardEditais() {
  const now = new Date();
  const base = and(eq(E.situation, "aberto"), gte(E.closeAt, now), ne(E.triage, "descartado"), ne(E.triage, "perdido"), ne(E.triage, "ganho"), gte(E.score, 50));
  const [novos, encerrando, [cnt]] = await Promise.all([
    db
      .select({ e: E, ownerName: schema.users.name })
      .from(E)
      .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
      .where(and(base, eq(E.triage, "novo"), gte(E.score, 60), gte(E.firstSeenAt, new Date(now.getTime() - 14 * 864e5))))
      .orderBy(desc(E.score), desc(E.firstSeenAt))
      .limit(4),
    db
      .select({ e: E, ownerName: schema.users.name })
      .from(E)
      .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
      .where(and(base, lte(E.closeAt, new Date(now.getTime() + 7 * 864e5)), inArray(E.triage, ["interessante", "em_analise", "em_proposta", "proposta_enviada", "novo"])))
      .orderBy(asc(E.closeAt), desc(E.score))
      .limit(4),
    db
      .select({ novos: sql<number>`count(*) filter (where ${E.triage} = 'novo' and ${E.score} >= 60)::int`, abertos: sql<number>`count(*)::int` })
      .from(E)
      .where(base),
  ]);
  const nowMs = now.getTime();
  return {
    novos: novos.map((r) => toDTO(r.e, r.ownerName, nowMs)),
    encerrando: encerrando.map((r) => toDTO(r.e, r.ownerName, nowMs)),
    countNovos: cnt?.novos ?? 0,
    countAbertos: cnt?.abertos ?? 0,
  };
}

export async function recentRuns(limit = 8) {
  const rows = await db.select().from(schema.editalRuns).orderBy(desc(schema.editalRuns.id)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    mode: r.mode,
    trigger: r.trigger,
    requestedByName: r.requestedByName,
    requestedAt: r.requestedAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    parentId: r.parentId,
    runUrl: r.runUrl,
    stats: r.stats as Record<string, number | undefined>,
    error: r.error,
  }));
}
export type RunDTO = Awaited<ReturnType<typeof recentRuns>>[number];
