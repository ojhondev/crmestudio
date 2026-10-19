/** Modelos de quadro de tarefas (botão "Quadro" → escolher modelo). Prazos em dias a partir de hoje. */
import type { TaskColumn, TaskPriority, TaskRecur } from "@/lib/db/schema";

export type BoardTemplate = {
  key: string;
  name: string;
  description: string;
  columns: Omit<TaskColumn, "id">[];
  groups: {
    name: string;
    color: string;
    tasks: { title: string; priority?: TaskPriority; inDays?: number; labels?: string[]; subtasks?: string[]; recur?: TaskRecur }[];
  }[];
};

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    key: "rotina",
    name: "Rotina do estúdio",
    description: "Rotinas diárias, semanais e mensais do ateliê.",
    columns: [{ name: "Local", type: "texto" }],
    groups: [
      {
        name: "Todo dia",
        color: "#537179",
        tasks: [
          { title: "Responder mensagens e e-mails", priority: "media", recur: "diaria", inDays: 0 },
          { title: "Conferir a agenda do dia", priority: "media", recur: "diaria", inDays: 0 },
        ],
      },
      {
        name: "Toda semana",
        color: "#a34c1f",
        tasks: [
          { title: "Revisar o funil e dar retorno aos leads", priority: "alta", recur: "semanal", inDays: 3, subtasks: ["Leads novos", "Propostas sem resposta", "Negócios parados"] },
          { title: "Organizar o ateliê e conferir materiais", priority: "baixa", recur: "semanal", inDays: 5 },
        ],
      },
      {
        name: "Todo mês",
        color: "#2f6b4f",
        tasks: [
          { title: "Fechar o financeiro do mês", priority: "alta", recur: "mensal", inDays: 25, subtasks: ["Dar baixa nos recebidos", "Cobrar atrasados", "Lançar despesas"] },
          { title: "Publicar projetos e novidades no site", priority: "media", recur: "mensal", inDays: 20 },
        ],
      },
    ],
  },
  {
    key: "obra",
    name: "Obra de restauro",
    description: "Do levantamento à entrega: diagnóstico, execução e documentação.",
    columns: [
      { name: "Etapa do trabalho", type: "selecao", options: ["Limpeza", "Consolidação", "Reintegração", "Acabamento"] },
      { name: "Horas previstas", type: "numero" },
    ],
    groups: [
      {
        name: "Diagnóstico",
        color: "#776157",
        tasks: [
          { title: "Visita técnica e registro fotográfico", priority: "alta", inDays: 3, labels: ["campo"] },
          { title: "Prospecção estratigráfica e mapeamento de danos", priority: "alta", inDays: 7, labels: ["laudo"] },
          { title: "Laudo técnico e proposta", priority: "alta", inDays: 12, labels: ["laudo"] },
        ],
      },
      {
        name: "Execução",
        color: "#a34c1f",
        tasks: [
          { title: "Montar canteiro e proteger os bens", priority: "media", inDays: 18 },
          { title: "Intervenção de restauro", priority: "alta", inDays: 40, subtasks: ["Limpeza", "Consolidação", "Reintegração", "Acabamento"] },
        ],
      },
      {
        name: "Entrega",
        color: "#2f6b4f",
        tasks: [
          { title: "Relatório final de restauro", priority: "media", inDays: 50, labels: ["laudo"] },
          { title: "Vistoria final com o cliente e termo de aceite", priority: "alta", inDays: 55 },
          { title: "Emitir a cobrança final e arquivar os documentos", priority: "media", inDays: 58 },
        ],
      },
    ],
  },
];
