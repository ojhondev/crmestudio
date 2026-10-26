import "server-only";
import { and, asc, eq, isNotNull, like, max, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { EditalRow } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth";
import { has } from "@/lib/auth";
import { afterResponse, fireDealEvent, stageTriggers } from "@/lib/automations-engine";
import { cleanHtml } from "@/lib/docs/sanitize";
import { escapeHtml } from "@/lib/docs/variables";
import { insertSheet } from "@/lib/sheets/server";
import { money, todayISO } from "@/lib/format";
import { KIND_LABEL } from "@/lib/editais/types";
import { assigneeFor, itemDueAt, planChecklist, planSteps } from "./checklist";
import { dayToInstant } from "./dates";
import { PROPOSTA_DOCS } from "./doc-templates";
import { atestadoText, type PortfolioLite } from "./portfolio";
import { priceSheetTabs, type PriceItemInput } from "./price-sheet";
import { BUILTIN_CHECKLISTS, BUILTIN_MATRICES, suggestTemplateKey } from "./templates";
import { STEP_BY_KEY, type MatrixItem, type RoleKey, type StepKey, type StepStatus, type TemplateItem } from "./types";
import { stepStatusFromItems } from "./progress";
import { deadlineOf, dayOf, ensureTemplates, getConfig, matrixKeyFor } from "./server";

export type Actor = Pick<SessionUser, "id" | "name" | "perms" | "ownOnly" | "role">;

/** Papel que responde por cada etapa quando ninguém foi escolhido à mão. */
export const STEP_ROLE: Record<StepKey, RoleKey> = {
  analisar: "coordenacao",
  esclarecimentos: "coordenacao",
  habilitacao: "administrativo",
  tecnica: "tecnico",
  preco: "orcamento",
  revisao: "coordenacao",
  envio: "coordenacao",
  resultado: "coordenacao",
};

export async function editalNote(editalId: string, user: Pick<SessionUser, "id" | "name"> | null, type: string, body: string) {
  await db.insert(schema.editalEvents).values({ editalId, userId: user?.id ?? null, userName: user?.name ?? null, type, body: body.slice(0, 600) });
}

/* ----------------------------------- negócio ----------------------------------- */

/** Cria (ou reaproveita) o contato do órgão e o negócio do edital. Não mexe em negócio que já existe. */
export async function ensureDeal(user: Actor, e: EditalRow): Promise<string | null> {
  if (e.dealId) return e.dealId;
  if (!has(user, "negocios", "edit") || !has(user, "contatos", "edit")) return null;
  const [found] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(sql`lower(${schema.contacts.company}) = lower(${e.organ})`, eq(schema.contacts.source, "Licitação")))
    .limit(1);
  let contactId = found?.id ?? null;
  if (!contactId) {
    const [c] = await db
      .insert(schema.contacts)
      .values({ name: e.organ, company: e.organ, city: e.city, state: e.uf, document: e.organCnpj, source: "Licitação", tags: ["edital"], ownerId: user.id, notes: "Criado a partir de um edital de restauro." })
      .returning({ id: schema.contacts.id });
    contactId = c.id;
  }
  const [first] = await db.select().from(schema.stages).orderBy(asc(schema.stages.position)).limit(1);
  const [{ top }] = await db.select({ top: max(schema.deals.position) }).from(schema.deals).where(eq(schema.deals.stageId, first.id));
  const service = e.kind === "projeto" ? "Projeto de arquitetura" : e.kind === "laudo" ? "Diagnóstico / laudo técnico" : "Restauro";
  const closeText = e.closeAt ? e.closeAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "não informado";
  const [deal] = await db
    .insert(schema.deals)
    .values({
      title: e.title.slice(0, 120),
      contactId,
      stageId: first.id,
      valueCents: e.valueCents || 0,
      service,
      property: e.kind === "outro" ? null : "Bem tombado",
      location: [e.city, e.uf].filter(Boolean).join("/"),
      ownerId: e.ownerId ?? user.id,
      position: (top ?? 0) + 1,
      notes: `Edital (${KIND_LABEL[e.kind as keyof typeof KIND_LABEL] ?? e.kind}) · ${e.organ}\nPropostas até: ${closeText}\nPNCP: ${e.url ?? "—"}\nPortal de origem: ${e.sourceUrl ?? "—"}\nNº de controle: ${e.externalId}`,
    })
    .returning({ id: schema.deals.id });
  await db.insert(schema.activities).values({ dealId: deal.id, contactId, userId: user.id, type: "nota", body: `Negócio criado a partir do edital: ${e.title.slice(0, 200)}` });
  await db.update(schema.editais).set({ dealId: deal.id, updatedAt: new Date() }).where(eq(schema.editais.id, e.id));
  afterResponse(() => fireDealEvent(["deal_created"], deal.id, user, { eventKey: deal.id }));
  return deal.id;
}

