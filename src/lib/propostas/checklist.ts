/**
 * Geração do checklist do dossiê a partir de um modelo (puro). Idempotente: reaplicar nunca duplica itens
 * (a chave do item do modelo, `tplKey`, é única por dossiê) nem sobrescreve o que a equipe já mexeu.
 */
import { dayToInstant, dueFromDeadline } from "./dates";
import { STEPS, STEP_BY_KEY, isStepKey, type RoleKey, type StepKey, type TemplateItem } from "./types";

export type PlannedItem = {
  tplKey: string;
  stepKey: StepKey;
  title: string;
  position: number;
  offsetDays: number | null;
  role: RoleKey | null;
  dueDay: string | null;
  squeezed: boolean;
};

export type ExistingItem = { tplKey: string | null };

/** Itens que ainda NÃO existem no dossiê, com o prazo calculado de trás para frente. */
export function planChecklist(items: TemplateItem[], deadlineDay: string | null, today: string, existing: ExistingItem[] = [], startPosition = 0): PlannedItem[] {
  const have = new Set(existing.map((e) => e.tplKey).filter((k): k is string => !!k));
  const order = new Map(STEPS.map((s, i) => [s.key, i]));
  const sorted = items.filter((i) => isStepKey(i.step)).sort((a, b) => (order.get(a.step) ?? 99) - (order.get(b.step) ?? 99));
  const out: PlannedItem[] = [];
  let pos = startPosition;
  for (const it of sorted) {
    if (have.has(it.key)) continue;
    have.add(it.key); // chave repetida no próprio modelo também não duplica
    let dueDay: string | null = null;
    let squeezed = false;
    if (deadlineDay && it.offsetDays !== null) {
      const d = dueFromDeadline(deadlineDay, it.offsetDays, today);
      dueDay = d.day;
      squeezed = d.squeezed;
    }
    out.push({ tplKey: it.key, stepKey: it.step, title: it.title, position: pos++, offsetDays: it.offsetDays, role: it.role, dueDay, squeezed });
  }
  return out;
}

/** Prazo padrão de cada etapa (as 8 etapas sempre existem). */
export function planSteps(deadlineDay: string | null, today: string): { key: StepKey; position: number; dueDay: string | null }[] {
  return STEPS.map((s, i) => ({
    key: s.key,
    position: i,
    dueDay: deadlineDay && s.offset !== null ? dueFromDeadline(deadlineDay, s.offset, today).day : s.key === "resultado" ? deadlineDay : null,
  }));
}

/** Quem assume um item: o responsável do papel (configuração) ou, na falta, o responsável do dossiê. */
export function assigneeFor(role: RoleKey | null, roles: Partial<Record<RoleKey, string>>, ownerId: string | null): string | null {
  return (role && roles[role]) || ownerId || null;
}

export const itemDueAt = (dueDay: string | null) => (dueDay ? dayToInstant(dueDay) : null);

/** Texto curto de “D-2” para a tela. */
export const offsetLabel = (offset: number | null) => (offset === null ? "sem prazo" : offset === 0 ? "no dia" : `D-${offset}`);

export const stepLabel = (k: string) => (isStepKey(k) ? STEP_BY_KEY[k].label : k);
