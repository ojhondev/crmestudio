/**
 * Motor dos assistentes passo a passo (puro, testável): quais passos aparecem, se dá para avançar e quanto já foi feito.
 * O componente <Wizard> só desenha; as regras ficam aqui.
 */

export type StepDef<V> = {
  id: string;
  /** passo condicional: some quando devolve true */
  skip?: (v: V) => boolean;
  /** mensagem de erro (ou null se pode avançar) */
  validate?: (v: V) => string | null;
};

export const visibleSteps = <V, S extends StepDef<V>>(steps: S[], v: V): S[] => steps.filter((s) => !s.skip?.(v));

export type Advance = { kind: "next"; index: number } | { kind: "submit" } | { kind: "error"; error: string };

/** O que acontece ao apertar "Continuar" no passo `index` (índice entre os passos visíveis). */
export function advance<V>(steps: StepDef<V>[], v: V, index: number, opts: { hasReview?: boolean } = {}): Advance {
  const vis = visibleSteps(steps, v);
  const cur = vis[index];
  if (!cur) return { kind: "submit" };
  const err = cur.validate?.(v) ?? null;
  if (err) return { kind: "error", error: err };
  if (index + 1 < vis.length) return { kind: "next", index: index + 1 };
  return opts.hasReview ? { kind: "next", index: vis.length } : { kind: "submit" };
}

/** Antes de enviar, confere TODOS os passos visíveis: devolve o primeiro que falha (para voltar a ele). */
export function firstInvalid<V>(steps: StepDef<V>[], v: V): { index: number; error: string } | null {
  const vis = visibleSteps(steps, v);
  for (let i = 0; i < vis.length; i++) {
    const err = vis[i].validate?.(v);
    if (err) return { index: i, error: err };
  }
  return null;
}

/** Percentual da barra: o passo atual conta como "em andamento" (nunca 0, nunca passa de 100). */
export function progressPct(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round(((index + 1) / total) * 100)));
}

/** Mantém o índice dentro dos passos visíveis quando as respostas mudam a lista (passos condicionais). */
export function clampIndex(index: number, visibleCount: number, hasReview: boolean): number {
  const max = visibleCount - (hasReview ? 0 : 1);
  return Math.max(0, Math.min(index, max));
}

/** Rascunho salvo vale por 7 dias. */
export const DRAFT_TTL_MS = 7 * 24 * 3600e3;
export type Draft<V> = { v: V; index: number; at: number };
export function readDraft<V>(raw: string | null, now = Date.now()): Draft<V> | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft<V>;
    if (!d || typeof d.at !== "number" || typeof d.index !== "number" || now - d.at > DRAFT_TTL_MS || typeof d.v !== "object") return null;
    return d;
  } catch {
    return null;
  }
}
