/**
 * Testes do motor de automações (src/lib/automations.ts): gatilhos de tempo, condições, destinatários,
 * hierarquia (gestor/supervisor), menções, modelos de mensagem, chaves de deduplicação, validação e regras prontas.
 * Sem banco, sem rede.   npm run test:automations
 */
import {
  BUILTIN_RULES, TRIGGERS, TRIGGER_BY_ID, conditionHolds, conditionsHold, evalDealTime, evalTaskTime, extractMentions, isContactActivity, managersOf, nowOf, periodBucket,
  renderTemplate, resolveOne, resolveRecipients, sanitizeActions, sanitizeConditions, sanitizeParams, sanitizeRule, teamScope, thresholdFor, describeAction, describeParams,
  type Ctx, type DealFacts, type DirUser, type Entity, type TaskFacts,
} from "../src/lib/automations";

let fail = 0;
let total = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  total++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};
const ok = (v: unknown, m: string) => eq(!!v, true, m);

// "hoje" = 2026-10-19 (segunda) 12:00 em Brasília
const NOW = nowOf(new Date("2026-10-19T15:00:00Z"));
eq(NOW.today, "2026-10-19", "hoje no fuso de Brasília");
const DAY = 864e5;
const HOUR = 36e5;

const task = (o: Partial<TaskFacts> = {}): TaskFacts => ({ id: "t1", title: "Enviar laudo", open: true, dueDay: null, createdAtMs: NOW.ms - 2 * HOUR, assigneeId: "u1", ...o });
const deal = (o: Partial<DealFacts> = {}): DealFacts => ({
  id: "d1", title: "Igreja Matriz", open: true, stageId: 2, stageName: "Proposta", isFirstStage: false, valueCents: 1_000_000, expectedClose: null,
  createdAtMs: NOW.ms - 30 * DAY, stageEntryMs: NOW.ms - 10 * DAY, lastContactMs: NOW.ms - 1 * DAY, ...o,
});

/* ------------------------------ tarefa atrasada ------------------------------ */
eq(evalTaskTime("task_overdue", {}, task({ dueDay: "2026-10-19" }), NOW), null, "vence hoje não é atraso");
eq(evalTaskTime("task_overdue", {}, task({ dueDay: null }), NOW), null, "sem prazo não atrasa");
const late = evalTaskTime("task_overdue", {}, task({ dueDay: "2026-10-17" }), NOW);
eq(late?.key, "overdue:t1:2026-10-17", "chave de atraso inclui o prazo");
eq(late?.vars.dias, "2 dias", "dias de atraso");
eq(late?.vars.prazo, "17/10/2026", "prazo formatado");
eq(evalTaskTime("task_overdue", {}, task({ dueDay: "2026-10-17" }), NOW)?.key, late?.key, "mesma entrada, mesma chave (idempotente)");
eq(evalTaskTime("task_overdue", {}, task({ dueDay: "2026-10-18" }), nowOf(new Date("2026-10-25T15:00:00Z")))?.key, "overdue:t1:2026-10-18", "chave não muda com os dias: um aviso por prazo");
eq(evalTaskTime("task_overdue", { days: 3 }, task({ dueDay: "2026-10-17" }), NOW), null, "atraso mínimo de 3 dias");
ok(evalTaskTime("task_overdue", { days: 3 }, task({ dueDay: "2026-10-16" }), NOW), "atraso de 3 dias dispara");
eq(evalTaskTime("task_overdue", {}, task({ dueDay: "2026-10-10", open: false }), NOW), null, "concluída não atrasa");

