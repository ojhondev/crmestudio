/**
 * Categorias de aviso (sem dependências de servidor: usado no navegador e no servidor).
 * Cada gatilho de automação gera avisos de uma categoria; a pessoa pode desligar categorias em /notificacoes.
 */

export type NotifGroup = "tarefas" | "negocios" | "editais" | "sistema";

export const NOTIF_GROUPS: Record<NotifGroup, string> = {
  tarefas: "Tarefas",
  negocios: "Leads e negócios",
  editais: "Editais de restauro",
  sistema: "Sistema",
};

export const NOTIF_TYPES = {
  tarefa_atrasada: { label: "Tarefa atrasada", group: "tarefas", help: "Uma tarefa passou do prazo." },
  tarefa_prazo: { label: "Prazo se aproximando", group: "tarefas", help: "Uma tarefa vence amanhã ou hoje." },
  tarefa_concluida: { label: "Tarefa concluída", group: "tarefas", help: "Alguém concluiu uma tarefa que você criou ou acompanha." },
  tarefa_atribuida: { label: "Tarefa atribuída", group: "tarefas", help: "Uma tarefa foi atribuída a você." },
  tarefa_travada: { label: "Tarefa travada", group: "tarefas", help: "Uma tarefa foi marcada como travada." },
  tarefa_comentario: { label: "Comentários e menções", group: "tarefas", help: "Comentaram ou mencionaram você numa tarefa." },
  tarefa_sem_responsavel: { label: "Tarefa sem responsável", group: "tarefas", help: "Uma tarefa ficou sem dono por muito tempo." },
  tarefa_recorrente: { label: "Tarefa recorrente gerada", group: "tarefas", help: "A próxima ocorrência de uma tarefa recorrente foi criada." },
  lead_novo: { label: "Lead novo", group: "negocios", help: "Chegou um lead ou foi aberto um negócio." },
  lead_followup: { label: "Follow-up de lead", group: "negocios", help: "Lead sem primeiro contato, negócio parado ou sem atividade." },
  negocio_previsao: { label: "Previsão de fechamento", group: "negocios", help: "A data prevista de fechamento venceu ou está chegando." },
  negocio_resultado: { label: "Negócio ganho ou perdido", group: "negocios", help: "Um negócio foi fechado como ganho ou perdido." },
  negocio_etapa: { label: "Mudança de etapa", group: "negocios", help: "Um negócio mudou de etapa no funil." },
  negocio_valor_alto: { label: "Valor alto parado", group: "negocios", help: "Um negócio de valor alto está sem andamento." },
  edital_novo: { label: "Edital novo", group: "editais", help: "Surgiu um edital de restauro relevante." },
  edital_prazo: { label: "Prazo de edital", group: "editais", help: "O prazo de propostas de um edital que você acompanha está chegando." },
  proposta_prazo: { label: "Proposta de edital", group: "editais", help: "Uma etapa da proposta de um edital está perto do prazo, atrasada ou sem responsável." },
  cofre_vencimento: { label: "Cofre de habilitação", group: "editais", help: "Um documento do cofre (certidão, atestado…) está perto de vencer." },
  automacao: { label: "Outras automações", group: "sistema", help: "Avisos de regras criadas por você." },
  sistema: { label: "Avisos do sistema", group: "sistema", help: "Comunicados gerais." },
} as const satisfies Record<string, { label: string; group: NotifGroup; help: string }>;

export type NotifType = keyof typeof NOTIF_TYPES;
export const NOTIF_TYPE_KEYS = Object.keys(NOTIF_TYPES) as NotifType[];
export const isNotifType = (v: unknown): v is NotifType => typeof v === "string" && v in NOTIF_TYPES;
export const notifLabel = (t: string) => (isNotifType(t) ? NOTIF_TYPES[t].label : "Aviso");

/** Rótulo curto do tempo decorrido ("agora", "5 min", "3 h", "ontem", "12/10"), calculado sem Intl (igual no servidor e no navegador). */
export function timeAgo(iso: string, now = Date.now()) {
  const d = new Date(iso).getTime();
  const m = Math.max(0, Math.round((now - d) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `${days} dias`;
  const dt = new Date(d - 3 * 3600e3); // Brasília (UTC-3)
  return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}
