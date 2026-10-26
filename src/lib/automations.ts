/**
 * Motor de automações — parte PURA (sem banco, sem React): catálogo de gatilhos, regras prontas,
 * condições, destinatários, avaliação de regras de tempo, chaves de deduplicação e validação.
 * A execução (banco, avisos) fica em automations-engine.ts. Testado em scripts/test-automations.ts.
 *
 * Modelo: gatilho → condições → ações.
 *  - Gatilhos de EVENTO disparam na própria ação do usuário (concluir, atribuir, comentar, mover de etapa…).
 *  - Gatilhos de TEMPO são avaliados pelo cron diário e, de forma preguiçosa, quando alguém abre o app.
 *  - Toda execução é identificada por (regra + fato). A chave é única no banco: o mesmo fato nunca age duas vezes.
 */
import type { RuleAction, RuleCondition, RuleParams, TaskPriority, TaskStatus } from "@/lib/db/schema";
import type { NotifType } from "@/lib/notifications-types";
import { addDays, diffDays } from "@/lib/tasks";
import { isoDateBR } from "@/lib/format";

/* ---------------------------------- gatilhos ---------------------------------- */

export type TriggerId =
  | "task_overdue"
  | "task_due_soon"
  | "task_unassigned"
  | "task_completed"
  | "task_assigned"
  | "task_stuck"
  | "task_comment"
  | "task_recurring"
  | "deal_created"
  | "deal_stage_changed"
  | "deal_won"
  | "deal_lost"
  | "deal_stalled"
  | "deal_no_activity"
  | "deal_close_overdue"
  | "deal_close_soon"
  | "deal_new_no_contact"
  | "deal_high_value_stalled"
  | "edital_new"
  | "edital_closing"
  | "proposta_step_soon"
  | "proposta_step_late"
  | "proposta_no_owner"
  | "cofre_expiring";

export type Subject = "task" | "deal" | "edital";
export type ParamKey = "days" | "hours" | "daysBefore" | "minValueCents" | "stageDays" | "stageIds";

export type TriggerDef = {
  id: TriggerId;
  kind: "event" | "time";
  subject: Subject;
  label: string;
  /** frase depois de "Quando…" */
  when: string;
  type: NotifType;
  params: ParamKey[];
  defaults: RuleParams;
  title: string;
  body: string;
};

