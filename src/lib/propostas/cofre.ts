/**
 * Cofre de habilitação: situação de validade e matriz de habilitação (puro).
 * Datas "YYYY-MM-DD" no fuso do estúdio.
 */
import { diffDaysISO } from "./dates";
import { COFRE_ALERT_DAYS, type CofreType } from "./types";

export type Validity = "sem_validade" | "valido" | "vence_30" | "vencido";
export const VALIDITY_LABEL: Record<Validity, string> = { sem_validade: "Sem validade", valido: "Válido", vence_30: "Vence em breve", vencido: "Vencido" };

export function validityOf(validUntil: string | null, today: string): { status: Validity; daysLeft: number | null } {
  if (!validUntil) return { status: "sem_validade", daysLeft: null };
  const left = diffDaysISO(today, validUntil);
  if (left < 0) return { status: "vencido", daysLeft: left };
  if (left <= 30) return { status: "vence_30", daysLeft: left };
  return { status: "valido", daysLeft: left };
}

export function validityText(v: { status: Validity; daysLeft: number | null }) {
  if (v.status === "sem_validade") return "Sem validade";
  const d = v.daysLeft as number;
  if (d < 0) return `Venceu há ${-d} ${-d === 1 ? "dia" : "dias"}`;
  if (d === 0) return "Vence hoje";
  if (d === 1) return "Vence amanhã";
  return `Vence em ${d} dias`;
}

/** Documento vence exatamente hoje + N dias (N em COFRE_ALERT_DAYS)? Usado pelo aviso automático. */
export function alertWindow(validUntil: string | null, today: string, days: number[] = COFRE_ALERT_DAYS): number | null {
  if (!validUntil) return null;
  const left = diffDaysISO(today, validUntil);
  return days.includes(left) ? left : null;
}

/* --------------------------- matriz de habilitação --------------------------- */

export type CofreLite = { id: string; type: string; title: string; number: string | null; validUntil: string | null; url: string | null };
export type RequirementLite = { id: string; title: string; cofreType: string | null; cofreDocId: string | null; mode: string };

export type MatrixSituation = "ok" | "vence_antes" | "vencido" | "faltando" | "na" | "ok_manual";
export const MATRIX_LABEL: Record<MatrixSituation, string> = {
  ok: "Em dia",
  vence_antes: "Vence antes da sessão",
  vencido: "Vencido",
  faltando: "Faltando",
  na: "Não se aplica",
  ok_manual: "Atendida (manual)",
};

export type MatrixRow = {
  req: RequirementLite;
  doc: CofreLite | null;
  situation: MatrixSituation;
  /** dias entre a validade e a data da sessão (negativo = vence antes) */
  marginDays: number | null;
  note: string;
};

/** Escolhe, entre documentos do mesmo tipo, o que melhor atende: o de maior validade (válido até a sessão tem prioridade). */
export function bestDoc(docs: CofreLite[], type: string | null, sessionDay: string | null): CofreLite | null {
  if (!type) return null;
  const same = docs.filter((d) => d.type === type);
  if (!same.length) return null;
  const far = "9999-12-31";
  const score = (d: CofreLite) => {
    const until = d.validUntil ?? far;
    const covers = sessionDay ? until >= sessionDay : true;
    return (covers ? 1 : 0) * 1e12 + Number(until.replace(/-/g, ""));
  };
  return [...same].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Avalia cada exigência: usa o documento escolhido à mão ou o melhor do tipo; compara a validade com a data da sessão.
 * `sessionDay` = dia da sessão/limite. Documento com validade até a véspera da sessão já “vence antes”.
 */
export function evaluateMatrix(reqs: RequirementLite[], docs: CofreLite[], sessionDay: string | null, today: string): MatrixRow[] {
  return reqs.map((req) => {
    if (req.mode === "na") return { req, doc: null, situation: "na", marginDays: null, note: "Não se aplica a este edital." };
    if (req.mode === "ok_manual") return { req, doc: null, situation: "ok_manual", marginDays: null, note: "Atendida por outro meio (marcado pela equipe)." };
    const picked = req.cofreDocId ? docs.find((d) => d.id === req.cofreDocId) : null;
    const doc = picked ?? bestDoc(docs, req.cofreType, sessionDay);
    if (!doc) return { req, doc: null, situation: "faltando", marginDays: null, note: req.cofreType ? "Nada no cofre para esta exigência." : "Escolha um documento do cofre." };
    if (!doc.validUntil) return { req, doc, situation: "ok", marginDays: null, note: "Sem data de validade." };
    if (doc.validUntil < today) return { req, doc, situation: "vencido", marginDays: diffDaysISO(sessionDay ?? today, doc.validUntil), note: `Venceu em ${doc.validUntil.split("-").reverse().join("/")}.` };
    if (sessionDay && doc.validUntil < sessionDay) {
      const m = diffDaysISO(sessionDay, doc.validUntil);
      return { req, doc, situation: "vence_antes", marginDays: m, note: `Vence ${-m} ${-m === 1 ? "dia" : "dias"} antes da sessão: renove.` };
    }
    return { req, doc, situation: "ok", marginDays: sessionDay ? diffDaysISO(sessionDay, doc.validUntil) : null, note: "" };
  });
}

export type MatrixSummary = { total: number; ok: number; problems: number; faltando: number; vencendo: number };
export function summarizeMatrix(rows: MatrixRow[]): MatrixSummary {
  const live = rows.filter((r) => r.situation !== "na");
  const ok = live.filter((r) => r.situation === "ok" || r.situation === "ok_manual").length;
  const faltando = live.filter((r) => r.situation === "faltando").length;
  const vencendo = live.filter((r) => r.situation === "vence_antes" || r.situation === "vencido").length;
  return { total: live.length, ok, problems: faltando + vencendo, faltando, vencendo };
}

export const isCofreTypeLike = (v: string | null): v is CofreType => !!v;
