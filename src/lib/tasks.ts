/**
 * Lógica pura das Tarefas (sem banco, sem React): filtros, ordenação, agrupamento,
 * datas de calendário/linha do tempo, recorrência e posições. Testada em scripts/test-tasks.ts.
 * Datas são sempre strings "YYYY-MM-DD" (fuso do estúdio já aplicado por quem chama).
 */
import type { TaskColumn, TaskLink, TaskPriority, TaskRecur, TaskStatus, TaskSubtask } from "@/lib/db/schema";

export type TaskDTO = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueAt: string | null;
  description: string | null;
  boardId: string | null;
  groupId: string | null;
  dealId: string | null;
  dealTitle: string | null;
  position: number;
  createdAt: string;
  custom: Record<string, unknown>;
  subtasks: TaskSubtask[];
  labels: string[];
  links: TaskLink[];
  recur: TaskRecur | null;
};

export const STATUS_ORDER: TaskStatus[] = ["a_fazer", "em_andamento", "travada", "concluida"];
export const PRIORITY_ORDER: TaskPriority[] = ["urgente", "alta", "media", "baixa"];
export const RECUR_LABEL: Record<TaskRecur, string> = { diaria: "Todo dia", semanal: "Toda semana", mensal: "Todo mês" };

/* ---------------------------------- datas ---------------------------------- */

const DAY = 864e5;
const utc = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => fromUtc(utc(iso) + n * DAY);
export const diffDays = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);
/** 0 = domingo */
export const weekdayOf = (iso: string) => new Date(utc(iso)).getUTCDay();
export const startOfWeek = (iso: string) => addDays(iso, -weekdayOf(iso));

export function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Próxima data de uma tarefa recorrente (a partir do prazo anterior). */
export function nextDue(dueISO: string, recur: TaskRecur) {
  return recur === "diaria" ? addDays(dueISO, 1) : recur === "semanal" ? addDays(dueISO, 7) : addMonths(dueISO, 1);
}

/** Grade mensal (domingo a sábado, sempre 6 semanas) do mês "YYYY-MM". */
export function monthGrid(month: string) {
  const start = startOfWeek(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export const weekGrid = (iso: string) => {
  const s = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
};

/* ------------------------------- posição (drag) ------------------------------- */

/** Posição entre dois vizinhos (qualquer um pode faltar). */
export function positionBetween(prev: number | undefined, next: number | undefined) {
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return (next as number) - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

/* ------------------------------- filtros / ordem ------------------------------- */

export type DueFilter = "" | "atrasadas" | "hoje" | "semana" | "sem-prazo";
export type Filters = { q: string; who: string; priority: string; status: string; due: DueFilter; hideDone: boolean; label: string };
export const NO_FILTERS: Filters = { q: "", who: "", priority: "", status: "", due: "", hideDone: false, label: "" };

export const dayOf = (t: Pick<TaskDTO, "dueAt">, toDay: (d: Date) => string) => (t.dueAt ? toDay(new Date(t.dueAt)) : null);

export type DueBucket = "done" | "late" | "today" | "week" | "later" | "none";
export function dueBucket(day: string | null, status: TaskStatus, today: string): DueBucket {
  if (status === "concluida") return "done";
  if (!day) return "none";
  if (day < today) return "late";
  if (day === today) return "today";
  return day <= addDays(today, 7) ? "week" : "later";
}

export function filterTasks(tasks: TaskDTO[], f: Filters, today: string, toDay: (d: Date) => string) {
  const s = f.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (s && !t.title.toLowerCase().includes(s) && !t.labels.some((l) => l.toLowerCase().includes(s))) return false;
    if (f.who && (f.who === "none" ? t.assigneeId : t.assigneeId !== f.who)) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.hideDone && t.status === "concluida") return false;
    if (f.label && !t.labels.includes(f.label)) return false;
    if (f.due) {
      const b = dueBucket(dayOf(t, toDay), t.status, today);
      if (f.due === "atrasadas" && b !== "late") return false;
      if (f.due === "hoje" && b !== "today") return false;
      if (f.due === "semana" && b !== "today" && b !== "week") return false;
      if (f.due === "sem-prazo" && t.dueAt !== null) return false;
    }
    return true;
  });
}