/* ---------------------------- prazo se aproximando ---------------------------- */
eq(evalTaskTime("task_due_soon", { daysBefore: [1, 0] }, task({ dueDay: "2026-10-20" }), NOW)?.vars.quando, "amanhã", "1 dia antes");
eq(evalTaskTime("task_due_soon", { daysBefore: [1, 0] }, task({ dueDay: "2026-10-19" }), NOW)?.vars.quando, "hoje", "no dia");
eq(evalTaskTime("task_due_soon", { daysBefore: [1, 0] }, task({ dueDay: "2026-10-21" }), NOW), null, "2 dias antes não está na lista");
eq(evalTaskTime("task_due_soon", { daysBefore: [1, 0] }, task({ dueDay: "2026-10-18" }), NOW), null, "já venceu: não é 'se aproximando'");
eq(evalTaskTime("task_due_soon", {}, task({ dueDay: "2026-10-20" }), NOW)?.key, "soon:t1:2026-10-20:1", "padrão [1,0] e chave por dias restantes");
ok(evalTaskTime("task_due_soon", { daysBefore: [3] }, task({ dueDay: "2026-10-22" }), NOW), "3 dias antes configurável");
ok(evalTaskTime("task_due_soon", { daysBefore: [1, 0] }, task({ dueDay: "2026-10-20" }), NOW)?.key !== evalTaskTime("task_due_soon", { daysBefore: [1, 0] }, task({ dueDay: "2026-10-19" }), nowOf(new Date("2026-10-19T15:00:00Z")))?.key, "aviso de véspera e do dia são fatos distintos");

/* ----------------------------- tarefa sem responsável ----------------------------- */
eq(evalTaskTime("task_unassigned", { hours: 24 }, task({ assigneeId: null }), NOW), null, "criada há 2 h: ainda cedo");
eq(evalTaskTime("task_unassigned", { hours: 24 }, task({ assigneeId: null, createdAtMs: NOW.ms - 30 * HOUR }), NOW)?.key, "unassigned:t1", "sem dono há 30 h");
eq(evalTaskTime("task_unassigned", { hours: 24 }, task({ assigneeId: "u1", createdAtMs: NOW.ms - 30 * HOUR }), NOW), null, "com dono não dispara");
eq(evalTaskTime("task_unassigned", { hours: 1 }, task({ assigneeId: null }), NOW)?.key, "unassigned:t1", "limite configurável em horas");

/* ------------------------------ negócio parado ------------------------------ */
eq(periodBucket(6, 7), 0, "antes do prazo");
eq(periodBucket(7, 7), 1, "no prazo");
eq(periodBucket(15, 7), 2, "segundo período");
eq(periodBucket(5, 0), 0, "prazo zero não dispara");
eq(thresholdFor({ days: 7, stageDays: { "2": 3 } }, 2, 9), 3, "prazo específico da etapa vence o padrão");
eq(thresholdFor({ days: 7, stageDays: { "2": 3 } }, 5, 9), 7, "outras etapas usam o padrão");
eq(thresholdFor({}, 5, 9), 9, "sem nada: usa o padrão do gatilho");

const st = evalDealTime("deal_stalled", { days: 7 }, deal(), NOW);
eq(st?.vars.dias, "10 dias", "10 dias na etapa");
eq(st?.key, `stalled:d1:${NOW.ms - 10 * DAY}:1`, "chave inclui a entrada na etapa e o período");
eq(evalDealTime("deal_stalled", { days: 7 }, deal(), NOW)?.key, st?.key, "idempotente");
eq(evalDealTime("deal_stalled", { days: 7 }, deal({ stageEntryMs: NOW.ms - 15 * DAY }), NOW)?.key.endsWith(":2"), true, "15 dias = 2º período (novo lembrete)");
eq(evalDealTime("deal_stalled", { days: 7 }, deal({ stageEntryMs: NOW.ms - 3 * DAY }), NOW), null, "recente não dispara");
ok(evalDealTime("deal_stalled", { days: 30, stageDays: { "2": 5 } }, deal({ stageEntryMs: NOW.ms - 6 * DAY }), NOW), "prazo por etapa (5 dias) dispara antes do padrão (30)");
eq(evalDealTime("deal_stalled", { days: 7, stageIds: [1] }, deal(), NOW), null, "limitado a outras etapas");
ok(evalDealTime("deal_stalled", { days: 7, stageIds: [2] }, deal(), NOW), "limitado à etapa certa");
eq(evalDealTime("deal_stalled", { days: 7 }, deal({ open: false }), NOW), null, "ganho/perdido não entra");
ok(evalDealTime("deal_stalled", { days: 7 }, deal({ stageEntryMs: NOW.ms - 10 * DAY }), NOW)?.key !== evalDealTime("deal_stalled", { days: 7 }, deal({ stageEntryMs: NOW.ms - 12 * DAY }), NOW)?.key, "mudar de etapa e voltar gera um fato novo");

