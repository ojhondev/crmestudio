import "server-only";
import { and, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { editalWhere, toDTO, type EditalDTO } from "@/lib/editais/queries";
import { RADAR_TABS, tabCounts, type EditaisActor, type PartnerRole, type RadarTab, type Visibility } from "./access";
import { scopeCondition, accessTo } from "./authz";
import type { RadarFilters } from "./radar-filters";

const E = schema.editais;
export const RADAR_PAGE = 20;

export type RadarCard = EditalDTO & {
  /** quantos parceiros recebem este edital (equipe) */
  sharedCount: number;
  sharedNames: string[];
  /** proposta em andamento? e quanto do checklist está feito */
  dossie: { status: string; pct: number } | null;
  /** papel do parceiro neste edital (só para parceiro) */
  myRole: PartnerRole | null;
};

const ORDER = {
  prazo: [sql`${E.closeAt} asc nulls last`, desc(E.score)],
  relevancia: [desc(E.score), sql`${E.closeAt} asc nulls last`],
  valor: [sql`${E.valueCents} desc nulls last`, desc(E.score)],
  recentes: [desc(E.firstSeenAt), desc(E.score)],
} as const;

function tabCondition(tab: RadarTab): SQL | undefined {
  const t = RADAR_TABS.find((x) => x.key === tab);
  return t?.triages ? inArray(E.triage, t.triages) : undefined;
}

/** WHERE completo do Radar (filtros + aba + modalidade + o que o ator pode ver). */
export function radarWhere(actor: EditaisActor, f: RadarFilters, opts: { skipTab?: boolean; skipUf?: boolean } = {}): SQL | undefined {
  return and(
    editalWhere({ ...f, triagem: "todos" }, actor.id, { skipUf: opts.skipUf }),
    opts.skipTab ? undefined : tabCondition(f.tab),
    f.mod ? ilike(E.modalidade, `%${f.mod.replace(/[%_]/g, "")}%`) : undefined,
    scopeCondition(actor, E.id),
  );
}

export type RadarResult = {
  rows: RadarCard[];
  total: number;
  counts: Record<RadarTab, number>;
  hasMore: boolean;
  lastRun: { status: string; finishedAt: string | null } | null;
};

async function decorate(actor: EditaisActor, rows: { e: typeof E.$inferSelect; ownerName: string | null }[]): Promise<RadarCard[]> {
  const ids = rows.map((r) => r.e.id);
  if (!ids.length) return [];
  const nowMs = Date.now();
  const [shares, dossies, mine] = await Promise.all([
    actor.kind === "staff"
      ? db
          .select({ editalId: schema.editalShares.editalId, name: schema.users.name })
          .from(schema.editalShares)
          .innerJoin(schema.users, eq(schema.editalShares.partnerId, schema.users.id))
          .where(and(inArray(schema.editalShares.editalId, ids), eq(schema.users.active, true)))
      : Promise.resolve([]),
    db
      .select({
        editalId: schema.propostaDossies.editalId,
        status: schema.propostaDossies.status,
        total: sql<number>`(select count(*)::int from ${schema.propostaItems} where ${schema.propostaItems.dossieId} = ${schema.propostaDossies.id})`,
        done: sql<number>`(select count(*)::int from ${schema.propostaItems} where ${schema.propostaItems.dossieId} = ${schema.propostaDossies.id} and ${schema.propostaItems.done})`,
      })
      .from(schema.propostaDossies)
      .where(inArray(schema.propostaDossies.editalId, ids)),
    actor.kind === "partner"
      ? db.select({ editalId: schema.editalShares.editalId, role: schema.editalShares.role, scope: schema.editalShares.scope }).from(schema.editalShares).where(and(eq(schema.editalShares.partnerId, actor.id), inArray(schema.editalShares.editalId, ids)))
      : Promise.resolve([]),
  ]);
  return rows.map(({ e, ownerName }) => {
    const sh = shares.filter((s) => s.editalId === e.id);
    const d = dossies.find((x) => x.editalId === e.id);
    const my = mine.find((m) => m.editalId === e.id);
    // parceiro só vê o andamento da proposta se ela foi compartilhada
    const showDossie = !!d && (actor.kind === "staff" || my?.scope === "proposta");
    return {
      ...toDTO(e, actor.kind === "staff" ? ownerName : null, nowMs),
      // notas internas, descarte e responsável nunca vão para o parceiro
      notes: actor.kind === "staff" ? e.notes : null,
      discardReason: actor.kind === "staff" ? e.discardReason : null,
      ownerId: actor.kind === "staff" ? e.ownerId : null,
      dealId: actor.kind === "staff" ? e.dealId : null,
      taskId: actor.kind === "staff" ? e.taskId : null,
      triage: actor.kind === "staff" ? e.triage : e.triage === "novo" ? "novo" : "interessante",
      sharedCount: sh.length,
      sharedNames: sh.slice(0, 3).map((s) => s.name),
      dossie: showDossie ? { status: d.status, pct: d.total ? Math.round((d.done / d.total) * 100) : 0 } : null,
      myRole: my ? (my.role === "contribuir" ? "contribuir" : "ver") : null,
    };
  });
}

export async function radarList(actor: EditaisActor, f: RadarFilters): Promise<RadarResult> {
  const where = radarWhere(actor, f);
  const limit = RADAR_PAGE * f.page;
  const [rows, [tot], byTriage, [run]] = await Promise.all([
    db
      .select({ e: E, ownerName: schema.users.name })
      .from(E)
      .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
      .where(where)
      .orderBy(...ORDER[f.sort])
      .limit(limit + 1),
    db.select({ n: sql<number>`count(*)::int` }).from(E).where(where),
    db.select({ triage: E.triage, n: sql<number>`count(*)::int` }).from(E).where(radarWhere(actor, f, { skipTab: true })).groupBy(E.triage),
    db.select().from(schema.editalRuns).where(inArray(schema.editalRuns.status, ["concluida", "parcial"])).orderBy(desc(schema.editalRuns.id)).limit(1),
  ]);
  const hasMore = rows.length > limit;
  const cards = await decorate(actor, rows.slice(0, limit));
  return {
    rows: cards,
    total: tot?.n ?? 0,
    counts: tabCounts(Object.fromEntries(byTriage.map((r) => [r.triage, r.n]))),
    hasMore,
    lastRun: run ? { status: run.status, finishedAt: run.finishedAt?.toISOString() ?? null } : null,
  };
}

/** Uma página (para "carregar mais"): só as linhas novas. */
export async function radarPage(actor: EditaisActor, f: RadarFilters): Promise<{ rows: RadarCard[]; hasMore: boolean }> {
  const where = radarWhere(actor, f);
  const offset = RADAR_PAGE * (f.page - 1);
  const rows = await db
    .select({ e: E, ownerName: schema.users.name })
    .from(E)
    .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
    .where(where)
    .orderBy(...ORDER[f.sort])
    .limit(RADAR_PAGE + 1)
    .offset(offset);
  return { rows: await decorate(actor, rows.slice(0, RADAR_PAGE)), hasMore: rows.length > RADAR_PAGE };
}

/** Linhas para o CSV (só equipe): o mesmo filtro da tela, sem paginação, até 2000. */
export async function radarExport(actor: EditaisActor, f: RadarFilters) {
  const rows = await db
    .select({ e: E, ownerName: schema.users.name })
    .from(E)
    .leftJoin(schema.users, eq(E.ownerId, schema.users.id))
    .where(radarWhere(actor, f))
    .orderBy(...ORDER[f.sort])
    .limit(2000);
  return rows.map((r) => toDTO(r.e, r.ownerName));
}

/** UFs com edital no filtro atual (o seletor de UF mostra quantos há em cada). */
export async function radarUfCounts(actor: EditaisActor, f: RadarFilters) {
  const rows = await db.select({ uf: E.uf, n: sql<number>`count(*)::int` }).from(E).where(radarWhere(actor, f, { skipUf: true })).groupBy(E.uf);
  return rows.filter((r) => r.uf).map((r) => ({ uf: r.uf as string, n: r.n })).sort((a, b) => b.n - a.n);
}

/* ------------------------------------ detalhe ------------------------------------ */

export type CommentDTO = {
  id: string;
  userId: string | null;
  userName: string;
  isPartner: boolean;
  kind: string;
  body: string;
  linkUrl: string | null;
  linkName: string | null;
  reviewStatus: string | null;
  internal: boolean;
  at: string;
};

export type RadarDetail = {
  card: RadarCard;
  vis: Visibility;
  events: { id: number; at: string; userName: string | null; type: string; body: string }[];
  comments: CommentDTO[];
  shares: { id: string; partnerId: string; partnerName: string; role: PartnerRole; scope: string }[];
  hasDossie: boolean;
};

export async function listComments(actor: EditaisActor, editalId: string, limit = 80): Promise<CommentDTO[]> {
  const rows = await db
    .select({ c: schema.editalComments, partnerId: schema.editalPartners.userId })
    .from(schema.editalComments)
    .leftJoin(schema.editalPartners, eq(schema.editalComments.userId, schema.editalPartners.userId))
    .where(and(eq(schema.editalComments.editalId, editalId), actor.kind === "partner" ? eq(schema.editalComments.internal, false) : undefined))
    .orderBy(desc(schema.editalComments.createdAt))
    .limit(limit);
  return rows.map(({ c, partnerId }) => ({
    id: c.id,
    userId: c.userId,
    userName: c.userName ?? "Alguém",
    isPartner: !!partnerId,
    kind: c.kind,
    body: c.body,
    linkUrl: c.linkUrl,
    linkName: c.linkName,
    reviewStatus: c.reviewStatus,
    internal: c.internal,
    at: c.createdAt.toISOString(),
  }));
}

export async function radarDetail(actor: EditaisActor, id: string): Promise<RadarDetail | null> {
  const vis = await accessTo(actor, id);
  if (!vis.edital) return null; // 404 para quem não vê: não confirma que o edital existe
  const [row] = await db.select({ e: E, ownerName: schema.users.name }).from(E).leftJoin(schema.users, eq(E.ownerId, schema.users.id)).where(eq(E.id, id)).limit(1);
  if (!row) return null;
  const [card] = await decorate(actor, [row]);
  const [events, comments, shares, dossie] = await Promise.all([
    vis.staff ? db.select().from(schema.editalEvents).where(eq(schema.editalEvents.editalId, id)).orderBy(desc(schema.editalEvents.at)).limit(40) : Promise.resolve([]),
    listComments(actor, id),
    vis.staff
      ? db
          .select({ id: schema.editalShares.id, partnerId: schema.editalShares.partnerId, partnerName: schema.users.name, role: schema.editalShares.role, scope: schema.editalShares.scope })
          .from(schema.editalShares)
          .innerJoin(schema.users, eq(schema.editalShares.partnerId, schema.users.id))
          .where(eq(schema.editalShares.editalId, id))
      : Promise.resolve([]),
    db.select({ id: schema.propostaDossies.id }).from(schema.propostaDossies).where(eq(schema.propostaDossies.editalId, id)).limit(1),
  ]);
  return {
    card,
    vis,
    events: events.map((v) => ({ id: v.id, at: v.at.toISOString(), userName: v.userName, type: v.type, body: v.body })),
    comments,
    shares: shares.map((s) => ({ ...s, role: s.role === "contribuir" ? "contribuir" : "ver" })),
    hasDossie: dossie.length > 0,
  };
}

/** Termos casados em linguagem simples ("O texto fala de restauração, forro…"). */
export function relevanceWhy(e: { matched: string[]; kindWhy: string | null }): string {
  const terms = [...new Set(e.matched.map((t) => t.trim()).filter(Boolean))].slice(0, 6);
  const parts: string[] = [];
  if (terms.length) parts.push(`O texto fala de ${terms.join(", ")}.`);
  if (e.kindWhy) parts.push(e.kindWhy.endsWith(".") ? e.kindWhy : `${e.kindWhy}.`);
  return parts.join(" ") || "Entrou no Radar pelas palavras do objeto.";
}
