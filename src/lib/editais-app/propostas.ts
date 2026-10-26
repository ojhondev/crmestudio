import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { todayISO } from "@/lib/format";
import { diffDaysISO } from "@/lib/propostas/dates";
import { dossieProgress, urgencyOf, type Progress, type Urgency } from "@/lib/propostas/progress";
import { dayOf, deadlineOf, loadBundle } from "@/lib/propostas/server";
import { boardColumn, type BoardColumn, type EditaisActor, type PartnerRole, type Visibility } from "./access";
import { accessTo, scopeCondition } from "./authz";
import { redactBundle, type DossieView } from "./redact";

export type BoardCard = {
  editalId: string;
  title: string;
  organ: string;
  place: string;
  kind: string;
  /** valor estimado do órgão (público, vem do portal) */
  valueCents: number | null;
  status: string;
  column: BoardColumn;
  daysLeft: number | null;
  deadlineDay: string | null;
  urgency: Urgency;
  ownerName: string | null;
  progress: Progress;
  partners: string[];
  myRole: PartnerRole | null;
  resultReason: string | null;
};

export type BoardData = { cards: BoardCard[]; counts: Record<BoardColumn, number>; hasMoreFinished: boolean };

export const FINISHED_PAGE = 24;

/** Quadro de propostas. Parceiro: só as propostas compartilhadas com ele (escopo "proposta"). */
export async function boardData(actor: EditaisActor, opts: { finishedPage?: number } = {}): Promise<BoardData> {
  const today = todayISO();
  const scope = scopeCondition(actor, schema.editais.id, { onlyProposta: true });
  const base = await db
    .select({ d: schema.propostaDossies, e: schema.editais, ownerName: schema.users.name })
    .from(schema.propostaDossies)
    .innerJoin(schema.editais, eq(schema.propostaDossies.editalId, schema.editais.id))
    .leftJoin(schema.users, eq(schema.propostaDossies.ownerId, schema.users.id))
    .where(scope)
    .orderBy(sql`coalesce(${schema.propostaDossies.sessionAt}, ${schema.editais.closeAt}, ${schema.editais.openAt}) asc nulls last`)
    .limit(600);
  const open = base.filter((r) => r.d.status === "andamento");
  const finishedAll = base.filter((r) => r.d.status !== "andamento").sort((a, b) => (b.d.resultAt?.getTime() ?? b.d.updatedAt.getTime()) - (a.d.resultAt?.getTime() ?? a.d.updatedAt.getTime()));
  const finishedLimit = FINISHED_PAGE * (opts.finishedPage ?? 1);
  const rows = [...open, ...finishedAll.slice(0, finishedLimit)];
  const ids = rows.map((r) => r.d.id);
  const editalIds = rows.map((r) => r.e.id);
  const [steps, items, shares, mine] = ids.length
    ? await Promise.all([
        db.select().from(schema.propostaSteps).where(inArray(schema.propostaSteps.dossieId, ids)),
        db
          .select({ dossieId: schema.propostaItems.dossieId, stepKey: schema.propostaItems.stepKey, done: schema.propostaItems.done, taskDone: schema.tasks.doneAt, dueAt: schema.propostaItems.dueAt })
          .from(schema.propostaItems)
          .leftJoin(schema.tasks, eq(schema.propostaItems.taskId, schema.tasks.id))
          .where(inArray(schema.propostaItems.dossieId, ids)),
        actor.kind === "staff"
          ? db.select({ editalId: schema.editalShares.editalId, name: schema.users.name }).from(schema.editalShares).innerJoin(schema.users, eq(schema.editalShares.partnerId, schema.users.id)).where(inArray(schema.editalShares.editalId, editalIds))
          : Promise.resolve([]),
        actor.kind === "partner"
          ? db.select({ editalId: schema.editalShares.editalId, role: schema.editalShares.role }).from(schema.editalShares).where(and(eq(schema.editalShares.partnerId, actor.id), inArray(schema.editalShares.editalId, editalIds)))
          : Promise.resolve([]),
      ])
    : [[], [], [], []];

  const cards: BoardCard[] = rows.map(({ d, e, ownerName }) => {
    const deadlineDay = dayOf(deadlineOf(d, e));
    const daysLeft = deadlineDay ? diffDaysISO(today, deadlineDay) : null;
    const st = steps.filter((s) => s.dossieId === d.id).map((s) => ({ key: s.key, status: s.status, dueDay: dayOf(s.dueAt), assigneeId: s.assigneeId }));
    const its = items.filter((i) => i.dossieId === d.id).map((i) => ({ stepKey: i.stepKey, done: i.done || !!i.taskDone, dueDay: dayOf(i.dueAt) }));
    return {
      editalId: e.id,
      title: e.title,
      organ: e.organ,
      place: [e.city, e.uf].filter(Boolean).join("/"),
      kind: e.kind,
      valueCents: e.valueCents,
      status: d.status,
      column: boardColumn({ status: d.status, steps: st }),
      daysLeft,
      deadlineDay,
      urgency: d.status === "andamento" ? urgencyOf(daysLeft) : "none",
      ownerName: actor.kind === "staff" ? ownerName : null,
      progress: dossieProgress(st, its, today),
      partners: shares.filter((s) => s.editalId === e.id).map((s) => s.name),
      myRole: (() => {
        const m = mine.find((x) => x.editalId === e.id);
        return m ? (m.role === "contribuir" ? "contribuir" : "ver") : null;
      })(),
      resultReason: actor.kind === "staff" ? d.resultReason : null,
    };
  });
  const counts = { analisando: 0, preparando: 0, enviada: 0, resultado: 0 } as Record<BoardColumn, number>;
  for (const c of cards) counts[c.column]++;
  counts.resultado = finishedAll.length; // total real, não só a página
  return { cards, counts, hasMoreFinished: finishedAll.length > finishedLimit };
}

/** Dossiê para a tela: já recortado conforme quem pede. null = sem acesso ou sem dossiê (a tela mostra 404). */
export async function dossieView(actor: EditaisActor, editalId: string): Promise<{ view: DossieView; vis: Visibility } | null> {
  const vis = await accessTo(actor, editalId);
  if (!vis.proposta) return null;
  const b = await loadBundle(editalId);
  if (!b) return null;
  return { view: redactBundle(b, vis), vis };
}

/** Pessoas que podem receber uma atribuição neste edital: equipe ativa + parceiros com proposta compartilhada para contribuir. */
export async function assignablePeople(editalId: string) {
  const [team, partners] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, profile: schema.users.profile, role: schema.users.role }).from(schema.users).where(eq(schema.users.active, true)),
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.editalShares)
      .innerJoin(schema.users, eq(schema.editalShares.partnerId, schema.users.id))
      .where(and(eq(schema.editalShares.editalId, editalId), eq(schema.editalShares.scope, "proposta"), eq(schema.editalShares.role, "contribuir"), eq(schema.users.active, true))),
  ]);
  return [
    ...team.filter((u) => u.profile !== "parceiro_editais" && u.role !== "parceiro").map((u) => ({ id: u.id, name: u.name, partner: false })).sort((a, b) => a.name.localeCompare(b.name)),
    ...partners.map((p) => ({ id: p.id, name: p.name, partner: true })),
  ];
}