/* ------------------------------ sem atividade ------------------------------ */
eq(evalDealTime("deal_no_activity", { days: 5 }, deal({ lastContactMs: NOW.ms - 2 * DAY }), NOW), null, "contato recente");
eq(evalDealTime("deal_no_activity", { days: 5 }, deal({ lastContactMs: NOW.ms - 6 * DAY }), NOW)?.vars.dias, "6 dias", "6 dias sem contato");
eq(evalDealTime("deal_no_activity", { days: 5 }, deal({ lastContactMs: null, createdAtMs: NOW.ms - 8 * DAY }), NOW)?.vars.dias, "8 dias", "sem nenhum contato conta desde a criação");
eq(evalDealTime("deal_no_activity", { days: 5 }, deal({ lastContactMs: null, createdAtMs: NOW.ms - 2 * DAY }), NOW), null, "recém-criado");

/* ---------------------------- previsão de fechamento ---------------------------- */
eq(evalDealTime("deal_close_overdue", {}, deal({ expectedClose: "2026-10-19" }), NOW), null, "previsão hoje ainda não venceu");
eq(evalDealTime("deal_close_overdue", {}, deal({ expectedClose: "2026-10-15" }), NOW)?.vars.dias, "4 dias", "venceu há 4 dias");
eq(evalDealTime("deal_close_overdue", {}, deal({ expectedClose: "2026-10-15" }), NOW)?.key, "closeoverdue:d1:2026-10-15", "uma vez por data prevista");
eq(evalDealTime("deal_close_overdue", {}, deal({ expectedClose: null }), NOW), null, "sem previsão");
eq(evalDealTime("deal_close_soon", { daysBefore: [3, 0] }, deal({ expectedClose: "2026-10-22" }), NOW)?.vars.quando, "em 3 dias", "3 dias antes");
eq(evalDealTime("deal_close_soon", { daysBefore: [3, 0] }, deal({ expectedClose: "2026-10-19" }), NOW)?.vars.quando, "hoje", "no dia");
eq(evalDealTime("deal_close_soon", { daysBefore: [3, 0] }, deal({ expectedClose: "2026-10-21" }), NOW), null, "2 dias não está na lista");

/* ------------------------------ lead sem contato ------------------------------ */
const fresh = deal({ isFirstStage: true, createdAtMs: NOW.ms - 5 * HOUR, lastContactMs: null });
eq(evalDealTime("deal_new_no_contact", { hours: 4 }, fresh, NOW)?.key, "nocontact:d1", "lead novo há 5 h sem contato");
eq(evalDealTime("deal_new_no_contact", { hours: 8 }, fresh, NOW), null, "ainda dentro das 8 h");
eq(evalDealTime("deal_new_no_contact", { hours: 4 }, { ...fresh, lastContactMs: NOW.ms - HOUR }, NOW), null, "já teve contato");
eq(evalDealTime("deal_new_no_contact", { hours: 4 }, { ...fresh, isFirstStage: false }, NOW), null, "só na primeira etapa");
eq(evalDealTime("deal_new_no_contact", { hours: 4 }, { ...fresh, createdAtMs: NOW.ms - 45 * DAY }, NOW), null, "lead antigo (45 dias) não entra na cobrança");
eq(evalDealTime("deal_new_no_contact", { hours: 4 }, fresh, NOW)?.vars.horas, "5 horas", "texto em horas");