export type SortKey = "manual" | "prazo" | "prioridade" | "situacao" | "titulo";
export function sortTasks(tasks: TaskDTO[], sort: SortKey) {
  const arr = [...tasks];
  const byPos = (a: TaskDTO, b: TaskDTO) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);
  const cmp: Record<SortKey, (a: TaskDTO, b: TaskDTO) => number> = {
    manual: byPos,
    prazo: (a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || byPos(a, b),
    prioridade: (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || byPos(a, b),
    situacao: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byPos(a, b),
    titulo: (a, b) => a.title.localeCompare(b.title, "pt-BR") || byPos(a, b),
  };
  return arr.sort(cmp[sort]);
}

/* -------------------------------- agrupamento -------------------------------- */

export type GroupBy = "grupo" | "responsavel" | "prioridade" | "situacao" | "prazo";
export type Section = { key: string; label: string; color: string; tasks: TaskDTO[] };

export const STATUS_LABEL: Record<TaskStatus, [string, string]> = {
  a_fazer: ["A fazer", "var(--st-todo)"],
  em_andamento: ["Em andamento", "var(--st-doing)"],
  travada: ["Travada", "var(--st-stuck)"],
  concluida: ["Concluída", "var(--st-done)"],
};
export const PRIORITY_LABEL: Record<TaskPriority, [string, string]> = {
  urgente: ["Urgente", "var(--pr-urgent)"],
  alta: ["Alta", "var(--pr-high)"],
  media: ["Média", "var(--pr-mid)"],
  baixa: ["Baixa", "var(--pr-low)"],
};
const BUCKET_LABEL: Record<DueBucket, [string, string]> = {
  late: ["Atrasadas", "#c0392b"],
  today: ["Hoje", "#a34c1f"],
  week: ["Próximos 7 dias", "#537179"],
  later: ["Depois", "#776157"],
  none: ["Sem prazo", "#8a8279"],
  done: ["Concluídas", "#2f6b4f"],
};

/** Agrupa tarefas em seções. Em "grupo" usa os grupos reais do quadro (mantém grupos vazios). */
export function groupTasks(
  tasks: TaskDTO[],
  by: GroupBy,
  ctx: { users: { id: string; name: string }[]; groups: { id: string; name: string; color: string }[]; today: string; toDay: (d: Date) => string },
): Section[] {
  const pick = (f: (t: TaskDTO) => boolean) => tasks.filter(f);
  if (by === "grupo") return ctx.groups.map((g) => ({ key: g.id, label: g.name, color: g.color, tasks: pick((t) => t.groupId === g.id) }));
  if (by === "situacao") return STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s][0], color: STATUS_LABEL[s][1], tasks: pick((t) => t.status === s) }));
  if (by === "prioridade") return PRIORITY_ORDER.map((p) => ({ key: p, label: PRIORITY_LABEL[p][0], color: PRIORITY_LABEL[p][1], tasks: pick((t) => t.priority === p) }));
  if (by === "responsavel") {
    return [
      ...ctx.users.map((u) => ({ key: u.id, label: u.name, color: "#537179", tasks: pick((t) => t.assigneeId === u.id) })),
      { key: "none", label: "Sem responsável", color: "#8a8279", tasks: pick((t) => !t.assigneeId) },
    ];
  }
  const order: DueBucket[] = ["late", "today", "week", "later", "none", "done"];
  return order.map((b) => ({ key: b, label: BUCKET_LABEL[b][0], color: BUCKET_LABEL[b][1], tasks: pick((t) => dueBucket(dayOf(t, ctx.toDay), t.status, ctx.today) === b) }));
}

/* ------------------------------- linha do tempo ------------------------------- */

/** Barra do Gantt em colunas (0-based) dentro de uma janela de `days` dias; null se fora da janela. */
export function timelineBar(startISO: string, dueISO: string, windowStart: string, days: number) {
  const s = diffDays(windowStart, startISO <= dueISO ? startISO : dueISO);
  const e = diffDays(windowStart, dueISO);
  if (e < 0 || s > days - 1) return null;
  const from = Math.max(0, s);
  const to = Math.min(days - 1, e);
  return { from, span: to - from + 1, clippedStart: s < 0, clippedEnd: e > days - 1 };
}

/* ------------------------------ colunas personalizadas ------------------------------ */

export const COLUMN_TYPES: { v: TaskColumn["type"]; l: string }[] = [
  { v: "texto", l: "Texto" },
  { v: "numero", l: "Número" },
  { v: "data", l: "Data" },
  { v: "selecao", l: "Seleção" },
  { v: "pessoa", l: "Pessoa" },
  { v: "caixa", l: "Caixa de seleção" },
  { v: "link", l: "Link" },
];

/** Normaliza o valor de uma coluna personalizada conforme o tipo (null = limpar). */
export function cleanCustomValue(col: TaskColumn, v: unknown): string | number | boolean | null {
  if (v === null || v === undefined || v === "") return null;
  switch (col.type) {
    case "texto":
      return String(v).slice(0, 500);
    case "numero": {
      const raw = typeof v === "number" ? String(v) : String(v).trim();
      const n = typeof v === "number" ? v : Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
      return Number.isFinite(n) ? n : null;
    }
    case "data":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
    case "selecao":
      return col.options?.includes(String(v)) ? String(v) : null;
    case "pessoa":
      return /^[0-9a-f-]{36}$/i.test(String(v)) ? String(v) : null;
    case "caixa":
      return v === true || v === "true" ? true : null;
    case "link": {
      const s = String(v).trim().slice(0, 500);
      return /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+/.test(s) ? `https://${s}` : null;
    }
  }
}

/** Cor estável para uma etiqueta (hash do texto). */
const LABEL_COLORS = ["#a34c1f", "#2a6fb8", "#2f6b4f", "#7a4b9e", "#8a5200", "#00677a", "#a8324a"];
export function labelColor(label: string) {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length];
}