export const TRIGGERS: TriggerDef[] = [
  { id: "task_overdue", kind: "time", subject: "task", label: "Tarefa atrasada", when: "uma tarefa estiver atrasada", type: "tarefa_atrasada", params: ["days"], defaults: { days: 1 }, title: "Tarefa atrasada: {tarefa}", body: "Venceu em {prazo} ({dias} de atraso). Responsável: {responsavel}." },
  { id: "task_due_soon", kind: "time", subject: "task", label: "Prazo se aproximando", when: "o prazo de uma tarefa estiver chegando", type: "tarefa_prazo", params: ["daysBefore"], defaults: { daysBefore: [1, 0] }, title: "Prazo {quando}: {tarefa}", body: "Vence em {prazo}. Responsável: {responsavel}." },
  { id: "task_unassigned", kind: "time", subject: "task", label: "Tarefa sem responsável", when: "uma tarefa ficar sem responsável por um tempo", type: "tarefa_sem_responsavel", params: ["hours"], defaults: { hours: 24 }, title: "Tarefa sem responsável: {tarefa}", body: "Criada há {dias} e ainda sem ninguém responsável." },
  { id: "task_completed", kind: "event", subject: "task", label: "Tarefa concluída", when: "uma tarefa for concluída", type: "tarefa_concluida", params: [], defaults: {}, title: "{pessoa} concluiu: {tarefa}", body: "Responsável: {responsavel}." },
  { id: "task_assigned", kind: "event", subject: "task", label: "Tarefa atribuída ou reatribuída", when: "uma tarefa for atribuída ou reatribuída", type: "tarefa_atribuida", params: [], defaults: {}, title: "{pessoa} atribuiu a tarefa “{tarefa}” a {responsavel}", body: "Prazo: {prazo}." },
  { id: "task_stuck", kind: "event", subject: "task", label: "Tarefa travada", when: "uma tarefa for marcada como travada", type: "tarefa_travada", params: [], defaults: {}, title: "Tarefa travada: {tarefa}", body: "{pessoa} marcou como travada. Responsável: {responsavel}." },
  { id: "task_comment", kind: "event", subject: "task", label: "Comentário ou menção", when: "alguém comentar ou mencionar (@nome) numa tarefa", type: "tarefa_comentario", params: [], defaults: {}, title: "{pessoa} comentou em “{tarefa}”", body: "{comentario}" },
  { id: "task_recurring", kind: "event", subject: "task", label: "Tarefa recorrente gerada", when: "uma tarefa recorrente gerar a próxima ocorrência", type: "tarefa_recorrente", params: [], defaults: {}, title: "Nova tarefa recorrente: {tarefa}", body: "Gerada automaticamente. Prazo: {prazo}." },
  { id: "deal_created", kind: "event", subject: "deal", label: "Lead novo", when: "chegar um lead novo ou for aberto um negócio", type: "lead_novo", params: [], defaults: {}, title: "Lead novo: {negocio}", body: "Etapa “{etapa}”. {origem}" },
  { id: "deal_stage_changed", kind: "event", subject: "deal", label: "Negócio mudou de etapa", when: "um negócio mudar de etapa", type: "negocio_etapa", params: [], defaults: {}, title: "{pessoa} moveu “{negocio}” para “{etapa}”", body: "{valor}" },
  { id: "deal_won", kind: "event", subject: "deal", label: "Negócio ganho", when: "um negócio for ganho", type: "negocio_resultado", params: [], defaults: {}, title: "Negócio ganho: {negocio}", body: "{valor} · fechado por {pessoa}." },
  { id: "deal_lost", kind: "event", subject: "deal", label: "Negócio perdido", when: "um negócio for perdido", type: "negocio_resultado", params: [], defaults: {}, title: "Negócio perdido: {negocio}", body: "{valor} · movido por {pessoa}." },
  { id: "deal_stalled", kind: "time", subject: "deal", label: "Negócio parado na etapa", when: "um negócio ficar parado na mesma etapa", type: "lead_followup", params: ["days", "stageDays", "stageIds"], defaults: { days: 7 }, title: "Negócio parado: {negocio}", body: "Há {dias} na etapa “{etapa}”." },
  { id: "deal_no_activity", kind: "time", subject: "deal", label: "Negócio sem atividade", when: "um negócio ficar sem atividade ou contato", type: "lead_followup", params: ["days", "stageDays", "stageIds"], defaults: { days: 5 }, title: "Sem contato há {dias}: {negocio}", body: "Última atividade em {desde}. Etapa “{etapa}”." },
  { id: "deal_close_overdue", kind: "time", subject: "deal", label: "Previsão de fechamento vencida", when: "a previsão de fechamento de um negócio vencer", type: "negocio_previsao", params: ["stageIds"], defaults: {}, title: "Previsão de fechamento vencida: {negocio}", body: "Era para fechar em {prazo} ({dias} atrás). Etapa “{etapa}”." },
  { id: "deal_close_soon", kind: "time", subject: "deal", label: "Previsão de fechamento próxima", when: "a previsão de fechamento de um negócio estiver chegando", type: "negocio_previsao", params: ["daysBefore", "stageIds"], defaults: { daysBefore: [3, 0] }, title: "Fechamento {quando}: {negocio}", body: "Previsão em {prazo}. {valor}." },
  { id: "deal_new_no_contact", kind: "time", subject: "deal", label: "Lead novo sem primeiro contato", when: "um lead novo ficar sem primeiro contato", type: "lead_followup", params: ["hours"], defaults: { hours: 4 }, title: "Lead sem primeiro contato: {negocio}", body: "Chegou há {horas} e ainda não tem contato registrado." },
  { id: "deal_high_value_stalled", kind: "time", subject: "deal", label: "Valor alto parado", when: "um negócio de valor alto ficar parado", type: "negocio_valor_alto", params: ["minValueCents", "days", "stageIds"], defaults: { minValueCents: 5_000_000, days: 3 }, title: "Negócio de valor alto parado: {negocio}", body: "{valor} há {dias} na etapa “{etapa}”." },
  { id: "edital_new", kind: "event", subject: "edital", label: "Novo edital relevante", when: "surgir um edital de restauro novo (use a condição de relevância)", type: "edital_novo", params: [], defaults: {}, title: "Novo edital de restauro: {edital}", body: "{orgao} · {local}. {valor}. Propostas até {prazo}." },
  { id: "edital_closing", kind: "time", subject: "edital", label: "Edital de interesse encerrando", when: "o prazo de propostas de um edital marcado como interessante estiver chegando", type: "edital_prazo", params: ["daysBefore"], defaults: { daysBefore: [7, 3, 1] }, title: "Edital encerra {quando}: {edital}", body: "Propostas até {prazo}. {orgao} · {local}." },
  { id: "proposta_step_soon", kind: "time", subject: "edital", label: "Etapa da proposta se aproximando", when: "o prazo de uma etapa da proposta de um edital estiver chegando", type: "proposta_prazo", params: ["daysBefore"], defaults: { daysBefore: [2, 0] }, title: "Etapa da proposta {quando}: {etapa}", body: "{edital} · {orgao}. Prazo da etapa: {prazo}. Responsável: {responsavel}." },
  { id: "proposta_step_late", kind: "time", subject: "edital", label: "Etapa da proposta atrasada", when: "uma etapa da proposta de um edital passar do prazo", type: "proposta_prazo", params: ["days"], defaults: { days: 1 }, title: "Etapa da proposta atrasada: {etapa}", body: "{edital} · {orgao}. Venceu em {prazo} ({dias} de atraso). Responsável: {responsavel}." },
  { id: "proposta_no_owner", kind: "time", subject: "edital", label: "Proposta sem responsável", when: "uma proposta em andamento continuar sem responsável perto da sessão", type: "proposta_prazo", params: ["days"], defaults: { days: 7 }, title: "Proposta sem responsável: {edital}", body: "{orgao}. A data limite é {prazo} ({dias}). Defina quem coordena a proposta." },
  { id: "cofre_expiring", kind: "time", subject: "edital", label: "Documento do cofre vencendo", when: "um documento do cofre de habilitação estiver perto de vencer", type: "cofre_vencimento", params: ["daysBefore"], defaults: { daysBefore: [30, 15, 7] }, title: "Documento do cofre vence {quando}: {edital}", body: "Validade até {prazo}. Renove com antecedência: uma certidão vencida pode desclassificar a proposta." },
];

export const TRIGGER_BY_ID = Object.fromEntries(TRIGGERS.map((t) => [t.id, t])) as Record<TriggerId, TriggerDef>;
export const isTrigger = (v: unknown): v is TriggerId => typeof v === "string" && v in TRIGGER_BY_ID;

/* ------------------------------- destinatários / alvos ------------------------------- */

export const RECIPIENTS: { token: string; label: string; subjects: Subject[] }[] = [
  { token: "assignee", label: "Responsável pela tarefa", subjects: ["task"] },
  { token: "creator", label: "Quem criou a tarefa", subjects: ["task"] },
  { token: "participants", label: "Quem comentou na tarefa (seguidores)", subjects: ["task"] },
  { token: "mentioned", label: "Pessoas mencionadas (@nome)", subjects: ["task"] },
  { token: "owner", label: "Responsável pelo negócio", subjects: ["deal"] },
  { token: "partner", label: "Parceiro indicado", subjects: ["deal"] },
  { token: "editalOwner", label: "Responsável pelo edital", subjects: ["edital"] },
  { token: "team", label: "Quem tem acesso a Editais", subjects: ["edital"] },
  { token: "managers", label: "Gestor da pessoa (ou administradores)", subjects: ["task", "deal", "edital"] },
  { token: "admins", label: "Todos os administradores", subjects: ["task", "deal", "edital"] },
];
const RECIPIENT_TOKENS = new Set(RECIPIENTS.map((r) => r.token));
const UUID = /^[0-9a-f-]{36}$/i;
export const isRecipientToken = (t: unknown): t is string => typeof t === "string" && (RECIPIENT_TOKENS.has(t) || (t.startsWith("user:") && UUID.test(t.slice(5))));

export type DirUser = { id: string; name: string; active: boolean; role: string; supervisorId: string | null };