/* -------------------------------- valor alto -------------------------------- */
eq(evalDealTime("deal_high_value_stalled", { minValueCents: 5_000_000, days: 3 }, deal({ valueCents: 1_000_000 }), NOW), null, "valor abaixo do mínimo");
ok(evalDealTime("deal_high_value_stalled", { minValueCents: 5_000_000, days: 3 }, deal({ valueCents: 8_000_000 }), NOW), "valor alto parado há 10 dias");
eq(evalDealTime("deal_high_value_stalled", { minValueCents: 5_000_000, days: 3 }, deal({ valueCents: 8_000_000 }), NOW)?.key.startsWith("highvalue:"), true, "chave própria da regra de valor alto");
eq(evalDealTime("deal_high_value_stalled", { minValueCents: 5_000_000, days: 3 }, deal({ valueCents: 8_000_000, stageEntryMs: NOW.ms - DAY }), NOW), null, "valor alto mas parado só há 1 dia");

/* -------------------------------- atividades -------------------------------- */
eq(isContactActivity({ type: "ligacao", userId: "u", body: "x" }), true, "ligação conta");
eq(isContactActivity({ type: "nota", userId: "u", body: "Falei com o padre" }), true, "nota humana conta");
eq(isContactActivity({ type: "nota", userId: "u", body: "Negócio criado" }), false, "registro de criação não conta");
eq(isContactActivity({ type: "nota", userId: null, body: "Lead recebido pelo site" }), false, "nota automática não conta");
eq(isContactActivity({ type: "etapa", userId: "u", body: "Movido" }), false, "mudança de etapa não conta");

/* ---------------------------------- condições ---------------------------------- */
const t: Entity = { kind: "task", id: "t1", label: "Enviar laudo urgente", href: "/tarefas", priority: "alta", status: "travada", assigneeId: null, labels: ["obra", "Cliente VIP"] };
const dl: Entity = { kind: "deal", id: "d1", label: "Matriz", href: "/negocios/d1", stageId: 3, valueCents: 7_500_000, service: "Restauro", ownerId: "u1" };
ok(conditionHolds(t, { field: "priority", op: "in", value: ["alta", "urgente"] }), "prioridade em [alta, urgente]");
eq(conditionHolds(t, { field: "priority", op: "eq", value: "baixa" }), false, "prioridade = baixa");
ok(conditionHolds(t, { field: "priority", op: "neq", value: "baixa" }), "prioridade ≠ baixa");
ok(conditionHolds(t, { field: "labels", op: "contains", value: "vip" }), "etiqueta contém (sem diferenciar maiúsculas)");
ok(conditionHolds(t, { field: "assigneeId", op: "empty" }), "responsável vazio");
eq(conditionHolds(t, { field: "assigneeId", op: "notempty" }), false, "responsável preenchido");
ok(conditionHolds(t, { field: "title", op: "contains", value: "URGENTE" }), "título contém");
ok(conditionHolds(dl, { field: "valueCents", op: "gte", value: 5_000_000 }), "valor ≥ R$ 50 mil");
eq(conditionHolds(dl, { field: "valueCents", op: "lte", value: 5_000_000 }), false, "valor ≤ R$ 50 mil");
ok(conditionHolds(dl, { field: "stageId", op: "in", value: ["3", "4"] }), "etapa em [3,4]");
ok(conditionHolds(dl, { field: "service", op: "eq", value: "Restauro" }), "serviço = Restauro");
ok(conditionsHold(dl, []), "sem condições vale sempre");
eq(conditionsHold(dl, [{ field: "valueCents", op: "gte", value: 5_000_000 }, { field: "service", op: "eq", value: "Laudo" }]), false, "todas precisam valer (E)");

