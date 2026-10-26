import "server-only";
import { after } from "next/server";
import { and, asc, desc, eq, inArray, isNull, lt, max, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AutomationRule, RuleAction } from "@/lib/db/schema";
import { resolvePermissions, atLeast } from "@/lib/permissions";
import { notifyUsers } from "@/lib/notifications";
import { isoDateBR } from "@/lib/format";
import {
  BUILTIN_RULES,
  TRIGGER_BY_ID,
  TRIGGERS,
  conditionsHold,
  dueDayIn,
  evalDealTime,
  evalCofre,
  evalEditalTime,
  evalPropostaOwner,
  evalPropostaStep,
  evalTaskTime,
  extractMentions,
  involvedIds,
  moneyText,
  nowOf,
  renderTemplate,
  resolveOne,
  resolveRecipients,
  type Ctx,
  type DealFacts,
  type DirUser,
  type CofreFacts,
  type EditalFacts,
  type PropostaFacts,
  type PropostaStepFacts,
  type Entity,
  type Hit,
  type Now,
  type TaskFacts,
  type TriggerId,
} from "@/lib/automations";

import { STEPS } from "@/lib/propostas/types";

const STEP_LABELS: Record<string, string> = Object.fromEntries(STEPS.map((x) => [x.key, x.label]));

type UserRow = typeof schema.users.$inferSelect;
type Actor = { id: string; name?: string } | null;