/**
 * Move o negócio do edital sem mexer nas etapas que a equipe montou:
 *  - "enviada": procura a etapa de nome configurado (padrão “Proposta enviada”); se não existir, não move;
 *  - "ganho" / "perdido": usa a primeira etapa desse tipo.
 */
export async function moveDealFor(user: Actor, dealId: string | null, target: "enviada" | "ganho" | "perdido", opts: { stageName?: string; lostReason?: string } = {}): Promise<string | null> {
  if (!dealId || !has(user, "negocios", "edit")) return null;
  const stages = await db.select().from(schema.stages).orderBy(asc(schema.stages.position));
  const wanted = (opts.stageName || "Proposta enviada").trim().toLowerCase();
  const stage = target === "enviada" ? stages.find((s) => s.kind === "aberto" && s.name.trim().toLowerCase() === wanted) : stages.find((s) => s.kind === target);
  if (!stage) return null;
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
  if (!deal || deal.stageId === stage.id) return null;
  // “enviada” nunca tira o negócio de uma etapa mais avançada (negociação, fechado…)
  const cur = stages.find((s) => s.id === deal.stageId);
  if (target === "enviada" && cur && (cur.kind !== "aberto" || cur.position >= stage.position)) return null;
  await db
    .update(schema.deals)
    .set({ stageId: stage.id, closedAt: stage.kind === "aberto" ? null : new Date(), lostReason: target === "perdido" ? (opts.lostReason ?? deal.lostReason) : deal.lostReason, updatedAt: new Date() })
    .where(eq(schema.deals.id, dealId));
  await db.insert(schema.activities).values({ dealId, contactId: deal.contactId, userId: user.id, type: "etapa", body: `Movido para “${stage.name}” (esteira de proposta)` });
  afterResponse(() => fireDealEvent(stageTriggers(stage.kind), dealId, user, { eventKey: `${stage.id}:${Date.now()}` }));
  return stage.name;
}

/* ----------------------------------- checklist ----------------------------------- */

async function templateItems(key: string | null): Promise<TemplateItem[]> {
  await ensureTemplates();
  const k = key ?? "obra";
  const [row] = await db.select().from(schema.propostaTemplates).where(eq(schema.propostaTemplates.key, k)).limit(1);
  const items = (row?.items ?? BUILTIN_CHECKLISTS.find((c) => c.key === k)?.items ?? BUILTIN_CHECKLISTS[0].items) as TemplateItem[];
  return items.filter((i) => i && typeof i.key === "string" && typeof i.title === "string" && i.step in STEP_BY_KEY);
}

async function matrixItems(checklistKey: string | null, matrixKey?: string | null): Promise<{ key: string; items: MatrixItem[] }> {
  await ensureTemplates();
  const k = matrixKey ?? matrixKeyFor(checklistKey ?? "obra");
  const [row] = await db.select().from(schema.propostaTemplates).where(eq(schema.propostaTemplates.key, k)).limit(1);
  const fallback = BUILTIN_MATRICES.find((m) => matrixKeyFor(m.key) === k) ?? BUILTIN_MATRICES[0];
  return { key: row ? k : matrixKeyFor(fallback.key), items: ((row?.items ?? fallback.items) as MatrixItem[]).filter((i) => i && typeof i.key === "string" && typeof i.title === "string") };
}