/* ------------------------- destinatários e hierarquia ------------------------- */
const users: DirUser[] = [
  { id: "adm1", name: "Ana Admin", active: true, role: "admin", supervisorId: null },
  { id: "adm2", name: "Beto Admin", active: true, role: "admin", supervisorId: null },
  { id: "adm3", name: "Carla Antiga", active: false, role: "admin", supervisorId: null },
  { id: "sup", name: "Gestor Souza", active: true, role: "equipe", supervisorId: null },
  { id: "u1", name: "João Silva", active: true, role: "equipe", supervisorId: "sup" },
  { id: "u2", name: "Maria José", active: true, role: "equipe", supervisorId: null },
  { id: "u3", name: "Pedro Inativo", active: false, role: "equipe", supervisorId: null },
  { id: "u4", name: "Lia", active: true, role: "equipe", supervisorId: "u3" },
];
eq(managersOf("u1", users), ["sup"], "gestor direto");
eq(managersOf("u2", users), ["adm1", "adm2"], "sem gestor: administradores ativos");
eq(managersOf("u4", users), ["adm1", "adm2"], "gestor inativo: cai para os administradores");
eq(managersOf(null, users), ["adm1", "adm2"], "sem pessoa: administradores");

const tctx: Ctx = { entity: { kind: "task", id: "t1", label: "x", href: "/", assigneeId: "u1", creatorId: "u2" }, actorId: "u1", participants: ["u2", "u3"], mentioned: ["sup"] };
eq(resolveRecipients(["assignee"], tctx, users), ["u1"], "responsável");
eq(resolveRecipients(["creator", "managers"], tctx, users), ["u2", "sup"], "criador + gestor do responsável");
eq(resolveRecipients(["participants"], tctx, users), ["u2"], "seguidores ativos (inativo some)");
eq(resolveRecipients(["mentioned"], tctx, users), ["sup"], "mencionados");
eq(resolveRecipients(["admins"], tctx, users), ["adm1", "adm2"], "administradores ativos");
eq(resolveRecipients(["user:u2", "user:u3"], tctx, users), ["u2"], "pessoa específica (inativa não recebe)");
eq(resolveRecipients(["assignee", "assignee", "creator"], { ...tctx, entity: { ...tctx.entity, creatorId: "u1" } }, users), ["u1"], "sem duplicar pessoas");
const dctx: Ctx = { entity: { kind: "deal", id: "d1", label: "x", href: "/", ownerId: "u2", partnerId: "u1" }, actorId: null };
eq(resolveRecipients(["owner", "managers"], dctx, users), ["u2", "adm1", "adm2"], "dono sem gestor: administradores");
eq(resolveRecipients(["partner"], dctx, users), ["u1"], "parceiro indicado");
eq(resolveOne("managers", { ...dctx, entity: { ...dctx.entity, ownerId: "u1" } }, users), "sup", "atribuir ao gestor");
eq(resolveOne("actor", { ...dctx, actorId: "u2" }, users), "u2", "quem fez a ação");

/* ---------------------------------- menções ---------------------------------- */
eq(extractMentions("@João pode ver isso?", users), ["u1"], "primeiro nome");
eq(extractMentions("oi @joao, e @maria josé", users), ["u1", "u2"], "sem acento, nome completo");
eq(extractMentions("fala@joao.com não é menção?", users), [], "e-mail não conta (letra antes do @)");
eq(extractMentions("@Pedro Inativo olha", users), [], "inativo não é mencionado");
eq(extractMentions("sem menções aqui", users), [], "sem @");
eq(extractMentions("@Lianne", users), [], "prefixo de outro nome não casa");

/* ------------------------------ modelos de mensagem ------------------------------ */
eq(renderTemplate("{pessoa} concluiu: {tarefa}", { pessoa: "Ana", tarefa: "Laudo" }), "Ana concluiu: Laudo", "troca variáveis");
eq(renderTemplate("Tarefa {nada} pronta", { }), "Tarefa pronta", "variável desconhecida some");
eq(renderTemplate("Etapa “{etapa}”. {origem}", { etapa: "Proposta", origem: "" }), "Etapa “Proposta”.", "limpa o que sobra no fim");
eq(renderTemplate("{valor}", { valor: "" }), "", "vazio fica vazio");

