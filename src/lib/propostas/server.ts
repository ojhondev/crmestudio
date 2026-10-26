import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { EditalRow } from "@/lib/db/schema";
import { isoDateBR, toLocalInput, todayISO } from "@/lib/format";
import { toDTO, type EditalDTO } from "@/lib/editais/queries";
import { diffDaysISO } from "./dates";
import { BUILTIN_CHECKLISTS, BUILTIN_MATRICES, suggestTemplateKey } from "./templates";
import { evaluateMatrix, summarizeMatrix, type CofreLite, type MatrixRow, type MatrixSummary } from "./cofre";
import { dossieProgress, overallRate, successRate, topReasons, urgencyOf, type Progress, type RateGroup, type Urgency } from "./progress";
import { DEFAULT_CONFIG, isRoleKey, type MatrixItem, type PropostasConfig, type TemplateItem } from "./types";

/* ------------------------------------ configuração ------------------------------------ */

const CONFIG_KEY = "propostas_config";

export async function getConfig(): Promise<PropostasConfig> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, CONFIG_KEY)).limit(1);
  const v = (row?.value ?? {}) as Partial<PropostasConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...v,
    legalRep: { ...DEFAULT_CONFIG.legalRep, ...(v.legalRep ?? {}) },
    technical: Array.isArray(v.technical) ? v.technical : [],
    roles: v.roles && typeof v.roles === "object" ? Object.fromEntries(Object.entries(v.roles).filter(([k, id]) => isRoleKey(k) && typeof id === "string")) : {},
    lossReasons: Array.isArray(v.lossReasons) && v.lossReasons.length ? v.lossReasons : DEFAULT_CONFIG.lossReasons,
    defaultTemplate: { ...DEFAULT_CONFIG.defaultTemplate, ...(v.defaultTemplate ?? {}) },
  };
}

export async function setConfig(cfg: PropostasConfig) {
  await db
    .insert(schema.appSettings)
    .values({ key: CONFIG_KEY, value: cfg, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: cfg, updatedAt: new Date() } });
}

/* ------------------------------------ modelos ------------------------------------ */

export const matrixKeyFor = (checklistKey: string) => `matriz-${checklistKey}`;

let seeded = false;
/** Garante os modelos que acompanham o sistema (cada um criado uma vez; depois a equipe é quem manda neles). */
export async function ensureTemplates() {
  if (seeded) return;
  const have = await db.select({ key: schema.propostaTemplates.key }).from(schema.propostaTemplates);
  const keys = new Set(have.map((r) => r.key));
  const rows = [
    ...BUILTIN_CHECKLISTS.filter((c) => !keys.has(c.key)).map((c) => ({ key: c.key, type: "checklist", name: c.name, description: c.description, items: c.items as unknown as TemplateItem[], builtin: true })),
    ...BUILTIN_MATRICES.filter((m) => !keys.has(matrixKeyFor(m.key))).map((m) => ({ key: matrixKeyFor(m.key), type: "matriz", name: m.name, description: m.description, items: m.items as MatrixItem[], builtin: true })),
  ];
  if (rows.length) await db.insert(schema.propostaTemplates).values(rows as (typeof schema.propostaTemplates.$inferInsert)[]).onConflictDoNothing();
  seeded = true;
}

export async function listTemplates(type: "checklist" | "matriz", onlyActive = true) {
  await ensureTemplates();
  return db
    .select()
    .from(schema.propostaTemplates)
    .where(and(eq(schema.propostaTemplates.type, type), onlyActive ? eq(schema.propostaTemplates.active, true) : undefined))
    .orderBy(asc(schema.propostaTemplates.name));
}

/* ------------------------------------ equipe ------------------------------------ */

export async function activeUsers() {
  return db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
}

/* ------------------------------------ dossiê completo ------------------------------------ */

export const dayOf = (d: Date | null | undefined) => (d ? isoDateBR(d) : null);

