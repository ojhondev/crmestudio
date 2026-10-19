import "server-only";
import { and, desc, eq, gte, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, type SessionUser } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { addDays } from "@/lib/tasks";
import { isoDateBR, todayISO } from "@/lib/format";
import { loadOpenDeals } from "@/lib/automations-engine";
import { BUILTIN_RULES, evalDealTime, nowOf, teamScope, type TriggerId } from "@/lib/automations";
import { timeAgo } from "@/lib/notifications-types";
import type { RuleParams } from "@/lib/db/schema";

export type AvisoItem = { key: string; label: string; /** forma curta para o resumo recolhido */ short: string; count: number; tone: "bad" | "warn" | "info"; href: string; hint?: string };
export type RecentAction = { id: string; who: string; text: string; at: string; ago: string; href: string };
export type Avisos = {
  /** a pessoa vê a equipe (administrador, gestor ou supervisor)? */
  team: boolean;
  items: AvisoItem[];
  recent: RecentAction[];
  total: number;
};

/** Parâmetros atuais de uma regra (a do administrador, se existir; senão o padrão). */
function paramsOf(rules: { key: string | null; params: RuleParams | null; trigger: string }[], trigger: TriggerId, key: string): RuleParams {
  const r = rules.find((x) => x.key === key) ?? rules.find((x) => x.trigger === trigger);
  return r?.params ?? BUILTIN_RULES.find((b) => b.key === key)?.params ?? {};
}

/**
 * Resumo de avisos do painel, calculado ao vivo a partir das tarefas e negócios (não depende de a regra de aviso estar ligada).
 * Administrador/gestor: visão da equipe · supervisor: ele e quem responde a ele · demais: só o que lhes diz respeito.
 * "Só os próprios" (parceiro) vê apenas as próprias tarefas e os próprios negócios.
 */