/* ------------------------------ escopo dos avisos ------------------------------ */
const people = [
  { id: "adm1", supervisorId: null, active: true }, { id: "sup", supervisorId: null, active: true }, { id: "u1", supervisorId: "sup", active: true },
  { id: "u5", supervisorId: "sup", active: false }, { id: "u2", supervisorId: null, active: true },
];
eq(teamScope({ id: "adm1", role: "admin", ownOnly: false, canManageTasks: true }, people), null, "administrador vê a equipe toda");
eq(teamScope({ id: "x", role: "equipe", ownOnly: false, canManageTasks: true }, people), null, "gestor (gerencia tarefas) vê a equipe toda");
eq(teamScope({ id: "sup", role: "equipe", ownOnly: false, canManageTasks: false }, people), ["sup", "u1"], "supervisor vê ele e quem responde a ele (ativos)");
eq(teamScope({ id: "u2", role: "equipe", ownOnly: false, canManageTasks: false }, people), ["u2"], "demais veem só o que lhes diz respeito");
eq(teamScope({ id: "p", role: "parceiro", ownOnly: true, canManageTasks: true }, people), ["p"], "parceiro (só os próprios) vê só os dele, mesmo gerenciando tarefas");

/* --------------------------------- validação --------------------------------- */
eq(sanitizeRule({ name: "", trigger: "task_overdue", actions: [{ type: "notify", to: ["assignee"] }] }), { error: "Dê um nome à regra." }, "nome obrigatório");
eq(sanitizeRule({ name: "x", trigger: "inventado", actions: [] }), { error: "Escolha o gatilho (o “Quando…”)." }, "gatilho inválido");
eq(sanitizeRule({ name: "x", trigger: "task_overdue", actions: [] }), { error: "Escolha pelo menos uma ação (o “Então…”)." }, "ação obrigatória");
eq(sanitizeRule({ name: "x", trigger: "task_overdue", actions: [{ type: "notify", to: ["owner"] }] }), { error: "Escolha pelo menos uma ação (o “Então…”)." }, "destinatário de negócio não vale em tarefa");
const r1 = sanitizeRule({ name: "  Urgente atrasada ", trigger: "task_overdue", params: { days: "2", lixo: 1 }, conditions: [{ field: "priority", op: "in", value: ["urgente", "alta"] }, { field: "stageId", op: "eq", value: "1" }], actions: [{ type: "notify", to: ["assignee", "managers", "owner", "user:00000000-0000-0000-0000-000000000001"] }, { type: "set_priority", priority: "urgente" }, { type: "voar" }] });
ok(!("error" in r1), "regra válida");
if (!("error" in r1)) {
  eq(r1.name, "Urgente atrasada", "nome aparado");
  eq(r1.params, { days: 2 }, "parâmetros: só os do gatilho");
  eq(r1.conditions.length, 1, "condição de negócio descartada em regra de tarefa");
  eq(r1.actions.length, 2, "ação inventada descartada");
  eq((r1.actions[0] as { to: string[] }).to, ["assignee", "managers", "user:00000000-0000-0000-0000-000000000001"], "destinatários válidos mantidos, 'owner' descartado");
}
eq(sanitizeRule({ name: "x", trigger: "deal_won", actions: [{ type: "notify", to: ["managers"] }] }, "task_overdue") && (sanitizeRule({ name: "x", trigger: "deal_won", actions: [{ type: "notify", to: ["managers"] }] }, "task_overdue") as { trigger: string }).trigger, "task_overdue", "gatilho das regras prontas fica travado");
eq(sanitizeParams("task_due_soon", { daysBefore: [0, 1, 1, 99, "x", 3] }), { daysBefore: [3, 1, 0] }, "dias antes: únicos, ordenados, dentro do limite");
eq(sanitizeParams("deal_stalled", { days: 0 }), { days: 7 }, "valor inválido volta ao padrão");
eq(sanitizeParams("deal_stalled", { days: 4, stageDays: { "2": 3, abc: 5, "4": 0 } }), { days: 4, stageDays: { "2": 3 } }, "prazo por etapa validado");
eq(sanitizeParams("deal_high_value_stalled", { minValueCents: 100000 }), { minValueCents: 100000, days: 3 }, "valor mínimo + dias padrão");
eq(sanitizeConditions("deal", [{ field: "valueCents", op: "gte", value: "5000000" }]), [{ field: "valueCents", op: "gte", value: 5000000 }], "número vindo como texto");
eq(sanitizeConditions("task", [{ field: "priority", op: "contains", value: "x" }]), [], "operador inválido para o campo");
eq(sanitizeActions("deal", [{ type: "set_status", status: "concluida" }]), [], "mudar situação só existe para tarefas");
eq(sanitizeActions("task", [{ type: "set_status", status: "voando" }]), [], "situação inválida");
eq(sanitizeActions("deal", [{ type: "create_followup", title: "Ligar — {negocio}", inDays: 2, to: "owner" }]).length, 1, "follow-up em negócio");
eq(sanitizeActions("task", [{ type: "assign", to: "actor" }]).length, 1, "atribuir a quem fez a ação");
eq(sanitizeActions("task", Array.from({ length: 10 }, () => ({ type: "add_label", label: "a" }))).length, 6, "no máximo 6 ações");