/** Itens do modelo que ainda não existem no dossiê (não duplica; não mexe no que a equipe já alterou). */
export async function applyChecklist(user: Actor, dossieId: string): Promise<{ created: number }> {
  const [d] = await db.select().from(schema.propostaDossies).where(eq(schema.propostaDossies.id, dossieId)).limit(1);
  if (!d) return { created: 0 };
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, d.editalId)).limit(1);
  if (!e) return { created: 0 };
  const cfg = await getConfig();
  const [existing, tpl] = await Promise.all([
    db.select({ tplKey: schema.propostaItems.tplKey, position: schema.propostaItems.position }).from(schema.propostaItems).where(eq(schema.propostaItems.dossieId, dossieId)),
    templateItems(d.templateKey),
  ]);
  const start = existing.reduce((m, i) => Math.max(m, i.position + 1), 0);
  const plan = planChecklist(tpl, dayOf(deadlineOf(d, e)), todayISO(), existing, start);
  if (plan.length) {
    await db
      .insert(schema.propostaItems)
      .values(
        plan.map((p) => ({
          dossieId,
          stepKey: p.stepKey,
          tplKey: p.tplKey,
          title: p.title,
          position: p.position,
          offsetDays: p.offsetDays,
          role: p.role,
          dueAt: itemDueAt(p.dueDay),
          assigneeId: assigneeFor(p.role, cfg.roles, d.ownerId),
        })),
      )
      .onConflictDoNothing();
  }
  await db.update(schema.propostaDossies).set({ checklistAppliedAt: new Date(), updatedAt: new Date() }).where(eq(schema.propostaDossies.id, dossieId));
  return { created: plan.length };
}

export async function applyMatrix(dossieId: string, matrixKey?: string | null): Promise<{ created: number }> {
  const [d] = await db.select().from(schema.propostaDossies).where(eq(schema.propostaDossies.id, dossieId)).limit(1);
  if (!d) return { created: 0 };
  const m = await matrixItems(d.templateKey, matrixKey ?? d.matrixKey);
  const existing = await db.select({ tplKey: schema.propostaRequirements.tplKey, position: schema.propostaRequirements.position }).from(schema.propostaRequirements).where(eq(schema.propostaRequirements.dossieId, dossieId));
  const have = new Set(existing.map((x) => x.tplKey));
  const start = existing.reduce((n, i) => Math.max(n, i.position + 1), 0);
  const fresh = m.items.filter((i) => !have.has(i.key));
  if (fresh.length) {
    await db
      .insert(schema.propostaRequirements)
      .values(fresh.map((i, n) => ({ dossieId, tplKey: i.key, title: i.title, cofreType: i.cofreType, position: start + n })))
      .onConflictDoNothing();
  }
  await db.update(schema.propostaDossies).set({ matrixKey: m.key, updatedAt: new Date() }).where(eq(schema.propostaDossies.id, dossieId));
  return { created: fresh.length };
}

/* ----------------------------------- tarefas ----------------------------------- */

const BOARD_NAME = "Editais";

async function ensureBoard(user: Actor): Promise<string> {
  const [found] = await db.select({ id: schema.taskBoards.id }).from(schema.taskBoards).where(sql`lower(${schema.taskBoards.name}) = lower(${BOARD_NAME})`).limit(1);
  if (found) return found.id;
  const [{ top }] = await db.select({ top: max(schema.taskBoards.position) }).from(schema.taskBoards);
  const [b] = await db.insert(schema.taskBoards).values({ name: BOARD_NAME, color: "#b75928", position: (top ?? 0) + 1, createdById: user.id }).returning({ id: schema.taskBoards.id });
  return b.id;
}

/**
 * Cria as tarefas dos itens que ainda não têm uma (quadro “Editais”, um grupo por edital).
 * Idempotente: o item guarda o id da tarefa; reaplicar não duplica, mesmo em duas chamadas ao mesmo tempo.
 */
