/**
 * Funil padrão do CRM (fonte única para seed.ts e migrate-stages.ts).
 * Etapas de trabalho: Novo lead → Proposta enviada → Negociação → Follow Up → Fechado.
 * "Perdido" fica ao final como etapa de sistema (kind perdido), usada pela lógica de ganho/perdido.
 */
import type { StageKind } from "../src/lib/db/schema";

export type StageDef = { name: string; probability: number; color: string; kind: StageKind };

export const FINAL_STAGES: StageDef[] = [
  { name: "Novo lead", probability: 10, color: "#9a948f", kind: "aberto" },
  { name: "Proposta enviada", probability: 40, color: "#b75928", kind: "aberto" },
  { name: "Negociação", probability: 60, color: "#002934", kind: "aberto" },
  { name: "Follow Up", probability: 25, color: "#7b5ea7", kind: "aberto" },
  { name: "Fechado", probability: 100, color: "#2f6b4f", kind: "ganho" },
  { name: "Perdido", probability: 0, color: "#c0392b", kind: "perdido" },
];

/** Etapas aposentadas (por nome normalizado, sem acento/caixa). */
export const REMOVED_STAGE_NAMES = ["qualificacao", "visita tecnica"];

export const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
