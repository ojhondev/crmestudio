/**
 * Progresso, urgência e estatísticas do dossiê (puro).
 */
import { diffDaysISO } from "./dates";
import type { DossieStatus, StepKey, StepStatus } from "./types";
import { STEPS } from "./types";

export type Urgency = "vencido" | "d1" | "d3" | "d7" | "ok" | "none";

/** dias até a data limite → faixa de urgência (≤7 / ≤3 / ≤1 / vencido) */
export function urgencyOf(daysLeft: number | null): Urgency {
  if (daysLeft === null) return "none";
  if (daysLeft < 0) return "vencido";
  if (daysLeft <= 1) return "d1";
  if (daysLeft <= 3) return "d3";
  if (daysLeft <= 7) return "d7";
  return "ok";
}
export const URGENCY_LABEL: Record<Urgency, string> = { vencido: "Vencido", d1: "Menos de 1 dia", d3: "Até 3 dias", d7: "Até 7 dias", ok: "No prazo", none: "Sem prazo" };

export function countdownText(daysLeft: number | null): string {
  if (daysLeft === null) return "Sem data limite";
  if (daysLeft < 0) return `Prazo passou há ${-daysLeft} ${-daysLeft === 1 ? "dia" : "dias"}`;
  if (daysLeft === 0) return "Abre hoje";
  if (daysLeft === 1) return "Falta 1 dia";
  return `Faltam ${daysLeft} dias`;
}

export type StepLite = { key: string; status: string; dueDay: string | null; assigneeId: string | null };
export type ItemLite = { stepKey: string; done: boolean; dueDay: string | null };

export type Progress = { pct: number; doneItems: number; totalItems: number; doneSteps: number; totalSteps: number; currentStep: StepKey | null; overdueSteps: number };

export function dossieProgress(steps: StepLite[], items: ItemLite[], today: string): Progress {
  const live = steps.filter((s) => s.status !== "nao_se_aplica");
  const doneSteps = live.filter((s) => s.status === "concluida").length;
  const liveKeys = new Set(live.map((s) => s.key));
  const liveItems = items.filter((i) => liveKeys.has(i.stepKey));
  const doneItems = liveItems.filter((i) => i.done).length;
  const pct = liveItems.length ? Math.round((doneItems / liveItems.length) * 100) : live.length ? Math.round((doneSteps / live.length) * 100) : 0;
  const order = STEPS.map((s) => s.key);
  const current = order.find((k) => live.some((s) => s.key === k && s.status !== "concluida")) ?? null;
  const overdueSteps = live.filter((s) => s.status !== "concluida" && s.dueDay && s.dueDay < today).length;
  return { pct, doneItems, totalItems: liveItems.length, doneSteps, totalSteps: live.length, currentStep: current, overdueSteps };
}

/** Status que o item ganha ao marcar/desmarcar: a etapa acompanha o checklist. */
export function stepStatusFromItems(current: StepStatus, items: { done: boolean }[]): StepStatus {
  if (current === "nao_se_aplica") return current;
  if (!items.length) return current;
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return "concluida";
  if (done > 0) return "em_andamento";
  return current === "concluida" ? "em_andamento" : current === "em_andamento" ? "a_fazer" : current;
}

/** Dias (inteiros) entre hoje e a data limite. */
export const daysTo = (deadlineDay: string | null, today: string) => (deadlineDay ? diffDaysISO(today, deadlineDay) : null);

/* ------------------------------ estatísticas de êxito ------------------------------ */

export type ResultRow = { status: DossieStatus; kind: string; organ: string; valueCents: number | null };
export type RateGroup = { label: string; total: number; won: number; lost: number; rate: number };

/** Taxa de êxito = ganhas / (ganhas + perdidas + desclassificadas). Desistências e em andamento não entram. */
export function successRate(rows: ResultRow[], by: "kind" | "organ"): RateGroup[] {
  const map = new Map<string, RateGroup>();
  for (const r of rows) {
    if (r.status === "andamento" || r.status === "desistiu") continue;
    const label = (by === "kind" ? r.kind : r.organ) || "—";
    const g = map.get(label) ?? { label, total: 0, won: 0, lost: 0, rate: 0 };
    g.total++;
    if (r.status === "ganhou") g.won++;
    else g.lost++;
    map.set(label, g);
  }
  return [...map.values()].map((g) => ({ ...g, rate: g.total ? Math.round((g.won / g.total) * 100) : 0 })).sort((a, b) => b.total - a.total || b.rate - a.rate);
}

export function overallRate(rows: ResultRow[]): { total: number; won: number; rate: number } {
  const decided = rows.filter((r) => r.status === "ganhou" || r.status === "perdeu" || r.status === "desclassificada");
  const won = decided.filter((r) => r.status === "ganhou").length;
  return { total: decided.length, won, rate: decided.length ? Math.round((won / decided.length) * 100) : 0 };
}

export function topReasons(rows: { status: string; reason: string | null }[], limit = 5): { reason: string; n: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "ganhou" || r.status === "andamento" || !r.reason) continue;
    map.set(r.reason, (map.get(r.reason) ?? 0) + 1);
  }
  return [...map.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n).slice(0, limit);
}