export async function syncTasks(user: Actor, dossieId: string): Promise<{ created: number }> {
  if (!has(user, "tarefas", "edit")) return { created: 0 };
  const [d] = await db.select().from(schema.propostaDossies).where(eq(schema.propostaDossies.id, dossieId)).limit(1);
  if (!d) return { created: 0 };
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, d.editalId)).limit(1);
  if (!e) return { created: 0 };
  const pending = await db
    .select()
    .from(schema.propostaItems)
    .where(and(eq(schema.propostaItems.dossieId, dossieId), eq(schema.propostaItems.done, false), sql`${schema.propostaItems.taskId} is null`))
    .orderBy(asc(schema.propostaItems.position));
  if (!pending.length) return { created: 0 };

  const boardId = await ensureBoard(user);
  // o grupo do edital: o mesmo das tarefas já criadas; senão, um novo
  const linked = await db
    .select({ groupId: schema.tasks.groupId })
    .from(schema.propostaItems)
    .innerJoin(schema.tasks, eq(schema.propostaItems.taskId, schema.tasks.id))
    .where(and(eq(schema.propostaItems.dossieId, dossieId), isNotNull(schema.tasks.groupId)))
    .limit(1);
  let groupId = linked[0]?.groupId ?? null;
  if (!groupId) {
    const [{ top }] = await db.select({ top: max(schema.taskGroups.position) }).from(schema.taskGroups).where(eq(schema.taskGroups.boardId, boardId));
    const [g] = await db
      .insert(schema.taskGroups)
      .values({ boardId, name: `${e.organ} — ${e.title}`.slice(0, 80), color: "#537179", position: (top ?? 0) + 1 })
      .returning({ id: schema.taskGroups.id });
    groupId = g.id;
  }
  const today = todayISO();
  let created = 0;
  for (const it of pending) {
    const step = STEP_BY_KEY[it.stepKey as StepKey];
    const dueDay = dayOf(it.dueAt);
    const [t] = await db
      .insert(schema.tasks)
      .values({
        title: `${step?.short ?? it.stepKey}: ${it.title}`.slice(0, 200),
        dueAt: it.dueAt,
        assigneeId: it.assigneeId,
        createdById: user.id,
        dealId: e.dealId,
        boardId,
        groupId,
        priority: dueDay && dueDay <= today ? "urgente" : dueDay && dueDay <= todayPlus(today, 3) ? "alta" : "media",
        position: it.position,
        labels: ["edital"],
        description: `Esteira de proposta — ${e.title}\nÓrgão: ${e.organ}\nDossiê: /editais/propostas/${e.id}`,
        links: e.url ? [{ id: "pncp", url: e.url, name: "Edital no PNCP" }] : [],
      })
      .returning({ id: schema.tasks.id });
    // reserva o item: só um dos concorrentes vence; o outro desfaz a tarefa que criou
    const claimed = await db
      .update(schema.propostaItems)
      .set({ taskId: t.id })
      .where(and(eq(schema.propostaItems.id, it.id), sql`${schema.propostaItems.taskId} is null`))
      .returning({ id: schema.propostaItems.id });
    if (claimed.length) created++;
    else await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id));
  }
  return { created };
}

function todayPlus(iso: string, n: number) {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
}

/** Marca/desmarca a tarefa ligada ao item (o dossiê e o quadro de Tarefas andam juntos). */
export async function setTaskDone(taskId: string | null, done: boolean) {
  if (!taskId) return;
  await db.update(schema.tasks).set({ doneAt: done ? new Date() : null, status: done ? "concluida" : "a_fazer" }).where(eq(schema.tasks.id, taskId));
}

/* ----------------------------------- dossiê ----------------------------------- */

function pickTemplate(e: EditalRow, cfg: Awaited<ReturnType<typeof getConfig>>) {
  const suggested = suggestTemplateKey(e.kind, e.modalidade, e.valueCents);
  if (suggested === "dispensa") return cfg.defaultTemplate.outro === "dispensa" ? "dispensa" : cfg.defaultTemplate.outro;
  return e.kind === "projeto" || e.kind === "laudo" ? cfg.defaultTemplate.projeto : cfg.defaultTemplate.execucao;
}

export type StartResult = { ok: true; created: boolean; dealId: string | null; items: number; tasks: number; notes: string[] } | { error: string };