/* ------------------------------- regras prontas ------------------------------- */
const keys = BUILTIN_RULES.map((b) => b.key);
eq(new Set(keys).size, keys.length, "chaves das regras prontas são únicas");
for (const b of BUILTIN_RULES) {
  ok(TRIGGER_BY_ID[b.trigger], `${b.key}: gatilho existe`);
  const subj = TRIGGER_BY_ID[b.trigger].subject;
  eq(sanitizeActions(subj, b.actions), b.actions, `${b.key}: ações válidas para ${subj}`);
  eq(sanitizeParams(b.trigger, b.params), { ...TRIGGER_BY_ID[b.trigger].defaults, ...b.params }, `${b.key}: parâmetros válidos`);
}
// o catálogo cobre tudo que o pedido lista
const need = ["task_overdue", "task_due_soon", "task_completed", "task_assigned", "task_stuck", "task_comment", "task_unassigned", "task_recurring", "deal_stalled", "deal_no_activity", "deal_close_overdue", "deal_close_soon", "deal_new_no_contact", "deal_won", "deal_lost", "deal_high_value_stalled", "deal_created", "deal_stage_changed"];
for (const n of need) ok(TRIGGERS.some((x) => x.id === n), `gatilho ${n} existe`);
for (const b of BUILTIN_RULES) ok(TRIGGERS.some((x) => x.id === b.trigger && b.trigger), `${b.key}: gatilho no catálogo`);
for (const trig of need) ok(BUILTIN_RULES.some((b) => b.trigger === trig), `há regra pronta para ${trig}`);
ok(BUILTIN_RULES.some((b) => b.actions.some((a) => a.type === "create_followup")), "há regra pronta de follow-up automático");
eq(BUILTIN_RULES.filter((b) => b.actions.some((a) => a.type === "create_followup")).every((b) => !b.enabled), true, "follow-up automático vem desligado");
eq(describeAction({ type: "notify", to: ["assignee", "managers"] }), "avisar responsável pela tarefa, gestor da pessoa (ou administradores)", "descrição da ação");
eq(describeParams("task_due_soon", { daysBefore: [1, 0] }), "avisa 1 dia antes e no dia", "descrição dos parâmetros");

console.log(fail ? `\n${fail} de ${total} verificações falharam` : `Todas as ${total} verificações passaram`);
process.exit(fail ? 1 : 0);