/** Data limite do dossiê: a informada à mão, senão o encerramento das propostas do edital. */
export const deadlineOf = (d: { sessionAt: Date | null }, e: Pick<EditalRow, "closeAt" | "openAt">) => d.sessionAt ?? e.closeAt ?? e.openAt ?? null;

export type StepDTO = { id: number; key: string; position: number; status: string; assigneeId: string | null; assigneeName: string | null; dueDay: string | null; doneAt: string | null; overdue: boolean; itemsTotal: number; itemsDone: number };
export type ItemDTO = { id: string; stepKey: string; tplKey: string | null; title: string; position: number; role: string | null; dueDay: string | null; assigneeId: string | null; assigneeName: string | null; done: boolean; taskId: string | null; overdue: boolean };
export type RequirementDTO = { id: string; title: string; cofreType: string | null; cofreDocId: string | null; mode: string; notes: string | null };
export type DocDTO = { id: string; title: string; number: string | null; templateSlug: string | null; status: string; updatedAt: string };

export type Bundle = {
  dossie: {
    id: string;
    editalId: string;
    status: string;
    templateKey: string | null;
    matrixKey: string | null;
    numero: string | null;
    processo: string | null;
    sessionDay: string | null;
    sessionLocal: string;
    ownerId: string | null;
    ownerName: string | null;
    priceSheetId: string | null;
    resultReason: string | null;
    resultValueCents: number | null;
    resultNotes: string | null;
    resultAt: string | null;
    checklistAppliedAt: string | null;
  };
  edital: EditalDTO;
  deadlineDay: string | null;
  daysLeft: number | null;
  urgency: Urgency;
  steps: StepDTO[];
  items: ItemDTO[];
  progress: Progress;
  requirements: RequirementDTO[];
  matrix: MatrixRow[];
  matrixSummary: MatrixSummary;
  cofre: CofreLite[];
  docs: DocDTO[];
  sheet: { id: string; name: string } | null;
  deal: { id: string; title: string; stageName: string } | null;
};

export const toCofreLite = (c: typeof schema.cofreDocs.$inferSelect): CofreLite => ({ id: c.id, type: c.type, title: c.title, number: c.number, validUntil: c.validUntil, url: c.url });