/** Quem é o gestor de uma pessoa: o supervisor ativo; sem ele, todos os administradores ativos. */
export function managersOf(userId: string | null, users: DirUser[]): string[] {
  const admins = users.filter((u) => u.active && u.role === "admin").map((u) => u.id);
  const me = userId ? users.find((u) => u.id === userId) : null;
  const sup = me?.supervisorId ? users.find((u) => u.id === me.supervisorId && u.active) : null;
  return sup ? [sup.id] : admins;
}

export type Entity = {
  kind: Subject;
  id: string;
  label: string;
  href: string;
  // tarefa
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  creatorId?: string | null;
  labels?: string[];
  dealId?: string | null;
  boardId?: string | null;
  groupId?: string | null;
  /** prazo (YYYY-MM-DD, fuso do estúdio) */
  dueDay?: string | null;
  // negócio
  stageId?: number;
  stageName?: string;
  valueCents?: number;
  ownerId?: string | null;
  partnerId?: string | null;
  service?: string | null;
  expectedClose?: string | null;
  /** de onde veio o lead (site, indicação…) */
  origin?: string | null;
  lostReason?: string | null;
  // edital
  score?: number;
  uf?: string | null;
  editalKind?: string;
  organ?: string;
  place?: string;
};

export type Ctx = {
  entity: Entity;
  actorId: string | null;
  /** quem comentou a tarefa antes */
  participants?: string[];
  /** quem foi mencionado no comentário */
  mentioned?: string[];
};

/** Pessoa "de referência" do fato: o gestor dela recebe o aviso. */
export const subjectUserId = (c: Ctx) =>
  c.entity.kind === "task" ? (c.entity.assigneeId ?? c.actorId ?? c.entity.creatorId ?? null) : (c.entity.ownerId ?? c.entity.partnerId ?? null);

/** Todos os usuários ativos (o filtro por permissão do módulo é feito na hora de avisar). */
const everyone = (users: DirUser[]) => users.filter((u) => u.active).map((u) => u.id);

/** Quem tem relação direta com o fato (usado para o filtro "só os próprios"). */
export const involvedIds = (c: Ctx) =>
  new Set([c.entity.assigneeId, c.entity.creatorId, c.entity.ownerId, c.entity.partnerId, ...(c.mentioned ?? [])].filter((x): x is string => !!x));

export function resolveRecipients(tokens: string[], c: Ctx, users: DirUser[]): string[] {
  const out = new Set<string>();
  const e = c.entity;
  for (const t of tokens) {
    if (t === "assignee" && e.assigneeId) out.add(e.assigneeId);
    else if (t === "creator" && e.creatorId) out.add(e.creatorId);
    else if ((t === "owner" || t === "editalOwner") && e.ownerId) out.add(e.ownerId);
    else if (t === "team" && e.kind === "edital") everyone(users).forEach((x) => out.add(x));
    else if (t === "partner" && e.partnerId) out.add(e.partnerId);
    else if (t === "participants") (c.participants ?? []).forEach((x) => out.add(x));
    else if (t === "mentioned") (c.mentioned ?? []).forEach((x) => out.add(x));
    else if (t === "managers") managersOf(subjectUserId(c), users).forEach((x) => out.add(x));
    else if (t === "admins") users.filter((u) => u.active && u.role === "admin").forEach((u) => out.add(u.id));
    else if (t.startsWith("user:")) out.add(t.slice(5));
  }
  const active = new Set(users.filter((u) => u.active).map((u) => u.id));
  return [...out].filter((id) => active.has(id));
}

/** Uma única pessoa (para "atribuir a"): o primeiro destinatário que o token resolve. */
export function resolveOne(token: string, c: Ctx, users: DirUser[]): string | null {
  if (token === "actor") return c.actorId;
  return resolveRecipients([token], c, users)[0] ?? null;
}