/** “Vou participar”: cria o dossiê e monta tudo que é repetível. Idempotente (clicar de novo só completa o que falta). */
export async function startProposta(user: Actor, editalId: string, opts: { templateKey?: string; withDeal?: boolean; withTasks?: boolean; /** data limite da sessão, se diferente da do portal */ sessionAt?: Date | null; /** responsável geral da proposta */ ownerId?: string | null } = {}): Promise<StartResult> {
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  if (!e) return { error: "Edital não encontrado." };
  const cfg = await getConfig();
  const notes: string[] = [];
  const [before] = await db.select().from(schema.propostaDossies).where(eq(schema.propostaDossies.editalId, editalId)).limit(1);
  let d = before;
  if (!d) {
    await ensureTemplates();
    const templateKey = opts.templateKey || pickTemplate(e, cfg);
    await db
      .insert(schema.propostaDossies)
      .values({ editalId, templateKey, matrixKey: matrixKeyFor(templateKey), ownerId: opts.ownerId ?? e.ownerId ?? user.id, sessionAt: opts.sessionAt ?? null, createdById: user.id })
      .onConflictDoNothing();
    [d] = await db.select().from(schema.propostaDossies).where(eq(schema.propostaDossies.editalId, editalId)).limit(1);
  }
  if (!d) return { error: "Não foi possível criar o dossiê." };
  const today = todayISO();

  // etapas (as 8 sempre existem)
  const plan = planSteps(dayOf(deadlineOf(d, e)), today);
  await db
    .insert(schema.propostaSteps)
    .values(plan.map((p) => ({ dossieId: d.id, key: p.key, position: p.position, dueAt: p.dueDay ? dayToInstant(p.dueDay) : null, assigneeId: assigneeFor(STEP_ROLE[p.key], cfg.roles, d.ownerId) })))
    .onConflictDoNothing();

  const { created: items } = await applyChecklist(user, d.id);
  await applyMatrix(d.id);

  // o edital passa a “em proposta” (sem rebaixar quem já enviou, ganhou ou perdeu)
  const advance = ["novo", "interessante", "em_analise"].includes(e.triage);
  await db
    .update(schema.editais)
    .set({ triage: advance ? "em_proposta" : e.triage, discardReason: advance ? null : e.discardReason, ownerId: opts.ownerId ?? e.ownerId ?? d.ownerId ?? user.id, updatedAt: new Date() })
    .where(eq(schema.editais.id, editalId));

  let dealId = e.dealId;
  if (!dealId && opts.withDeal !== false) {
    dealId = await ensureDeal(user, { ...e, ownerId: e.ownerId ?? d.ownerId ?? user.id });
    if (!dealId) notes.push("Negócio não criado: falta acesso de edição a Negócios e a Leads e contatos.");
  }
  let tasks = 0;
  if (opts.withTasks !== false) {
    if (has(user, "tarefas", "edit")) tasks = (await syncTasks(user, d.id)).created;
    else notes.push("Tarefas não criadas: falta acesso de edição a Tarefas.");
  }
  if (!before) await editalNote(editalId, user, "proposta", `Decidiu participar: dossiê da proposta criado (${items} itens no checklist${tasks ? `, ${tasks} tarefas` : ""})`);
  return { ok: true, created: !before, dealId, items, tasks, notes };
}

/* ----------------------------------- documentos ----------------------------------- */