export async function loadBundle(editalId: string): Promise<Bundle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(editalId)) return null;
  const [row] = await db
    .select({ d: schema.propostaDossies, e: schema.editais, ownerName: schema.users.name })
    .from(schema.propostaDossies)
    .innerJoin(schema.editais, eq(schema.propostaDossies.editalId, schema.editais.id))
    .leftJoin(schema.users, eq(schema.propostaDossies.ownerId, schema.users.id))
    .where(eq(schema.propostaDossies.editalId, editalId));
  if (!row) return null;
  const { d, e } = row;
  const today = todayISO();
  const [steps, items, reqs, cofre, docs, sheet, deal, people] = await Promise.all([
    db.select().from(schema.propostaSteps).where(eq(schema.propostaSteps.dossieId, d.id)).orderBy(asc(schema.propostaSteps.position)),
    db
      .select({ i: schema.propostaItems, taskDone: schema.tasks.doneAt })
      .from(schema.propostaItems)
      .leftJoin(schema.tasks, eq(schema.propostaItems.taskId, schema.tasks.id))
      .where(eq(schema.propostaItems.dossieId, d.id))
      .orderBy(asc(schema.propostaItems.position), asc(schema.propostaItems.createdAt)),
    db.select().from(schema.propostaRequirements).where(eq(schema.propostaRequirements.dossieId, d.id)).orderBy(asc(schema.propostaRequirements.position)),
    db.select().from(schema.cofreDocs).orderBy(asc(schema.cofreDocs.type), asc(schema.cofreDocs.validUntil)),
    db
      .select({ id: schema.documents.id, title: schema.documents.title, number: schema.documents.number, templateSlug: schema.documents.templateSlug, status: schema.documents.status, updatedAt: schema.documents.updatedAt })
      .from(schema.documents)
      .where(eq(schema.documents.editalId, e.id))
      .orderBy(asc(schema.documents.createdAt)),
    d.priceSheetId ? db.select({ id: schema.sheets.id, name: schema.sheets.name }).from(schema.sheets).where(eq(schema.sheets.id, d.priceSheetId)).limit(1) : Promise.resolve([]),
    e.dealId
      ? db.select({ id: schema.deals.id, title: schema.deals.title, stageName: schema.stages.name }).from(schema.deals).innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id)).where(eq(schema.deals.id, e.dealId)).limit(1)
      : Promise.resolve([]),
    activeUsers(),
  ]);
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const deadline = deadlineOf(d, e);
  const deadlineDay = dayOf(deadline);
  const daysLeft = deadlineDay ? diffDaysISO(today, deadlineDay) : null;

  const itemDtos: ItemDTO[] = items.map(({ i, taskDone }) => {
    const done = i.done || !!taskDone;
    const dueDay = dayOf(i.dueAt);
    return { id: i.id, stepKey: i.stepKey, tplKey: i.tplKey, title: i.title, position: i.position, role: i.role, dueDay, assigneeId: i.assigneeId, assigneeName: name(i.assigneeId), done, taskId: i.taskId, overdue: !done && !!dueDay && dueDay < today };
  });
  const stepDtos: StepDTO[] = steps.map((s) => {
    const its = itemDtos.filter((i) => i.stepKey === s.key);
    const dueDay = dayOf(s.dueAt);
    return {
      id: s.id,
      key: s.key,
      position: s.position,
      status: s.status,
      assigneeId: s.assigneeId,
      assigneeName: name(s.assigneeId),
      dueDay,
      doneAt: s.doneAt?.toISOString() ?? null,
      overdue: s.status !== "concluida" && s.status !== "nao_se_aplica" && !!dueDay && dueDay < today,
      itemsTotal: its.length,
      itemsDone: its.filter((i) => i.done).length,
    };
  });
  const cofreLite = cofre.map(toCofreLite);
  const matrix = evaluateMatrix(reqs.map((r) => ({ id: r.id, title: r.title, cofreType: r.cofreType, cofreDocId: r.cofreDocId, mode: r.mode })), cofreLite, deadlineDay, today);
  return {
    dossie: {
      id: d.id,
      editalId: d.editalId,
      status: d.status,
      templateKey: d.templateKey,
      matrixKey: d.matrixKey,
      numero: d.numero,
      processo: d.processo,
      sessionDay: dayOf(d.sessionAt),
      sessionLocal: toLocalInput(d.sessionAt),
      ownerId: d.ownerId,
      ownerName: row.ownerName,
      priceSheetId: d.priceSheetId,
      resultReason: d.resultReason,
      resultValueCents: d.resultValueCents,
      resultNotes: d.resultNotes,
      resultAt: d.resultAt?.toISOString() ?? null,
      checklistAppliedAt: d.checklistAppliedAt?.toISOString() ?? null,
    },
    edital: toDTO(e, name(e.ownerId)),
    deadlineDay,
    daysLeft,
    urgency: d.status === "andamento" ? urgencyOf(daysLeft) : "none",
    steps: stepDtos,
    items: itemDtos,
    progress: dossieProgress(
      stepDtos.map((s) => ({ key: s.key, status: s.status, dueDay: s.dueDay, assigneeId: s.assigneeId })),
      itemDtos.map((i) => ({ stepKey: i.stepKey, done: i.done, dueDay: i.dueDay })),
      today,
    ),
    requirements: reqs.map((r) => ({ id: r.id, title: r.title, cofreType: r.cofreType, cofreDocId: r.cofreDocId, mode: r.mode, notes: r.notes })),
    matrix,
    matrixSummary: summarizeMatrix(matrix),
    cofre: cofreLite,
    docs: docs.map((x) => ({ id: x.id, title: x.title, number: x.number, templateSlug: x.templateSlug, status: x.status, updatedAt: x.updatedAt.toISOString() })),
    sheet: sheet[0] ?? null,
    deal: deal[0] ?? null,
  };
}