/** Executa depois de responder à pessoa (não atrasa a tela); fora de uma requisição, executa na hora. */
export function afterResponse(fn: () => Promise<unknown>) {
  const safe = async () => {
    try {
      await fn();
    } catch (e) {
      console.error("[automacoes]", e);
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}

const dirOf = (rows: UserRow[]): DirUser[] => rows.map((u) => ({ id: u.id, name: u.name, active: u.active, role: u.role, supervisorId: u.supervisorId }));
const loadUsers = () => db.select().from(schema.users);

/* ------------------------------- regras prontas ------------------------------- */

let seeded = false;
/** Garante que as regras prontas existam (cada uma criada uma vez; depois é o administrador quem manda nelas). */
export async function ensureBuiltinRules() {
  if (seeded) return;
  const have = await db.select({ key: schema.automationRules.key }).from(schema.automationRules);
  const keys = new Set(have.map((r) => r.key));
  const missing = BUILTIN_RULES.filter((b) => !keys.has(b.key));
  if (missing.length) {
    await db
      .insert(schema.automationRules)
      .values(missing.map((b) => ({ key: b.key, name: b.name, description: b.description, trigger: b.trigger, enabled: b.enabled, params: b.params, conditions: b.conditions, actions: b.actions, builtin: true })))
      .onConflictDoNothing();
  }
  seeded = true;
}

async function rulesFor(triggers: TriggerId[]): Promise<AutomationRule[]> {
  await ensureBuiltinRules();
  return db
    .select()
    .from(schema.automationRules)
    .where(and(eq(schema.automationRules.enabled, true), inArray(schema.automationRules.trigger, triggers)))
    .orderBy(asc(schema.automationRules.createdAt));
}

/* --------------------------------- entidades --------------------------------- */

const dueDayOf = (d: Date | null) => (d ? isoDateBR(d) : null);

function taskToEntity(t: typeof schema.tasks.$inferSelect): Entity {
  return {
    kind: "task",
    id: t.id,
    label: t.title,
    href: t.boardId ? `/tarefas?quadro=${t.boardId}` : t.dealId ? `/negocios/${t.dealId}` : "/tarefas",
    status: t.doneAt ? "concluida" : t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    creatorId: t.createdById,
    labels: t.labels ?? [],
    dealId: t.dealId,
    boardId: t.boardId,
    groupId: t.groupId,
    dueDay: dueDayOf(t.dueAt),
  };
}

type DealRow = {
  deal: typeof schema.deals.$inferSelect;
  stageName: string;
  source: string | null;
};

function dealToEntity(r: DealRow): Entity {
  return {
    kind: "deal",
    id: r.deal.id,
    label: r.deal.title,
    href: `/negocios/${r.deal.id}`,
    stageId: r.deal.stageId,
    stageName: r.stageName,
    valueCents: r.deal.valueCents,
    ownerId: r.deal.ownerId,
    partnerId: r.deal.partnerId,
    service: r.deal.service,
    expectedClose: r.deal.expectedClose,
    origin: r.source ? `Origem: ${r.source}.` : "",
    lostReason: r.deal.lostReason,
  };
}

type EditalRow = typeof schema.editais.$inferSelect;

const editalPlace = (r: EditalRow) => [r.city, r.uf].filter(Boolean).join("/") || "local não informado";

/** Fato da esteira de proposta: o aviso aponta para o dossiê do edital e vai para quem responde pela etapa. */
function propostaEntity(r: EditalRow, ownerId: string | null): Entity {
  return { ...editalToEntity(r), href: `/editais/proposta/${r.id}`, ownerId };
}

function editalToEntity(r: EditalRow): Entity {
  return {
    kind: "edital",
    id: r.id,
    label: r.title,
    href: `/editais?id=${r.id}`,
    ownerId: r.ownerId,
    valueCents: r.valueCents ?? 0,
    dueDay: dueDayOf(r.closeAt),
    dealId: r.dealId,
    score: r.score,
    uf: r.uf,
    editalKind: r.kind,
    organ: r.organ,
    place: editalPlace(r),
  };
}

async function loadDeal(id: string): Promise<DealRow | null> {
  const [r] = await db
    .select({ deal: schema.deals, stageName: schema.stages.name, source: schema.contacts.source })
    .from(schema.deals)
    .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
    .leftJoin(schema.contacts, eq(schema.deals.contactId, schema.contacts.id))
    .where(eq(schema.deals.id, id));
  return r ?? null;
}

/* ----------------------------- variáveis e mensagens ----------------------------- */

function varsFor(c: Ctx, users: UserRow[], hit: Record<string, string> = {}, extra: Record<string, string> = {}): Record<string, string> {
  const name = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? "";
  const e = c.entity;
  const person = e.kind === "task" ? e.assigneeId : e.ownerId;
  return {
    tarefa: e.kind === "task" ? e.label : "",
    negocio: e.kind === "deal" ? e.label : "",
    edital: e.kind === "edital" ? e.label : "",
    orgao: e.organ ?? "",
    local: e.place ?? "",
    pessoa: name(c.actorId) || "O sistema",
    responsavel: name(person) || "sem responsável",
    prazo: e.dueDay ? e.dueDay.split("-").reverse().join("/") : "sem prazo",
    etapa: e.stageName ?? "",
    valor: e.kind === "deal" || e.kind === "edital" ? (e.valueCents ? moneyText(e.valueCents) : e.kind === "edital" ? "valor não informado" : moneyText(0)) : "",
    origem: e.origin ?? "",
    motivo: e.lostReason || "não informado",
    ...extra,
    ...hit,
  };
}

/* ----------------------------------- ações ----------------------------------- */

type Env = { rule: AutomationRule; ctx: Ctx; vars: Record<string, string>; key: string; users: UserRow[]; dir: DirUser[]; today: string };

const plain = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Quem pode receber aviso deste fato: precisa ver o módulo e, se só vê os próprios, estar envolvido. */
function canSee(u: UserRow, c: Ctx) {
  if (!u.active) return false;
  const perms = resolvePermissions(u);
  if (!atLeast(perms[c.entity.kind === "task" ? "tarefas" : c.entity.kind === "edital" ? "editais" : "negocios"], "view")) return false;
  const own = u.role === "admin" ? false : u.ownOnly;
  return !own || involvedIds(c).has(u.id);
}

async function doNotify(a: Extract<RuleAction, { type: "notify" }>, env: Env): Promise<string> {
  const { rule, ctx, users, dir } = env;
  const def = TRIGGER_BY_ID[rule.trigger as TriggerId];
  const wanted = resolveRecipients(a.to, ctx, dir).filter((id) => id !== ctx.actorId);
  const allowed = wanted.filter((id) => {
    const u = users.find((x) => x.id === id);
    return !!u && canSee(u, ctx);
  });
  if (!allowed.length) return "ninguém para avisar";
  const mention = new Set(ctx.mentioned ?? []);
  const titleTpl = (uid: string) => (a.title ? a.title : rule.trigger === "task_comment" && mention.has(uid) ? "{pessoa} mencionou você em “{tarefa}”" : def.title);
  const bodyTpl = a.body ?? def.body;
  const sent = await notifyUsers(allowed, (uid) => ({
    type: def?.type ?? "automacao",
    title: renderTemplate(titleTpl(uid), env.vars) || def.label,
    body: renderTemplate(bodyTpl, env.vars) || null,
    href: ctx.entity.href,
    entity: ctx.entity.kind === "task" ? "tarefa" : ctx.entity.kind === "edital" ? "edital" : "negocio",
    entityId: ctx.entity.id,
    dedupeKey: `${rule.id}:${env.key}`,
  }));
  const names = sent.map((id) => users.find((u) => u.id === id)?.name.split(" ")[0]).filter(Boolean);
  return sent.length ? `avisou ${plain(sent.length, "pessoa", "pessoas")} (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""})` : "já avisado antes";
}

async function logTask(taskId: string, body: string) {
  await db.insert(schema.taskComments).values({ taskId, userId: null, kind: "atividade", body });
}

async function tellAssignee(env: Env, userId: string, title: string) {
  const e = env.ctx.entity;
  const u = env.users.find((x) => x.id === userId);
  if (!u || userId === env.ctx.actorId || !canSee(u, { ...env.ctx, entity: { ...e, assigneeId: userId, ownerId: e.kind === "deal" || e.kind === "edital" ? userId : e.ownerId } })) return;
  await notifyUsers([userId], {
    type: e.kind === "task" ? "tarefa_atribuida" : e.kind === "edital" ? "edital_novo" : "lead_novo",
    title,
    body: `Automação “${env.rule.name}”.`,
    href: e.href,
    entity: e.kind === "task" ? "tarefa" : e.kind === "edital" ? "edital" : "negocio",
    entityId: e.id,
    dedupeKey: `${env.rule.id}:${env.key}:assign:${userId}`,
  });
}

async function applyAction(a: RuleAction, env: Env): Promise<string> {
  const e = env.ctx.entity;
  const tag = `Automação “${env.rule.name}”`;
  switch (a.type) {
    case "notify":
      return doNotify(a, env);
    case "set_status": {
      if (e.kind !== "task") return "não se aplica a negócios";
      if (e.status === a.status) return "a situação já era essa";
      await db
        .update(schema.tasks)
        .set({ status: a.status, doneAt: a.status === "concluida" ? new Date() : null })
        .where(eq(schema.tasks.id, e.id));
      await logTask(e.id, `${tag}: mudou a situação para "${{ a_fazer: "A fazer", em_andamento: "Em andamento", travada: "Travada", concluida: "Concluída" }[a.status]}"`);
      return `situação → ${a.status}`;
    }
    case "set_priority": {
      if (e.kind !== "task") return "não se aplica a negócios";
      if (e.priority === a.priority) return "a prioridade já era essa";
      await db.update(schema.tasks).set({ priority: a.priority }).where(eq(schema.tasks.id, e.id));
      await logTask(e.id, `${tag}: mudou a prioridade para "${{ baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" }[a.priority]}"`);
      return `prioridade → ${a.priority}`;
    }
    case "add_label": {
      if (e.kind !== "task") return "não se aplica a negócios";
      if ((e.labels ?? []).includes(a.label)) return "a etiqueta já existia";
      await db.update(schema.tasks).set({ labels: [...(e.labels ?? []), a.label].slice(0, 12) }).where(eq(schema.tasks.id, e.id));
      await logTask(e.id, `${tag}: adicionou a etiqueta "${a.label}"`);
      return `etiqueta “${a.label}”`;
    }
    case "assign": {
      const uid = resolveOne(a.to, env.ctx, env.dir);
      if (!uid) return "ninguém para atribuir";
      const name = env.users.find((u) => u.id === uid)?.name ?? "";
      if (e.kind === "task") {
        if (e.assigneeId === uid) return "já era o responsável";
        await db.update(schema.tasks).set({ assigneeId: uid }).where(eq(schema.tasks.id, e.id));
        await logTask(e.id, `${tag}: atribuiu a ${name}`);
        await tellAssignee(env, uid, `Tarefa atribuída a você: ${e.label}`);
      } else if (e.kind === "edital") {
        if (e.ownerId === uid) return "já era o responsável";
        await db.update(schema.editais).set({ ownerId: uid, updatedAt: new Date() }).where(eq(schema.editais.id, e.id));
        await db.insert(schema.editalEvents).values({ editalId: e.id, type: "responsavel", body: `${tag}: atribuiu o edital a ${name}` });
        await tellAssignee(env, uid, `Edital atribuído a você: ${e.label}`);
      } else {
        if (e.ownerId === uid) return "já era o responsável";
        await db.update(schema.deals).set({ ownerId: uid, updatedAt: new Date() }).where(eq(schema.deals.id, e.id));
        await db.insert(schema.activities).values({ dealId: e.id, userId: null, type: "nota", body: `${tag}: atribuiu o negócio a ${name}` });
        await tellAssignee(env, uid, `Negócio atribuído a você: ${e.label}`);
      }
      return `atribuiu a ${name}`;
    }
    case "create_followup": {
      const uid = resolveOne(a.to, env.ctx, env.dir) ?? null;
      const title = renderTemplate(a.title, env.vars) || "Follow-up";
      const dueAt = new Date(`${dueDayIn(env.today, a.inDays)}T12:00:00-03:00`);
      let position = 0;
      if (e.kind === "task" && e.groupId) {
        const [{ m }] = await db.select({ m: max(schema.tasks.position) }).from(schema.tasks).where(eq(schema.tasks.groupId, e.groupId));
        position = (m ?? 0) + 1;
      }
      const [t] = await db
        .insert(schema.tasks)
        .values({
          title: title.slice(0, 200),
          assigneeId: uid,
          dueAt,
          dealId: e.kind === "deal" ? e.id : (e.dealId ?? null), // tarefa de edital liga ao negócio (se houver)
          boardId: e.kind === "task" ? (e.boardId ?? null) : null,
          groupId: e.kind === "task" ? (e.groupId ?? null) : null,
          position,
          createdById: null,
        })
        .returning({ id: schema.tasks.id });
      await logTask(t.id, `criada automaticamente pela regra “${env.rule.name}”`);
      if (uid) {
        const u = env.users.find((x) => x.id === uid);
        if (u && uid !== env.ctx.actorId)
          await notifyUsers([uid], {
            type: "tarefa_atribuida",
            title: `Nova tarefa para você: ${title}`,
            body: `Criada pela regra “${env.rule.name}”.`,
            href: e.kind === "deal" ? e.href : "/tarefas",
            entity: "tarefa",
            entityId: t.id,
            dedupeKey: `${env.rule.id}:${env.key}:followup`,
          });
      }
      return `criou a tarefa “${title}”`;
    }
  }
}

/** Avalia condições, "reserva" o fato (chave única) e executa as ações. Devolve true se agiu. */
async function execute(rule: AutomationRule, ctx: Ctx, key: string, hit: Record<string, string>, users: UserRow[], dir: DirUser[], today: string, extraVars: Record<string, string> = {}): Promise<boolean> {
  if (!conditionsHold(ctx.entity, rule.conditions ?? [])) return false;
  const [claim] = await db
    .insert(schema.automationRuns)
    .values({
      ruleId: rule.id,
      ruleName: rule.name,
      trigger: rule.trigger,
      entity: ctx.entity.kind === "task" ? "tarefa" : ctx.entity.kind === "edital" ? "edital" : "negocio",
      entityId: ctx.entity.id,
      entityLabel: ctx.entity.label.slice(0, 160),
      summary: "executando…",
      dedupeKey: key,
    })
    .onConflictDoNothing()
    .returning({ id: schema.automationRuns.id });
  if (!claim) return false; // este fato já foi tratado por esta regra

  const env: Env = { rule, ctx, vars: varsFor(ctx, users, hit, extraVars), key, users, dir, today };
  const parts: string[] = [];
  let status: "ok" | "erro" = "ok";
  for (const a of rule.actions ?? []) {
    try {
      parts.push(await applyAction(a, env));
    } catch (err) {
      status = "erro";
      parts.push(`erro: ${err instanceof Error ? err.message : "falha"}`);
    }
  }
  await db
    .update(schema.automationRuns)
    .set({ status, summary: (parts.join("; ") || "sem ações").slice(0, 500) })
    .where(eq(schema.automationRuns.id, claim.id));
  return true;
}

/* ----------------------------------- eventos ----------------------------------- */

export type EventExtra = { eventKey?: string; comment?: string };

/** Dispara as regras de um evento de tarefa. Nunca lança erro (a ação do usuário não pode falhar por causa de um aviso). */
export async function fireTaskEvent(trigger: TriggerId, taskId: string, actor: Actor, extra: EventExtra = {}) {
  try {
    const rules = await rulesFor([trigger]);
    if (!rules.length) return;
    const [t] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!t) return;
    const users = await loadUsers();
    const dir = dirOf(users);
    const comments = await db
      .select({ userId: schema.taskComments.userId, body: schema.taskComments.body })
      .from(schema.taskComments)
      .where(and(eq(schema.taskComments.taskId, taskId), eq(schema.taskComments.kind, "comentario")));
    const participants = [...new Set(comments.map((c) => c.userId).filter((x): x is string => !!x))];
    const ctx: Ctx = {
      entity: taskToEntity(t),
      actorId: actor?.id ?? null,
      participants,
      mentioned: extra.comment ? extractMentions(extra.comment, dir) : [],
    };
    const key = `${trigger}:${taskId}:${extra.eventKey ?? Date.now()}`;
    const today = isoDateBR();
    for (const rule of rules) await execute(rule, ctx, key, {}, users, dir, today, { comentario: (extra.comment ?? "").slice(0, 160) });
  } catch (e) {
    console.error("[automacoes] evento de tarefa", trigger, e);
  }
}

export async function fireDealEvent(triggers: TriggerId[], dealId: string, actor: Actor, extra: EventExtra = {}) {
  try {
    const rules = await rulesFor(triggers);
    if (!rules.length) return;
    const row = await loadDeal(dealId);
    if (!row) return;
    const users = await loadUsers();
    const dir = dirOf(users);
    const ctx: Ctx = { entity: dealToEntity(row), actorId: actor?.id ?? null };
    const today = isoDateBR();
    for (const rule of rules) await execute(rule, ctx, `${rule.trigger}:${dealId}:${extra.eventKey ?? Date.now()}`, {}, users, dir, today);
  } catch (e) {
    console.error("[automacoes] evento de negócio", triggers, e);
  }
}

/** Edital novo e relevante. Idempotente (uma vez por regra e edital). Só avisa se o edital ainda está aberto. */
export async function fireEditalEvent(triggers: TriggerId[], editalId: string, actor: Actor = null, extra: EventExtra = {}) {
  try {
    const rules = await rulesFor(triggers);
    if (!rules.length) return;
    const [r] = await db.select().from(schema.editais).where(eq(schema.editais.id, editalId));
    if (!r || r.situation !== "aberto" || (r.closeAt && r.closeAt.getTime() < Date.now())) return;
    // “novo” = publicado há pouco: a carga inicial de editais antigos não gera enxurrada de avisos
    if (triggers.includes("edital_new") && r.publishedAt && Date.now() - r.publishedAt.getTime() > 3 * 864e5) return;
    const users = await loadUsers();
    const dir = dirOf(users);
    const ctx: Ctx = { entity: editalToEntity(r), actorId: actor?.id ?? null };
    const today = isoDateBR();
    for (const rule of rules) await execute(rule, ctx, `${rule.trigger}:${editalId}:${extra.eventKey ?? "novo"}`, {}, users, dir, today);
  } catch (e) {
    console.error("[automacoes] evento de edital", triggers, e);
  }
}

/** Gatilhos de uma mudança de etapa (mudou de etapa + ganho/perdido, conforme o tipo da etapa de destino). */
export const stageTriggers = (kind: "aberto" | "ganho" | "perdido"): TriggerId[] => ["deal_stage_changed", ...(kind === "ganho" ? (["deal_won"] as const) : kind === "perdido" ? (["deal_lost"] as const) : [])];

/* ----------------------------------- tempo ----------------------------------- */

const CAP_PER_RULE = 150;

async function existingKeys(ruleId: string, keys: string[]) {
  const have = new Set<string>();
  for (let i = 0; i < keys.length; i += 400) {
    const chunk = keys.slice(i, i + 400);
    const rows = await db
      .select({ k: schema.automationRuns.dedupeKey })
      .from(schema.automationRuns)
      .where(and(eq(schema.automationRuns.ruleId, ruleId), inArray(schema.automationRuns.dedupeKey, chunk)));
    rows.forEach((r) => have.add(r.k));
  }
  return have;
}

export type OpenDeal = { deal: typeof schema.deals.$inferSelect; stageName: string; source: string | null; facts: DealFacts };

/** Negócios abertos com os fatos de tempo (entrada na etapa, último contato) usados pelas regras e pelos avisos do painel. */
export async function loadOpenDeals(limit = 2000): Promise<OpenDeal[]> {
  const [first] = await db.select({ id: schema.stages.id }).from(schema.stages).orderBy(asc(schema.stages.position)).limit(1);
  const rows = await db
    .select({
      deal: schema.deals,
      stageName: schema.stages.name,
      source: schema.contacts.source,
      lastEtapa: sql<string | null>`(select (extract(epoch from max(a.created_at)) * 1000)::bigint from activities a where a.deal_id = ${schema.deals.id} and a.type = 'etapa')`,
      lastContact: sql<string | null>`(select (extract(epoch from max(a.created_at)) * 1000)::bigint from activities a where a.deal_id = ${schema.deals.id} and (a.type in ('ligacao','email','reuniao','visita','whatsapp') or (a.type = 'nota' and a.user_id is not null and btrim(a.body) <> 'Negócio criado')))`,
    })
    .from(schema.deals)
    .innerJoin(schema.stages, eq(schema.deals.stageId, schema.stages.id))
    .leftJoin(schema.contacts, eq(schema.deals.contactId, schema.contacts.id))
    .where(eq(schema.stages.kind, "aberto"))
    .orderBy(desc(schema.deals.createdAt))
    .limit(limit);
  return rows.map((r) => {
    const d = r.deal;
    return {
      deal: d,
      stageName: r.stageName,
      source: r.source,
      facts: {
        id: d.id,
        title: d.title,
        open: true,
        stageId: d.stageId,
        stageName: r.stageName,
        isFirstStage: d.stageId === first?.id,
        valueCents: d.valueCents,
        expectedClose: d.expectedClose,
        createdAtMs: d.createdAt.getTime(),
        stageEntryMs: r.lastEtapa ? Number(r.lastEtapa) : d.createdAt.getTime(),
        lastContactMs: r.lastContact ? Number(r.lastContact) : null,
      },
    };
  });
}

export type TickResult = { rules: number; candidates: number; fired: number; ms: number };

/** Avalia todas as regras baseadas em tempo. Idempotente: pode rodar a qualquer hora, quantas vezes quiser. */
export async function runTimeRules(at: Date = new Date()): Promise<TickResult> {
  const started = Date.now();
  const now: Now = nowOf(at);
  const timeIds = TRIGGERS.filter((t) => t.kind === "time").map((t) => t.id);
  const rules = await rulesFor(timeIds);
  const result: TickResult = { rules: rules.length, candidates: 0, fired: 0, ms: 0 };
  if (!rules.length) return result;

  const users = await loadUsers();
  const dir = dirOf(users);
  const taskRules = rules.filter((r) => TRIGGER_BY_ID[r.trigger as TriggerId]?.subject === "task");
  const dealRules = rules.filter((r) => TRIGGER_BY_ID[r.trigger as TriggerId]?.subject === "deal");
  const editalRules = rules.filter((r) => TRIGGER_BY_ID[r.trigger as TriggerId]?.subject === "edital");

  type Cand = { rule: AutomationRule; ctx: Ctx; hit: Hit };
  const cands: Cand[] = [];

  if (taskRules.length) {
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(and(isNull(schema.tasks.doneAt), ne(schema.tasks.status, "concluida")))
      .orderBy(desc(schema.tasks.createdAt))
      .limit(3000);
    for (const t of rows) {
      const facts: TaskFacts = { id: t.id, title: t.title, open: true, dueDay: dueDayOf(t.dueAt), createdAtMs: t.createdAt.getTime(), assigneeId: t.assigneeId };
      const entity = taskToEntity(t);
      for (const rule of taskRules) {
        const hit = evalTaskTime(rule.trigger as TriggerId, rule.params ?? {}, facts, now);
        if (hit) cands.push({ rule, ctx: { entity, actorId: null }, hit });
      }
    }
  }

  if (dealRules.length) {
    const open = await loadOpenDeals();
    for (const { deal: d, stageName, source, facts } of open) {
      const entity = dealToEntity({ deal: d, stageName, source });
      for (const rule of dealRules) {
        const hit = evalDealTime(rule.trigger as TriggerId, rule.params ?? {}, facts, now);
        if (hit) cands.push({ rule, ctx: { entity, actorId: null }, hit });
      }
    }
  }

  if (editalRules.length) {
    // editais que a equipe marcou como interessantes/em análise e ainda recebem propostas
    const rows = await db
      .select()
      .from(schema.editais)
      .where(and(inArray(schema.editais.triage, ["interessante", "em_analise", "em_proposta"]), eq(schema.editais.situation, "aberto"), sql`${schema.editais.closeAt} >= now() - interval '1 day'`))
      .limit(1000);
    for (const r of rows) {
      const facts: EditalFacts = { id: r.id, title: r.title, open: true, closeDay: dueDayOf(r.closeAt) };
      const entity = editalToEntity(r);
      for (const rule of editalRules) {
        const hit = evalEditalTime(rule.trigger as TriggerId, rule.params ?? {}, facts, now);
        if (hit) cands.push({ rule, ctx: { entity, actorId: null }, hit });
      }
    }
  }

  const propostaRules = editalRules.filter((r) => ["proposta_step_soon", "proposta_step_late", "proposta_no_owner"].includes(r.trigger));
  if (propostaRules.length) {
    try {
    const rows = await db
      .select({ d: schema.propostaDossies, e: schema.editais })
      .from(schema.propostaDossies)
      .innerJoin(schema.editais, eq(schema.propostaDossies.editalId, schema.editais.id))
      .where(eq(schema.propostaDossies.status, "andamento"))
      .limit(300);
    const ids = rows.map((r) => r.d.id);
    const steps = ids.length
      ? await db
          .select()
          .from(schema.propostaSteps)
          .where(and(inArray(schema.propostaSteps.dossieId, ids), inArray(schema.propostaSteps.status, ["a_fazer", "em_andamento"])))
      : [];
    for (const { d, e } of rows) {
      const deadline = dueDayOf(d.sessionAt ?? e.closeAt ?? e.openAt);
      const pf: PropostaFacts = { editalId: e.id, title: e.title, deadlineDay: deadline, hasOwner: !!d.ownerId };
      for (const rule of propostaRules.filter((r) => r.trigger === "proposta_no_owner")) {
        const hit = evalPropostaOwner(rule.params ?? {}, pf, now);
        if (hit) cands.push({ rule, ctx: { entity: propostaEntity(e, d.ownerId), actorId: null }, hit });
      }
      for (const st of steps.filter((x) => x.dossieId === d.id)) {
        const sf: PropostaStepFacts = { editalId: e.id, title: e.title, stepKey: st.key, stepLabel: STEP_LABELS[st.key] ?? st.key, dueDay: dueDayOf(st.dueAt) };
        const entity = propostaEntity(e, st.assigneeId ?? d.ownerId);
        for (const rule of propostaRules) {
          if (rule.trigger === "proposta_no_owner") continue;
          const hit = evalPropostaStep(rule.trigger as TriggerId, rule.params ?? {}, sf, now);
          if (hit) cands.push({ rule, ctx: { entity, actorId: null }, hit });
        }
      }
    }
    } catch (e) {
      console.error("[automacoes] propostas", e); // um problema aqui nunca derruba as demais regras de tempo
    }
  }

  const cofreRules = editalRules.filter((r) => r.trigger === "cofre_expiring");
  if (cofreRules.length) {
    try {
    const docs = await db.select().from(schema.cofreDocs).where(sql`${schema.cofreDocs.validUntil} is not null and ${schema.cofreDocs.validUntil} >= current_date and ${schema.cofreDocs.validUntil} <= current_date + 31`).limit(500);
    for (const c of docs) {
      const cf: CofreFacts = { id: c.id, title: c.title, validUntil: c.validUntil };
      const entity: Entity = { kind: "edital", id: c.id, label: c.title, href: "/editais/cofre", ownerId: c.ownerId, organ: c.issuer ?? "", place: "", dueDay: c.validUntil };
      for (const rule of cofreRules) {
        const hit = evalCofre(rule.params ?? {}, cf, now);
        if (hit) cands.push({ rule, ctx: { entity, actorId: null }, hit });
      }
    }
    } catch (e) {
      console.error("[automacoes] cofre", e);
    }
  }

  result.candidates = cands.length;
  // descarta de uma vez o que já foi tratado (evita uma ida ao banco por fato)
  const byRule = new Map<string, Cand[]>();
  for (const c of cands) byRule.set(c.rule.id, [...(byRule.get(c.rule.id) ?? []), c]);
  for (const [ruleId, list] of byRule) {
    const have = await existingKeys(ruleId, list.map((c) => c.hit.key));
    let n = 0;
    for (const c of list) {
      if (have.has(c.hit.key)) continue;
      if (n >= CAP_PER_RULE || Date.now() - started > 40_000) break; // o resto fica para a próxima rodada
      if (await execute(c.rule, c.ctx, c.hit.key, c.hit.vars, users, dir, now.today)) {
        n++;
        result.fired++;
      }
    }
  }
  result.ms = Date.now() - started;
  return result;
}

const TICK_KEY = "automations_tick";
const TICK_EVERY_MS = 15 * 60_000;

/**
 * Avaliação "preguiçosa": chamada quando alguém abre o app/painel ou o sino atualiza.
 * Reserva a rodada no banco (uma só por janela, mesmo com várias pessoas ao mesmo tempo) e roda as regras de tempo.
 */
export async function lazyTick(): Promise<TickResult | null> {
  try {
    const cutoff = new Date(Date.now() - TICK_EVERY_MS);
    const claimed = await db
      .update(schema.appSettings)
      .set({ value: { at: new Date().toISOString() }, updatedAt: new Date() })
      .where(and(eq(schema.appSettings.key, TICK_KEY), lt(schema.appSettings.updatedAt, cutoff)))
      .returning({ key: schema.appSettings.key });
    if (!claimed.length) {
      const created = await db.insert(schema.appSettings).values({ key: TICK_KEY, value: { at: new Date().toISOString() } }).onConflictDoNothing().returning({ key: schema.appSettings.key });
      if (!created.length) return null;
    }
    return await runTimeRules();
  } catch (e) {
    console.error("[automacoes] rodada preguiçosa", e);
    return null;
  }
}

/** Limpeza periódica: avisos lidos com mais de 120 dias e execuções com mais de 400 dias. */
export async function housekeeping() {
  const notifCut = new Date(Date.now() - 120 * 864e5);
  const runCut = new Date(Date.now() - 400 * 864e5);
  await db.delete(schema.notifications).where(and(lt(schema.notifications.createdAt, notifCut), sql`${schema.notifications.readAt} is not null`));
  await db.delete(schema.automationRuns).where(lt(schema.automationRuns.at, runCut));
}

/** Agenda a rodada preguiçosa sem atrasar a resposta. */
export const scheduleLazyTick = () => afterResponse(() => lazyTick());