/** Texto "@nome" → ids. Aceita o primeiro nome ou o nome completo, sem diferenciar acentos/maiúsculas. */
export function extractMentions(text: string, users: { id: string; name: string; active: boolean }[]): string[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(text);
  const out: string[] = [];
  for (const u of users) {
    if (!u.active) continue;
    const full = norm(u.name).trim();
    const first = full.split(/\s+/)[0];
    const hit = (needle: string) => !!needle && new RegExp(`(^|[^\\p{L}\\p{N}])@${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(t);
    if (hit(full) || hit(first)) out.push(u.id);
  }
  return out;
}

/* ---------------------------------- condições ---------------------------------- */

export type FieldDef = { id: string; label: string; subject: Subject; kind: "enum" | "text" | "number" | "points" | "user" | "stage"; options?: { v: string; l: string }[]; ops: RuleCondition["op"][] };

export const CONDITION_FIELDS: FieldDef[] = [
  { id: "priority", label: "Prioridade", subject: "task", kind: "enum", options: [{ v: "baixa", l: "Baixa" }, { v: "media", l: "Média" }, { v: "alta", l: "Alta" }, { v: "urgente", l: "Urgente" }], ops: ["in", "eq", "neq"] },
  { id: "status", label: "Situação", subject: "task", kind: "enum", options: [{ v: "a_fazer", l: "A fazer" }, { v: "em_andamento", l: "Em andamento" }, { v: "travada", l: "Travada" }, { v: "concluida", l: "Concluída" }], ops: ["in", "eq", "neq"] },
  { id: "labels", label: "Etiqueta", subject: "task", kind: "text", ops: ["contains"] },
  { id: "assigneeId", label: "Responsável", subject: "task", kind: "user", ops: ["eq", "neq", "empty", "notempty"] },
  { id: "title", label: "Título", subject: "task", kind: "text", ops: ["contains"] },
  { id: "stageId", label: "Etapa", subject: "deal", kind: "stage", ops: ["in", "eq", "neq"] },
  { id: "valueCents", label: "Valor (R$)", subject: "deal", kind: "number", ops: ["gte", "lte"] },
  { id: "service", label: "Serviço", subject: "deal", kind: "text", ops: ["contains", "eq"] },
  { id: "ownerId", label: "Responsável", subject: "deal", kind: "user", ops: ["eq", "neq", "empty", "notempty"] },
  { id: "title", label: "Título", subject: "deal", kind: "text", ops: ["contains"] },
  { id: "score", label: "Relevância (0 a 100)", subject: "edital", kind: "points", ops: ["gte", "lte"] },
  { id: "editalKind", label: "Tipo", subject: "edital", kind: "enum", options: [{ v: "projeto", l: "Projeto de restauro" }, { v: "execucao", l: "Execução (obra)" }, { v: "projeto_execucao", l: "Projeto + execução" }, { v: "laudo", l: "Laudo / consultoria" }, { v: "outro", l: "Outro" }], ops: ["in", "eq", "neq"] },
  { id: "uf", label: "UF", subject: "edital", kind: "text", ops: ["eq", "neq", "contains"] },
  { id: "valueCents", label: "Valor estimado (R$)", subject: "edital", kind: "number", ops: ["gte", "lte"] },
  { id: "ownerId", label: "Responsável", subject: "edital", kind: "user", ops: ["eq", "neq", "empty", "notempty"] },
];
export const OP_LABEL: Record<RuleCondition["op"], string> = {
  eq: "é", neq: "não é", in: "é um de", gte: "é pelo menos", lte: "é no máximo", contains: "contém", empty: "está vazio", notempty: "está preenchido",
};

function fieldValue(e: Entity, field: string): unknown {
  switch (field) {
    case "priority": return e.priority;
    case "status": return e.status;
    case "labels": return e.labels ?? [];
    case "assigneeId": return e.assigneeId ?? null;
    case "title": return e.label;
    case "stageId": return e.stageId === undefined ? null : String(e.stageId);
    case "valueCents": return e.valueCents ?? 0;
    case "service": return e.service ?? null;
    case "ownerId": return e.ownerId ?? null;
    case "score": return e.score ?? 0;
    case "editalKind": return e.editalKind ?? null;
    case "uf": return e.uf ?? null;
    default: return undefined;
  }
}

const lc = (v: unknown) => String(v ?? "").toLowerCase();

export function conditionHolds(e: Entity, c: RuleCondition): boolean {
  const v = fieldValue(e, c.field);
  const want = c.value;
  const wantList = Array.isArray(want) ? want.map(String) : want === undefined || want === "" ? [] : [String(want)];
  switch (c.op) {
    case "empty": return v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
    case "notempty": return !(v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length));
    case "eq": return Array.isArray(v) ? v.map(String).includes(wantList[0]) : String(v ?? "") === (wantList[0] ?? "");
    case "neq": return Array.isArray(v) ? !v.map(String).includes(wantList[0]) : String(v ?? "") !== (wantList[0] ?? "");
    case "in": return wantList.includes(String(v ?? ""));
    case "contains": return Array.isArray(v) ? v.some((x) => lc(x).includes(lc(wantList[0]))) : lc(v).includes(lc(wantList[0]));
    case "gte": return Number(v) >= Number(want);
    case "lte": return Number(v) <= Number(want);
    default: return false;
  }
}

/** Todas as condições precisam valer (E). Sem condições, vale sempre. */
export const conditionsHold = (e: Entity, list: RuleCondition[]) => list.every((c) => conditionHolds(e, c));

/* ------------------------------- modelos de mensagem ------------------------------- */

export const TEMPLATE_VARS = ["tarefa", "negocio", "edital", "orgao", "local", "pessoa", "responsavel", "prazo", "dias", "etapa", "valor", "quando"];

/** Troca {variavel} pelo valor; variável desconhecida some. */
export const renderTemplate = (tpl: string, vars: Record<string, string>) =>
  tpl
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/\s+([.,;·])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.·]+|[\s·]+$/g, "")
    .trim();

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const daysText = (n: number) => plural(n, "dia", "dias");
export const hoursText = (n: number) => (n >= 48 ? daysText(Math.floor(n / 24)) : plural(n, "hora", "horas"));
export const whenText = (n: number) => (n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`);
export const brDate = (iso: string) => iso.split("-").reverse().join("/");

/* ------------------------------- regras de tempo ------------------------------- */

export type TaskFacts = {
  id: string;
  title: string;
  open: boolean;
  /** "YYYY-MM-DD" no fuso do estúdio */
  dueDay: string | null;
  createdAtMs: number;
  assigneeId: string | null;
};

export type DealFacts = {
  id: string;
  title: string;
  open: boolean;
  stageId: number;
  stageName: string;
  isFirstStage: boolean;
  valueCents: number;
  expectedClose: string | null;
  createdAtMs: number;
  /** entrada na etapa atual (última mudança de etapa; senão a criação) */
  stageEntryMs: number;
  /** último contato/atividade humana; null = nenhuma */
  lastContactMs: number | null;
};

export type EditalFacts = {
  id: string;
  title: string;
  /** a equipe marcou como interessante/em análise e o portal ainda recebe propostas */
  open: boolean;
  /** "YYYY-MM-DD" (fuso do estúdio) do fim do prazo de propostas */
  closeDay: string | null;
};

/** Etapa de uma proposta em andamento (o fato avaliado é a etapa não concluída com prazo). */
export type PropostaStepFacts = { editalId: string; title: string; stepKey: string; stepLabel: string; dueDay: string | null };
export type PropostaFacts = { editalId: string; title: string; deadlineDay: string | null; hasOwner: boolean };
export type CofreFacts = { id: string; title: string; validUntil: string | null };

export type Now = { ms: number; today: string };
export const nowOf = (d = new Date()): Now => ({ ms: d.getTime(), today: isoDateBR(d) });

export type Hit = { key: string; vars: Record<string, string> };
const DAY_MS = 864e5;
const HOUR_MS = 36e5;

/** Quantos períodos de `every` dias já se passaram (0 = ainda não chegou). Limita os lembretes a um por período. */
export const periodBucket = (elapsedDays: number, every: number) => (every > 0 && elapsedDays >= every ? Math.floor(elapsedDays / every) : 0);

/** Prazo da regra para uma etapa: o valor específico da etapa vence o padrão. */
export function thresholdFor(params: RuleParams, stageId: number, fallback: number) {
  const specific = params.stageDays?.[String(stageId)];
  if (typeof specific === "number" && specific > 0) return specific;
  return params.days && params.days > 0 ? params.days : fallback;
}

const inStages = (params: RuleParams, stageId: number) => !params.stageIds?.length || params.stageIds.includes(stageId);

export function evalTaskTime(trigger: TriggerId, params: RuleParams, t: TaskFacts, now: Now): Hit | null {
  if (!t.open) return null;
  if (trigger === "task_overdue") {
    if (!t.dueDay || t.dueDay >= now.today) return null;
    const late = diffDays(t.dueDay, now.today);
    if (late < Math.max(1, params.days ?? 1)) return null;
    return { key: `overdue:${t.id}:${t.dueDay}`, vars: { tarefa: t.title, prazo: brDate(t.dueDay), dias: daysText(late) } };
  }
  if (trigger === "task_due_soon") {
    if (!t.dueDay || t.dueDay < now.today) return null;
    const left = diffDays(now.today, t.dueDay);
    const list = params.daysBefore?.length ? params.daysBefore : [1, 0];
    if (!list.includes(left)) return null;
    return { key: `soon:${t.id}:${t.dueDay}:${left}`, vars: { tarefa: t.title, prazo: brDate(t.dueDay), quando: whenText(left), dias: daysText(left) } };
  }
  if (trigger === "task_unassigned") {
    if (t.assigneeId) return null;
    const hours = params.hours && params.hours > 0 ? params.hours : 24;
    const age = now.ms - t.createdAtMs;
    if (age < hours * HOUR_MS) return null;
    return { key: `unassigned:${t.id}`, vars: { tarefa: t.title, dias: hoursText(Math.floor(age / HOUR_MS)) } };
  }
  return null;
}

export function evalEditalTime(trigger: TriggerId, params: RuleParams, f: EditalFacts, now: Now): Hit | null {
  if (trigger !== "edital_closing" || !f.open || !f.closeDay || f.closeDay < now.today) return null;
  const left = diffDays(now.today, f.closeDay);
  const list = params.daysBefore?.length ? params.daysBefore : [7, 3, 1];
  if (!list.includes(left)) return null;
  return { key: `editalclose:${f.id}:${f.closeDay}:${left}`, vars: { edital: f.title, prazo: brDate(f.closeDay), quando: whenText(left), dias: daysText(left) } };
}

/** Etapas da proposta: avisa antes do prazo (dias da lista) ou depois dele (atraso mínimo em dias). */
export function evalPropostaStep(trigger: TriggerId, params: RuleParams, f: PropostaStepFacts, now: Now): Hit | null {
  if (!f.dueDay) return null;
  const base = { edital: f.title, etapa: f.stepLabel, prazo: brDate(f.dueDay) };
  if (trigger === "proposta_step_soon") {
    if (f.dueDay < now.today) return null;
    const left = diffDays(now.today, f.dueDay);
    const list = params.daysBefore?.length ? params.daysBefore : [2, 0];
    if (!list.includes(left)) return null;
    return { key: `pstep:${f.editalId}:${f.stepKey}:${f.dueDay}:${left}`, vars: { ...base, quando: whenText(left), dias: daysText(left) } };
  }
  if (trigger === "proposta_step_late") {
    if (f.dueDay >= now.today) return null;
    const late = diffDays(f.dueDay, now.today);
    if (late < Math.max(1, params.days ?? 1)) return null;
    return { key: `plate:${f.editalId}:${f.stepKey}:${f.dueDay}`, vars: { ...base, dias: daysText(late) } };
  }
  return null;
}

/** Proposta sem responsável quando faltam X dias (ou menos) para a data limite. */
export function evalPropostaOwner(params: RuleParams, f: PropostaFacts, now: Now): Hit | null {
  if (f.hasOwner || !f.deadlineDay || f.deadlineDay < now.today) return null;
  const left = diffDays(now.today, f.deadlineDay);
  if (left > Math.max(1, params.days ?? 7)) return null;
  return { key: `pnoowner:${f.editalId}:${f.deadlineDay}`, vars: { edital: f.title, prazo: brDate(f.deadlineDay), quando: whenText(left), dias: daysText(left) } };
}

/** Documento do cofre: avisa nos dias da lista (30/15/7 por padrão) antes da validade. */
export function evalCofre(params: RuleParams, f: CofreFacts, now: Now): Hit | null {
  if (!f.validUntil || f.validUntil < now.today) return null;
  const left = diffDays(now.today, f.validUntil);
  const list = params.daysBefore?.length ? params.daysBefore : [30, 15, 7];
  if (!list.includes(left)) return null;
  return { key: `cofre:${f.id}:${f.validUntil}:${left}`, vars: { edital: f.title, prazo: brDate(f.validUntil), quando: whenText(left), dias: daysText(left) } };
}

export function evalDealTime(trigger: TriggerId, params: RuleParams, d: DealFacts, now: Now): Hit | null {
  if (!d.open) return null;
  const base = { negocio: d.title, etapa: d.stageName, valor: moneyText(d.valueCents) };
  if (trigger === "deal_stalled" || trigger === "deal_high_value_stalled") {
    if (!inStages(params, d.stageId)) return null;
    if (trigger === "deal_high_value_stalled" && d.valueCents < (params.minValueCents ?? 5_000_000)) return null;
    const every = thresholdFor(params, d.stageId, trigger === "deal_stalled" ? 7 : 3);
    const elapsed = Math.floor((now.ms - d.stageEntryMs) / DAY_MS);
    const b = periodBucket(elapsed, every);
    if (!b) return null;
    const prefix = trigger === "deal_stalled" ? "stalled" : "highvalue";
    return { key: `${prefix}:${d.id}:${d.stageEntryMs}:${b}`, vars: { ...base, dias: daysText(elapsed) } };
  }
  if (trigger === "deal_no_activity") {
    if (!inStages(params, d.stageId)) return null;
    const since = Math.max(d.createdAtMs, d.lastContactMs ?? 0);
    const every = thresholdFor(params, d.stageId, 5);
    const elapsed = Math.floor((now.ms - since) / DAY_MS);
    const b = periodBucket(elapsed, every);
    if (!b) return null;
    return { key: `noactivity:${d.id}:${since}:${b}`, vars: { ...base, dias: daysText(elapsed), desde: brDate(isoDateBR(new Date(since))) } };
  }
  if (trigger === "deal_close_overdue") {
    if (!d.expectedClose || d.expectedClose >= now.today || !inStages(params, d.stageId)) return null;
    return { key: `closeoverdue:${d.id}:${d.expectedClose}`, vars: { ...base, prazo: brDate(d.expectedClose), dias: daysText(diffDays(d.expectedClose, now.today)) } };
  }
  if (trigger === "deal_close_soon") {
    if (!d.expectedClose || d.expectedClose < now.today || !inStages(params, d.stageId)) return null;
    const left = diffDays(now.today, d.expectedClose);
    const list = params.daysBefore?.length ? params.daysBefore : [3, 0];
    if (!list.includes(left)) return null;
    return { key: `closesoon:${d.id}:${d.expectedClose}:${left}`, vars: { ...base, prazo: brDate(d.expectedClose), quando: whenText(left) } };
  }
  if (trigger === "deal_new_no_contact") {
    if (!d.isFirstStage || d.lastContactMs !== null) return null;
    const hours = params.hours && params.hours > 0 ? params.hours : 4;
    const age = now.ms - d.createdAtMs;
    if (age < hours * HOUR_MS || age > 30 * DAY_MS) return null; // leads muito antigos não entram na cobrança
    return { key: `nocontact:${d.id}`, vars: { ...base, horas: hoursText(Math.floor(age / HOUR_MS)) } };
  }
  return null;
}

export function moneyText(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Uma atividade conta como "contato" quando é humana e não é só o registro automático de criação. */
export function isContactActivity(a: { type: string; userId: string | null; body: string }) {
  if (["ligacao", "email", "reuniao", "visita", "whatsapp"].includes(a.type)) return true;
  return a.type === "nota" && !!a.userId && a.body.trim() !== "Negócio criado";
}

/* --------------------------------- regras prontas --------------------------------- */

export type BuiltinRule = { key: string; name: string; description: string; trigger: TriggerId; enabled: boolean; params: RuleParams; conditions: RuleCondition[]; actions: RuleAction[] };

const notify = (...to: string[]): RuleAction => ({ type: "notify", to });

export const BUILTIN_RULES: BuiltinRule[] = [
  { key: "tarefa_atrasada", name: "Tarefa atrasada", description: "Avisa o responsável e o gestor quando uma tarefa passa do prazo.", trigger: "task_overdue", enabled: true, params: { days: 1 }, conditions: [], actions: [notify("assignee", "managers")] },
  { key: "tarefa_prazo", name: "Prazo se aproximando", description: "Lembra o responsável 1 dia antes e no dia do prazo.", trigger: "task_due_soon", enabled: true, params: { daysBefore: [1, 0] }, conditions: [], actions: [notify("assignee")] },
  { key: "tarefa_concluida", name: "Tarefa concluída", description: "Avisa quem criou, o gestor e quem acompanha quando alguém conclui uma tarefa.", trigger: "task_completed", enabled: true, params: {}, conditions: [], actions: [notify("creator", "managers", "participants")] },
  { key: "tarefa_atribuida", name: "Tarefa atribuída ou reatribuída", description: "Avisa a pessoa que recebeu a tarefa.", trigger: "task_assigned", enabled: true, params: {}, conditions: [], actions: [notify("assignee")] },
  { key: "tarefa_travada", name: "Tarefa travada", description: "Avisa o gestor (e quem criou) quando uma tarefa fica travada.", trigger: "task_stuck", enabled: true, params: {}, conditions: [], actions: [notify("managers", "creator")] },
  { key: "tarefa_comentario", name: "Comentários e menções em tarefas", description: "Avisa o responsável, quem criou e quem foi mencionado com @nome.", trigger: "task_comment", enabled: true, params: {}, conditions: [], actions: [notify("assignee", "creator", "mentioned")] },
  { key: "tarefa_sem_responsavel", name: "Tarefa sem responsável", description: "Avisa o gestor quando uma tarefa fica sem dono por mais de 24 horas.", trigger: "task_unassigned", enabled: true, params: { hours: 24 }, conditions: [], actions: [notify("managers")] },
  { key: "tarefa_recorrente", name: "Tarefa recorrente gerada", description: "Avisa o responsável quando a próxima ocorrência é criada.", trigger: "task_recurring", enabled: true, params: {}, conditions: [], actions: [notify("assignee")] },
  { key: "lead_novo", name: "Lead novo", description: "Avisa o responsável e o gestor quando chega um lead ou se abre um negócio.", trigger: "deal_created", enabled: true, params: {}, conditions: [], actions: [notify("owner", "managers")] },
  { key: "lead_sem_contato", name: "Lead novo sem primeiro contato", description: "Cobra o responsável e o gestor se o lead ficar 4 horas sem contato.", trigger: "deal_new_no_contact", enabled: true, params: { hours: 4 }, conditions: [], actions: [notify("owner", "managers")] },
  { key: "negocio_parado", name: "Negócio parado na etapa", description: "Avisa o responsável e o gestor quando o negócio passa de 7 dias na mesma etapa (ajustável por etapa).", trigger: "deal_stalled", enabled: true, params: { days: 7 }, conditions: [], actions: [notify("owner", "managers")] },
  { key: "negocio_parado_tarefa", name: "Criar tarefa de follow-up em negócio parado", description: "Cria uma tarefa para o responsável retomar o contato quando o negócio fica parado. Desligada até você ligar.", trigger: "deal_stalled", enabled: false, params: { days: 7 }, conditions: [], actions: [{ type: "create_followup", title: "Retomar contato — {negocio}", inDays: 1, to: "owner" }] },
  { key: "negocio_sem_atividade", name: "Negócio sem atividade ou contato", description: "Avisa quando passam 5 dias sem nenhuma atividade registrada no negócio.", trigger: "deal_no_activity", enabled: true, params: { days: 5 }, conditions: [], actions: [notify("owner", "managers")] },
  { key: "previsao_vencida", name: "Previsão de fechamento vencida", description: "Avisa quando a data prevista de fechamento já passou e o negócio segue aberto.", trigger: "deal_close_overdue", enabled: true, params: {}, conditions: [], actions: [notify("owner", "managers")] },
  { key: "previsao_proxima", name: "Previsão de fechamento chegando", description: "Lembra o responsável 3 dias antes e no dia da previsão de fechamento.", trigger: "deal_close_soon", enabled: true, params: { daysBefore: [3, 0] }, conditions: [], actions: [notify("owner")] },
  { key: "negocio_ganho", name: "Negócio ganho", description: "Comemora e avisa o gestor e o parceiro quando um negócio é ganho.", trigger: "deal_won", enabled: true, params: {}, conditions: [], actions: [notify("managers", "owner", "partner")] },
  { key: "negocio_perdido", name: "Negócio perdido", description: "Avisa o gestor e o parceiro quando um negócio é perdido.", trigger: "deal_lost", enabled: true, params: {}, conditions: [], actions: [notify("managers", "owner", "partner")] },
  { key: "valor_alto_parado", name: "Negócio de valor alto parado", description: "Destaca negócios a partir de R$ 50 mil que ficam 3 dias sem sair da etapa.", trigger: "deal_high_value_stalled", enabled: true, params: { minValueCents: 5_000_000, days: 3 }, conditions: [], actions: [notify("owner", "managers")] },
  { key: "negocio_mudou_etapa", name: "Negócio mudou de etapa", description: "Avisa o gestor e o parceiro a cada mudança de etapa. Desligada por padrão (gera muitos avisos).", trigger: "deal_stage_changed", enabled: false, params: {}, conditions: [], actions: [notify("managers", "partner")] },
  { key: "edital_novo", name: "Novo edital de restauro relevante", description: "Avisa quem tem acesso a Editais quando surge um edital de restauro com relevância alta (a partir de 70 de 100). Ajuste a relevância mínima na condição.", trigger: "edital_new", enabled: true, params: {}, conditions: [{ field: "score", op: "gte", value: 70 }], actions: [notify("team")] },
  { key: "edital_prazo", name: "Edital de interesse encerrando", description: "Lembra o responsável (e o gestor) 7, 3 e 1 dia antes do fim do prazo de propostas dos editais marcados como interessantes ou em análise.", trigger: "edital_closing", enabled: true, params: { daysBefore: [7, 3, 1] }, conditions: [], actions: [notify("editalOwner", "managers")] },
  { key: "proposta_etapa_prazo", name: "Etapa da proposta se aproximando", description: "Lembra o responsável 2 dias antes e no dia do prazo de cada etapa da esteira de proposta (analisar, habilitação, preço, revisão, envio…).", trigger: "proposta_step_soon", enabled: true, params: { daysBefore: [2, 0] }, conditions: [], actions: [notify("editalOwner", "managers")] },
  { key: "proposta_etapa_atrasada", name: "Etapa da proposta atrasada", description: "Avisa o responsável e o gestor quando uma etapa da proposta passa do prazo.", trigger: "proposta_step_late", enabled: true, params: { days: 1 }, conditions: [], actions: [notify("editalOwner", "managers")] },
  { key: "proposta_sem_responsavel", name: "Proposta sem responsável perto da sessão", description: "Avisa os gestores quando uma proposta em andamento continua sem responsável faltando 7 dias ou menos para a data limite.", trigger: "proposta_no_owner", enabled: true, params: { days: 7 }, conditions: [], actions: [notify("managers")] },
  { key: "cofre_vencimento", name: "Certidão do cofre vencendo", description: "Avisa o responsável pelo documento e os administradores 30, 15 e 7 dias antes de vencer qualquer documento do cofre de habilitação.", trigger: "cofre_expiring", enabled: true, params: { daysBefore: [30, 15, 7] }, conditions: [], actions: [notify("editalOwner", "admins")] },
  { key: "lead_novo_tarefa", name: "Criar tarefa de primeiro contato", description: "Cria uma tarefa para o responsável fazer o primeiro contato com cada lead novo. Desligada até você ligar.", trigger: "deal_created", enabled: false, params: {}, conditions: [], actions: [{ type: "create_followup", title: "Fazer o primeiro contato — {negocio}", inDays: 0, to: "owner" }] },
];

/* --------------------------------- validação --------------------------------- */

const STATUS_SET = new Set(["a_fazer", "em_andamento", "travada", "concluida"]);
const PRIORITY_SET = new Set(["baixa", "media", "alta", "urgente"]);
/** Inteiro dentro do intervalo; fora dele (ou inválido) vira null e o padrão vale. */
const clampInt = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export type RuleInput = { name?: unknown; description?: unknown; trigger?: unknown; params?: unknown; conditions?: unknown; actions?: unknown };
export type CleanRule = { name: string; description: string | null; trigger: TriggerId; params: RuleParams; conditions: RuleCondition[]; actions: RuleAction[] };

export function sanitizeParams(trigger: TriggerId, raw: unknown): RuleParams {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const def = TRIGGER_BY_ID[trigger];
  const out: RuleParams = {};
  for (const k of def.params) {
    if (k === "days") {
      const n = clampInt(p.days, 1, 365);
      if (n) out.days = n;
    } else if (k === "hours") {
      const n = clampInt(p.hours, 1, 24 * 90);
      if (n) out.hours = n;
    } else if (k === "daysBefore") {
      const list = Array.isArray(p.daysBefore) ? p.daysBefore.map((x) => clampInt(x, 0, 60)).filter((x): x is number => x !== null) : [];
      const uniq = [...new Set(list)].sort((a, b) => b - a).slice(0, 5);
      if (uniq.length) out.daysBefore = uniq;
    } else if (k === "minValueCents") {
      const n = clampInt(p.minValueCents, 0, 1e12);
      if (n !== null) out.minValueCents = n;
    } else if (k === "stageDays") {
      const src = p.stageDays && typeof p.stageDays === "object" ? (p.stageDays as Record<string, unknown>) : {};
      const o: Record<string, number> = {};
      for (const [id, v] of Object.entries(src)) {
        const n = clampInt(v, 1, 365);
        if (/^\d+$/.test(id) && n) o[id] = n;
      }
      if (Object.keys(o).length) out.stageDays = o;
    } else if (k === "stageIds") {
      const list = Array.isArray(p.stageIds) ? p.stageIds.map((x) => clampInt(x, 1, 1e9)).filter((x): x is number => x !== null) : [];
      if (list.length) out.stageIds = [...new Set(list)];
    }
  }
  // preenche o que faltou com o padrão do gatilho
  return { ...def.defaults, ...out };
}

export function sanitizeConditions(subject: Subject, raw: unknown): RuleCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleCondition[] = [];
  for (const c of raw.slice(0, 5)) {
    const field = CONDITION_FIELDS.find((f) => f.id === c?.field && f.subject === subject);
    if (!field || !field.ops.includes(c?.op)) continue;
    const op = c.op as RuleCondition["op"];
    if (op === "empty" || op === "notempty") {
      out.push({ field: field.id, op });
      continue;
    }
    if (field.kind === "number" || field.kind === "points") {
      const n = Number(c.value);
      if (Number.isFinite(n)) out.push({ field: field.id, op, value: Math.round(n) });
    } else if (op === "in") {
      const list = (Array.isArray(c.value) ? c.value : [c.value]).map((x: unknown) => s(x, 60)).filter(Boolean);
      if (list.length) out.push({ field: field.id, op, value: list });
    } else {
      const v = s(Array.isArray(c.value) ? c.value[0] : c.value, 80);
      if (v) out.push({ field: field.id, op, value: v });
    }
  }
  return out;
}

export function sanitizeActions(subject: Subject, raw: unknown): RuleAction[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleAction[] = [];
  const toOk = (t: unknown) => isRecipientToken(t) && (t.startsWith("user:") || RECIPIENTS.find((r) => r.token === t)!.subjects.includes(subject));
  for (const a of raw.slice(0, 6)) {
    if (a?.type === "notify") {
      const to = [...new Set((Array.isArray(a.to) ? a.to : []).filter(toOk))] as string[];
      if (!to.length) continue;
      const act: RuleAction = { type: "notify", to };
      const title = s(a.title, 160);
      const body = s(a.body, 400);
      if (title) act.title = title;
      if (body) act.body = body;
      out.push(act);
    } else if (a?.type === "set_status" && subject === "task" && STATUS_SET.has(a.status)) out.push({ type: "set_status", status: a.status });
    else if (a?.type === "set_priority" && subject === "task" && PRIORITY_SET.has(a.priority)) out.push({ type: "set_priority", priority: a.priority });
    else if (a?.type === "add_label" && subject === "task") {
      const label = s(a.label, 30);
      if (label) out.push({ type: "add_label", label });
    } else if (a?.type === "assign" && (toOk(a.to) || a.to === "actor")) out.push({ type: "assign", to: a.to });
    else if (a?.type === "create_followup") {
      const title = s(a.title, 200);
      const inDays = clampInt(a.inDays, 0, 365);
      if (title && inDays !== null && toOk(a.to)) out.push({ type: "create_followup", title, inDays, to: a.to });
    }
  }
  return out;
}

/** Valida e normaliza uma regra vinda do editor. `lockedTrigger` impede trocar o gatilho das regras prontas. */
export function sanitizeRule(input: RuleInput, lockedTrigger?: TriggerId): CleanRule | { error: string } {
  const name = s(input.name, 80);
  if (!name) return { error: "Dê um nome à regra." };
  const trigger = lockedTrigger ?? input.trigger;
  if (!isTrigger(trigger)) return { error: "Escolha o gatilho (o “Quando…”)." };
  const subject = TRIGGER_BY_ID[trigger].subject;
  const actions = sanitizeActions(subject, input.actions);
  if (!actions.length) return { error: "Escolha pelo menos uma ação (o “Então…”)." };
  return {
    name,
    description: s(input.description, 240) || null,
    trigger,
    params: sanitizeParams(trigger, input.params),
    conditions: sanitizeConditions(subject, input.conditions),
    actions,
  };
}

/* ------------------------------ descrição em português ------------------------------ */

export function recipientLabel(token: string, names: Record<string, string> = {}) {
  if (token.startsWith("user:")) return names[token.slice(5)] ?? "uma pessoa";
  return RECIPIENTS.find((r) => r.token === token)?.label ?? token;
}

export function describeParams(trigger: TriggerId, p: RuleParams): string {
  const parts: string[] = [];
  if (trigger === "task_overdue" || trigger === "proposta_step_late") parts.push(`atraso de pelo menos ${daysText(p.days ?? 1)}`);
  if (trigger === "task_due_soon" || trigger === "deal_close_soon" || trigger === "edital_closing" || trigger === "proposta_step_soon" || trigger === "cofre_expiring") parts.push(`avisa ${(p.daysBefore ?? TRIGGER_BY_ID[trigger].defaults.daysBefore ?? []).map((n) => (n === 0 ? "no dia" : `${daysText(n)} antes`)).join(" e ")}`);
  if (trigger === "task_unassigned" || trigger === "deal_new_no_contact") parts.push(`após ${hoursText(p.hours ?? TRIGGER_BY_ID[trigger].defaults.hours ?? 24)}`);
  if (trigger === "proposta_no_owner") parts.push(`quando faltarem ${daysText(p.days ?? 7)} ou menos`);
  if (trigger === "deal_stalled" || trigger === "deal_no_activity" || trigger === "deal_high_value_stalled") {
    parts.push(`${daysText(p.days ?? TRIGGER_BY_ID[trigger].defaults.days ?? 7)}${p.stageDays && Object.keys(p.stageDays).length ? " · prazos próprios por etapa" : ""}`);
  }
  if (trigger === "deal_high_value_stalled") parts.push(`a partir de ${moneyText(p.minValueCents ?? 5_000_000)}`);
  return parts.join(" · ");
}

export function describeAction(a: RuleAction, names: Record<string, string> = {}): string {
  switch (a.type) {
    case "notify": return `avisar ${a.to.map((t) => recipientLabel(t, names).toLowerCase()).join(", ")}`;
    case "set_status": return `mudar a situação para “${({ a_fazer: "A fazer", em_andamento: "Em andamento", travada: "Travada", concluida: "Concluída" } as Record<string, string>)[a.status]}”`;
    case "set_priority": return `mudar a prioridade para “${({ baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" } as Record<string, string>)[a.priority]}”`;
    case "assign": return `atribuir a ${a.to === "actor" ? "quem fez a ação" : recipientLabel(a.to, names).toLowerCase()}`;
    case "add_label": return `adicionar a etiqueta “${a.label}”`;
    case "create_followup": return `criar a tarefa “${a.title}” para ${recipientLabel(a.to, names).toLowerCase()}${a.inDays ? ` (prazo em ${daysText(a.inDays)})` : " (prazo hoje)"}`;
  }
}

/* --------------------------------- escopo dos avisos --------------------------------- */

/**
 * Quem a pessoa enxerga nos avisos do painel:
 *  - administrador e gestor (gerencia Tarefas, sem "só os próprios"): toda a equipe → null (sem filtro);
 *  - supervisor: ele e quem responde a ele;
 *  - demais: só ela.
 */
export function teamScope(me: { id: string; role: string; ownOnly: boolean; canManageTasks: boolean }, users: { id: string; supervisorId: string | null; active: boolean }[]): string[] | null {
  if (me.role === "admin") return null;
  if (!me.ownOnly && me.canManageTasks) return null;
  if (me.ownOnly) return [me.id];
  const reports = users.filter((u) => u.active && u.supervisorId === me.id).map((u) => u.id);
  return [me.id, ...reports];
}

/** Soma `n` dias ao "hoje" (atalho usado nos prazos de follow-up). */
export const dueDayIn = (today: string, inDays: number) => addDays(today, inDays);