/* ------------------------------------ lista / indicadores ------------------------------------ */

export type PropostaRow = {
  editalId: string;
  title: string;
  organ: string;
  place: string;
  kind: string;
  valueCents: number | null;
  status: string;
  deadlineDay: string | null;
  daysLeft: number | null;
  urgency: Urgency;
  ownerName: string | null;
  progress: Progress;
  matrix: MatrixSummary;
  currentStep: string | null;
  resultReason: string | null;
};

export type PropostasOverview = {
  rows: PropostaRow[];
  kpis: { andamento: number; urgentes: number; etapasAtrasadas: number; comPendencia: number; semResponsavel: number };
  stats: { overall: { total: number; won: number; rate: number }; byKind: RateGroup[]; byOrgan: RateGroup[]; reasons: { reason: string; n: number }[] };
};

export async function propostasOverview(filter: "andamento" | "encerradas" | "todas" = "andamento", limit = 200): Promise<PropostasOverview> {
  const today = todayISO();
  const all = await db
    .select({ d: schema.propostaDossies, e: schema.editais, ownerName: schema.users.name })
    .from(schema.propostaDossies)
    .innerJoin(schema.editais, eq(schema.propostaDossies.editalId, schema.editais.id))
    .leftJoin(schema.users, eq(schema.propostaDossies.ownerId, schema.users.id))
    .orderBy(sql`coalesce(${schema.propostaDossies.sessionAt}, ${schema.editais.closeAt}, ${schema.editais.openAt}) asc nulls last`)
    .limit(1000);
  const scoped = all.filter((r) => (filter === "andamento" ? r.d.status === "andamento" : filter === "encerradas" ? r.d.status !== "andamento" : true));
  const ids = scoped.slice(0, limit).map((r) => r.d.id);
  const [steps, items, reqs, cofre] = ids.length
    ? await Promise.all([
        db.select().from(schema.propostaSteps).where(inArray(schema.propostaSteps.dossieId, ids)),
        db
          .select({ dossieId: schema.propostaItems.dossieId, stepKey: schema.propostaItems.stepKey, done: schema.propostaItems.done, taskDone: schema.tasks.doneAt, dueAt: schema.propostaItems.dueAt })
          .from(schema.propostaItems)
          .leftJoin(schema.tasks, eq(schema.propostaItems.taskId, schema.tasks.id))
          .where(inArray(schema.propostaItems.dossieId, ids)),
        db.select().from(schema.propostaRequirements).where(inArray(schema.propostaRequirements.dossieId, ids)),
        db.select().from(schema.cofreDocs),
      ])
    : [[], [], [], []];
  const cofreLite = cofre.map(toCofreLite);
  const rows: PropostaRow[] = scoped.slice(0, limit).map(({ d, e, ownerName }) => {
    const deadlineDay = dayOf(deadlineOf(d, e));
    const daysLeft = deadlineDay ? diffDaysISO(today, deadlineDay) : null;
    const st = steps.filter((s) => s.dossieId === d.id).map((s) => ({ key: s.key, status: s.status, dueDay: dayOf(s.dueAt), assigneeId: s.assigneeId }));
    const its = items.filter((i) => i.dossieId === d.id).map((i) => ({ stepKey: i.stepKey, done: i.done || !!i.taskDone, dueDay: dayOf(i.dueAt) }));
    const matrix = summarizeMatrix(evaluateMatrix(reqs.filter((r) => r.dossieId === d.id).map((r) => ({ id: r.id, title: r.title, cofreType: r.cofreType, cofreDocId: r.cofreDocId, mode: r.mode })), cofreLite, deadlineDay, today));
    const progress = dossieProgress(st, its, today);
    return {
      editalId: e.id,
      title: e.title,
      organ: e.organ,
      place: [e.city, e.uf].filter(Boolean).join("/"),
      kind: e.kind,
      valueCents: e.valueCents,
      status: d.status,
      deadlineDay,
      daysLeft,
      urgency: d.status === "andamento" ? urgencyOf(daysLeft) : "none",
      ownerName,
      progress,
      matrix,
      currentStep: progress.currentStep,
      resultReason: d.resultReason,
    };
  });
  const open = rows.filter((r) => r.status === "andamento");
  const decided = all.map((r) => ({ status: r.d.status as "andamento", kind: r.e.kind, organ: r.e.organ, valueCents: r.d.resultValueCents }));
  return {
    rows,
    kpis: {
      andamento: open.length,
      urgentes: open.filter((r) => r.daysLeft !== null && r.daysLeft <= 7).length,
      etapasAtrasadas: open.reduce((n, r) => n + r.progress.overdueSteps, 0),
      comPendencia: open.filter((r) => r.matrix.problems > 0).length,
      semResponsavel: open.filter((r) => !r.ownerName).length,
    },
    stats: {
      overall: overallRate(decided),
      byKind: successRate(decided, "kind"),
      byOrgan: successRate(decided, "organ").slice(0, 8),
      reasons: topReasons(all.map((r) => ({ status: r.d.status, reason: r.d.resultReason }))),
    },
  };
}