async function nextProposalNumber() {
  const prefix = `PP-${todayISO().slice(0, 4)}-`;
  const [row] = await db
    .select({ n: sql<string>`coalesce(max(substring(${schema.documents.number} from '[0-9]+$')::int), 0)` })
    .from(schema.documents)
    .where(like(schema.documents.number, `${prefix}%`));
  return `${prefix}${String(Number(row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/** Cria os documentos da proposta (um por modelo, sem repetir os que já existem), ligados ao edital e ao negócio. */
export async function generateDocs(user: Actor, editalId: string, slugs?: string[]): Promise<{ created: { id: string; title: string }[]; skipped: number }> {
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  if (!e) return { created: [], skipped: 0 };
  const wanted = PROPOSTA_DOCS.filter((t) => (slugs?.length ? slugs.includes(t.slug) : t.auto));
  const have = await db.select({ slug: schema.documents.templateSlug }).from(schema.documents).where(eq(schema.documents.editalId, editalId));
  const haveSet = new Set(have.map((h) => h.slug));
  const [deal] = e.dealId ? await db.select({ contactId: schema.deals.contactId }).from(schema.deals).where(eq(schema.deals.id, e.dealId)).limit(1) : [];
  const created: { id: string; title: string }[] = [];
  let skipped = 0;
  for (const t of wanted) {
    if (haveSet.has(t.slug)) {
      skipped++;
      continue;
    }
    const fields: Record<string, string> = { ...t.fields };
    if ("prazo_execucao" in fields && !fields.prazo_execucao) fields.prazo_execucao = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const number = await nextProposalNumber();
        const [doc] = await db
          .insert(schema.documents)
          .values({ kind: "contrato", number, title: `${t.name} — ${e.organ}`.slice(0, 160), dealId: e.dealId, contactId: deal?.contactId ?? null, editalId, templateSlug: t.slug, content: { kind: "contrato", html: t.html, fields }, createdById: user.id })
          .returning({ id: schema.documents.id, title: schema.documents.title });
        await db.insert(schema.documentEvents).values({ documentId: doc.id, type: "criado", meta: { by: user.name, origem: "esteira de proposta" } });
        created.push(doc);
        break;
      } catch (err) {
        if (attempt === 3) throw err; // número duplicado em corrida: tenta o próximo
      }
    }
  }
  return { created, skipped };
}

/** Escreve os atestados escolhidos na proposta técnica (troca o marcador, ou acrescenta ao fim). */
export async function insertAtestados(user: Actor, editalId: string, items: PortfolioLite[]): Promise<{ docId: string } | { error: string }> {
  if (!items.length) return { error: "Escolha pelo menos um atestado." };
  let [doc] = await db.select().from(schema.documents).where(and(eq(schema.documents.editalId, editalId), eq(schema.documents.templateSlug, "prop-tecnica"))).limit(1);
  if (!doc) {
    await generateDocs(user, editalId, ["prop-tecnica"]);
    [doc] = await db.select().from(schema.documents).where(and(eq(schema.documents.editalId, editalId), eq(schema.documents.templateSlug, "prop-tecnica"))).limit(1);
  }
  if (!doc) return { error: "Não foi possível abrir a proposta técnica." };
  if (doc.status !== "rascunho") return { error: "A proposta técnica já foi enviada. Reabra o documento para editar." };
  const content = doc.content as { kind: "contrato"; html: string; fields: Record<string, string> };
  const block = items
    .map((i) => {
      const [head, ...rest] = atestadoText(i, money).split("\n");
      return `<h3>${escapeHtml(head)}</h3>${rest.map((r) => `<p>${escapeHtml(r)}</p>`).join("")}`;
    })
    .join("");
  const marker = /<p>\s*<span data-var="campo\.atestados">\{\{campo\.atestados\}\}<\/span>\s*<\/p>/;
  const html = cleanHtml(marker.test(content.html) ? content.html.replace(marker, block) : `${content.html}${block}`);
  await db.update(schema.documents).set({ content: { ...content, html }, updatedAt: new Date() }).where(eq(schema.documents.id, doc.id));
  await db.insert(schema.documentEvents).values({ documentId: doc.id, type: "criado", meta: { by: user.name, atestados: items.length } });
  return { docId: doc.id };
}

/* ----------------------------------- planilha de preços ----------------------------------- */

export async function createPriceSheet(user: Actor, editalId: string, opts: { bdiPercent?: number; items?: PriceItemInput[] } = {}): Promise<{ id: string; created: boolean } | { error: string }> {
  const [row] = await db
    .select({ d: schema.propostaDossies, e: schema.editais })
    .from(schema.propostaDossies)
    .innerJoin(schema.editais, eq(schema.propostaDossies.editalId, schema.editais.id))
    .where(eq(schema.propostaDossies.editalId, editalId))
    .limit(1);
  if (!row) return { error: "Dossiê não encontrado." };
  if (row.d.priceSheetId) {
    const [s] = await db.select({ id: schema.sheets.id }).from(schema.sheets).where(eq(schema.sheets.id, row.d.priceSheetId)).limit(1);
    if (s) return { id: s.id, created: false };
  }
  const cfg = await getConfig();
  const tpl = priceSheetTabs({ bdiPercent: opts.bdiPercent ?? cfg.bdiPercent, encargosPercent: cfg.encargosPercent, estimatedCents: row.e.valueCents, items: opts.items });
  const sheet = await insertSheet({ name: `Planilha de preços — ${row.e.organ}`.slice(0, 160), ownerId: user.id, tabs: tpl.tabs, dealId: row.e.dealId, meta: { origem: "esteira de proposta", editalId } });
  // reserva: se outra chamada já vinculou uma planilha, descarta a nossa
  const claimed = await db
    .update(schema.propostaDossies)
    .set({ priceSheetId: sheet.id, updatedAt: new Date() })
    .where(and(eq(schema.propostaDossies.id, row.d.id), sql`${schema.propostaDossies.priceSheetId} is null`))
    .returning({ id: schema.propostaDossies.id });
  if (!claimed.length) {
    await db.delete(schema.sheets).where(eq(schema.sheets.id, sheet.id));
    const [again] = await db.select({ p: schema.propostaDossies.priceSheetId }).from(schema.propostaDossies).where(eq(schema.propostaDossies.id, row.d.id)).limit(1);
    return again?.p ? { id: again.p, created: false } : { error: "Não foi possível criar a planilha." };
  }
  return { id: sheet.id, created: true };
}


/* ----------------------------------- itens do checklist ----------------------------------- */

/** Marca/desmarca um item; a tarefa ligada e a etapa acompanham. Núcleo compartilhado (equipe e parceiro; a autorização é de quem chama). */
export async function toggleItem(user: Pick<SessionUser, "id" | "name">, itemId: string, done: boolean): Promise<{ editalId: string } | { error: string }> {
  const [row] = await db
    .select({ i: schema.propostaItems, d: schema.propostaDossies })
    .from(schema.propostaItems)
    .innerJoin(schema.propostaDossies, eq(schema.propostaItems.dossieId, schema.propostaDossies.id))
    .where(eq(schema.propostaItems.id, itemId))
    .limit(1);
  if (!row) return { error: "Item não encontrado." };
  await db.update(schema.propostaItems).set({ done, doneAt: done ? new Date() : null }).where(eq(schema.propostaItems.id, itemId));
  await setTaskDone(row.i.taskId, done);
  const [step] = await db.select().from(schema.propostaSteps).where(and(eq(schema.propostaSteps.dossieId, row.d.id), eq(schema.propostaSteps.key, row.i.stepKey))).limit(1);
  if (step) {
    const siblings = await db
      .select({ done: schema.propostaItems.done, taskDone: schema.tasks.doneAt })
      .from(schema.propostaItems)
      .leftJoin(schema.tasks, eq(schema.propostaItems.taskId, schema.tasks.id))
      .where(and(eq(schema.propostaItems.dossieId, row.d.id), eq(schema.propostaItems.stepKey, row.i.stepKey)));
    const next: StepStatus = stepStatusFromItems(step.status as StepStatus, siblings.map((s) => ({ done: s.done || !!s.taskDone })));
    if (next !== step.status) {
      await db.update(schema.propostaSteps).set({ status: next, doneAt: next === "concluida" ? new Date() : null }).where(eq(schema.propostaSteps.id, step.id));
      if (next === "concluida") await editalNote(row.d.editalId, user, "proposta", `Etapa “${STEP_BY_KEY[step.key as StepKey]?.label ?? step.key}” concluída (todos os itens feitos)`);
    }
  }
  return { editalId: row.d.editalId };
}

/* ----------------------------------- campos dos documentos ----------------------------------- */

type DocContent = { kind: "contrato"; html: string; fields: Record<string, string> };

/**
 * Preenche campos guiados (`{{campo.x}}`) de um documento da proposta e/ou troca variáveis por texto literal
 * (ex.: validade e BDI próprios desta proposta, ou o responsável técnico escolhido). Só mexe em rascunho.
 */
export async function setDocFields(editalId: string, slug: string, patch: { fields?: Record<string, string>; literals?: Record<string, string> }): Promise<{ docId: string } | { error: string }> {
  const [doc] = await db.select().from(schema.documents).where(and(eq(schema.documents.editalId, editalId), eq(schema.documents.templateSlug, slug))).limit(1);
  if (!doc) return { error: "O documento ainda não foi gerado." };
  if (doc.status !== "rascunho") return { error: "O documento já foi enviado: reabra para editar." };
  const content = doc.content as DocContent;
  let html = content.html;
  for (const [key, text] of Object.entries(patch.literals ?? {})) {
    if (!/^[a-z_.]+$/.test(key)) continue;
    const marker = `<span data-var="${key}">{{${key}}}</span>`;
    html = html.split(marker).join(escapeHtml(text));
  }
  const fields = { ...content.fields };
  for (const [k, v] of Object.entries(patch.fields ?? {})) if (/^[a-z_]+$/.test(k)) fields[k] = v.slice(0, 6000);
  await db.update(schema.documents).set({ content: { ...content, html: cleanHtml(html), fields }, updatedAt: new Date() }).where(eq(schema.documents.id, doc.id));
  return { docId: doc.id };
}