export async function getAvisos(user: SessionUser): Promise<Avisos> {
  const canTasks = has(user, "tarefas");
  const canDeals = has(user, "negocios");
  const [people, rules] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, supervisorId: schema.users.supervisorId, active: schema.users.active }).from(schema.users),
    db.select({ key: schema.automationRules.key, trigger: schema.automationRules.trigger, params: schema.automationRules.params }).from(schema.automationRules),
  ]);
  const scope = teamScope({ id: user.id, role: user.role, ownOnly: user.ownOnly, canManageTasks: has(user, "tarefas", "manage") }, people);
  const team = scope === null || scope.length > 1;

  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const items: AvisoItem[] = [];

  /* ---- tarefas ---- */
  if (canTasks) {
    const involved = (ids: string[]) => or(inArray(schema.tasks.assigneeId, ids), and(isNull(schema.tasks.assigneeId), inArray(schema.tasks.createdById, ids)));
    const cond: SQL | undefined = scope === null ? undefined : involved(scope);
    const horizon = new Date(`${addDays(today, 2)}T00:00:00-03:00`);
    const open = await db
      .select({ id: schema.tasks.id, assigneeId: schema.tasks.assigneeId, dueAt: schema.tasks.dueAt, createdAt: schema.tasks.createdAt })
      .from(schema.tasks)
      .where(and(isNull(schema.tasks.doneAt), ne(schema.tasks.status, "concluida"), cond))
      .limit(4000);
    let lateMine = 0, lateTeam = 0, todayMine = 0, todayTeam = 0, tomMine = 0, tomTeam = 0, noOwner = 0;
    for (const t of open) {
      if (!t.assigneeId) {
        if (Date.now() - t.createdAt.getTime() > 24 * 36e5) noOwner++;
        continue;
      }
      const day = t.dueAt && t.dueAt < horizon ? isoDateBR(t.dueAt) : null;
      if (!day) continue;
      const isMine = t.assigneeId === user.id;
      if (day < today) {
        if (isMine) lateMine++;
        else lateTeam++;
      } else if (day === today) {
        if (isMine) todayMine++;
        else todayTeam++;
      } else if (day === tomorrow) {
        if (isMine) tomMine++;
        else tomTeam++;
      }
    }
    items.push({ key: "late-mine", label: "Minhas atrasadas", short: "minhas atrasadas", count: lateMine, tone: "bad", href: "/tarefas" });
    if (team) items.push({ key: "late-team", label: "Atrasadas da equipe", short: "atrasadas na equipe", count: lateTeam, tone: "bad", href: "/tarefas" });
    items.push({ key: "today", label: team ? "Vencem hoje (equipe e minhas)" : "Vencem hoje", short: "vencem hoje", count: todayMine + todayTeam, tone: "warn", href: "/tarefas" });
    items.push({ key: "tomorrow", label: team ? "Vencem amanhã (equipe e minhas)" : "Vencem amanhã", short: "vencem amanhã", count: tomMine + tomTeam, tone: "info", href: "/tarefas" });
    if (team && scope === null) items.push({ key: "no-owner", label: "Tarefas sem responsável", short: "sem responsável", count: noOwner, tone: "warn", href: "/tarefas" });
  }

  /* ---- leads e negócios ---- */
  if (canDeals) {
    const scoped = scope === null || user.ownOnly ? dealScope(user) : or(inArray(schema.deals.ownerId, scope), inArray(schema.deals.partnerId, scope));
    const all = await loadOpenDeals();
    // quem enxerga: mesma regra de visibilidade das telas de negócios
    const allowed = scoped
      ? new Set(
          (await db.select({ id: schema.deals.id }).from(schema.deals).where(scoped)).map((d) => d.id),
        )
      : null;
    const now = nowOf();
    const pStalled = paramsOf(rules, "deal_stalled", "negocio_parado");
    const pIdle = paramsOf(rules, "deal_no_activity", "negocio_sem_atividade");
    const pNew = paramsOf(rules, "deal_new_no_contact", "lead_sem_contato");
    const pHigh = paramsOf(rules, "deal_high_value_stalled", "valor_alto_parado");
    let follow = 0, stalled = 0, closeLate = 0, high = 0;
    for (const o of all) {
      if (allowed && !allowed.has(o.deal.id)) continue;
      const f = o.facts;
      if (evalDealTime("deal_no_activity", pIdle, f, now) || evalDealTime("deal_new_no_contact", pNew, f, now)) follow++;
      if (evalDealTime("deal_stalled", pStalled, f, now)) stalled++;
      if (evalDealTime("deal_close_overdue", {}, f, now)) closeLate++;
      if (evalDealTime("deal_high_value_stalled", pHigh, f, now)) high++;
    }
    items.push({ key: "follow", label: "Leads sem follow-up", short: "leads sem follow-up", count: follow, tone: "warn", href: "/negocios" });
    items.push({ key: "stalled", label: "Negócios parados", short: "negócios parados", count: stalled, tone: "warn", href: "/negocios" });
    items.push({ key: "close", label: "Previsão de fechamento vencida", short: "previsões vencidas", count: closeLate, tone: "bad", href: "/negocios" });
    items.push({ key: "high", label: "Valor alto parado", short: "valor alto parado", count: high, tone: "bad", href: "/negocios" });
  }

  /* ---- ações recentes dos membros ---- */
  const since = new Date(Date.now() - 48 * 36e5);
  const recent: RecentAction[] = [];
  if (canTasks) {
    const notMe = ne(schema.taskComments.userId, user.id);
    const involvedTask = scope === null ? undefined : or(inArray(schema.tasks.assigneeId, scope), inArray(schema.tasks.createdById, scope));
    const rows = await db
      .select({ id: schema.taskComments.id, body: schema.taskComments.body, at: schema.taskComments.createdAt, who: schema.users.name, title: schema.tasks.title, taskId: schema.tasks.id, boardId: schema.tasks.boardId, dealId: schema.tasks.dealId })
      .from(schema.taskComments)
      .innerJoin(schema.tasks, eq(schema.taskComments.taskId, schema.tasks.id))
      .innerJoin(schema.users, eq(schema.taskComments.userId, schema.users.id))
      .where(and(eq(schema.taskComments.kind, "atividade"), gte(schema.taskComments.createdAt, since), notMe, involvedTask))
      .orderBy(desc(schema.taskComments.createdAt))
      .limit(8);
    for (const r of rows) {
      recent.push({ id: `t${r.id}`, who: r.who, text: `${r.body} em “${r.title}”`, at: r.at.toISOString(), ago: timeAgo(r.at.toISOString()), href: r.boardId ? `/tarefas?quadro=${r.boardId}` : r.dealId ? `/negocios/${r.dealId}` : "/tarefas" });
    }
  }
  if (canDeals) {
    const scoped = scope === null || user.ownOnly ? dealScope(user) : or(inArray(schema.deals.ownerId, scope), inArray(schema.deals.partnerId, scope));
    const rows = await db
      .select({ id: schema.activities.id, body: schema.activities.body, at: schema.activities.createdAt, who: schema.users.name, title: schema.deals.title, dealId: schema.deals.id })
      .from(schema.activities)
      .innerJoin(schema.deals, eq(schema.activities.dealId, schema.deals.id))
      .innerJoin(schema.users, eq(schema.activities.userId, schema.users.id))
      .where(and(eq(schema.activities.type, "etapa"), gte(schema.activities.createdAt, since), ne(schema.activities.userId, user.id), scoped))
      .orderBy(desc(schema.activities.createdAt))
      .limit(8);
    for (const r of rows) recent.push({ id: `d${r.id}`, who: r.who, text: `moveu “${r.title}”: ${r.body.replace(/^Movido para\s*/i, "para ")}`, at: r.at.toISOString(), ago: timeAgo(r.at.toISOString()), href: `/negocios/${r.dealId}` });
  }
  recent.sort((a, b) => b.at.localeCompare(a.at));

  const total = items.reduce((s, i) => s + i.count, 0);
  return { team, items, recent: recent.slice(0, 6), total };
}