/** Bloco do Painel: propostas em andamento, as mais urgentes primeiro. */
export async function dashboardPropostas() {
  const o = await propostasOverview("andamento", 6);
  return { rows: o.rows.slice(0, 4), kpis: o.kpis, rate: o.stats.overall };
}

/* ------------------------------------ cofre / portfólio ------------------------------------ */

export async function listCofre() {
  return db.select({ c: schema.cofreDocs, ownerName: schema.users.name }).from(schema.cofreDocs).leftJoin(schema.users, eq(schema.cofreDocs.ownerId, schema.users.id)).orderBy(asc(schema.cofreDocs.type), asc(schema.cofreDocs.validUntil));
}

export async function listPortfolio() {
  return db.select().from(schema.portfolioItems).orderBy(desc(schema.portfolioItems.year), asc(schema.portfolioItems.title));
}

/** Dossiês abertos sem edital deletado etc. — usado só para contar na barra de abas. */
export async function counts() {
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.propostaDossies).where(eq(schema.propostaDossies.status, "andamento"));
  const [b] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.cofreDocs)
    .where(sql`${schema.cofreDocs.validUntil} is not null and ${schema.cofreDocs.validUntil} <= current_date + 30`);
  return { andamento: a?.n ?? 0, cofreAlerta: b?.n ?? 0 };
}

/** Resumo para a gaveta do edital: já existe dossiê? quais modelos há? qual é o sugerido? */
export type PropostaBrief = {
  exists: boolean;
  status: string | null;
  pct: number;
  daysLeft: number | null;
  urgency: Urgency;
  suggestedTemplate: string;
  templates: { key: string; name: string }[];
};

export async function getPropostaBrief(editalId: string): Promise<PropostaBrief | null> {
  if (!/^[0-9a-f-]{36}$/i.test(editalId)) return null;
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  if (!e) return null;
  const [tpls, cfg, bundle] = await Promise.all([listTemplates("checklist"), getConfig(), loadBundle(editalId)]);
  const group = e.kind === "projeto" || e.kind === "laudo" ? cfg.defaultTemplate.projeto : cfg.defaultTemplate.execucao;
  const suggested = suggestTemplateKey(e.kind, e.modalidade, e.valueCents) === "dispensa" ? cfg.defaultTemplate.outro : group;
  return {
    exists: !!bundle,
    status: bundle?.dossie.status ?? null,
    pct: bundle?.progress.pct ?? 0,
    daysLeft: bundle?.daysLeft ?? null,
    urgency: bundle?.urgency ?? "none",
    suggestedTemplate: tpls.some((t) => t.key === suggested) ? suggested : (tpls[0]?.key ?? "obra"),
    templates: tpls.map((t) => ({ key: t.key, name: t.name })),
  };
}
