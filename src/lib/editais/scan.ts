/**
 * Orquestra a varredura do PNCP: percorre as consultas, tria cada edital com as regras (triage.ts) e entrega ao `sink`
 * só o que tem chance de ser restauro (nota ≥ SCORE_STORE_MIN). Arquivo puro: roda na função da Vercel (varredura rápida)
 * e no script do GitHub Actions (varredura completa) sem alterações.
 *
 * Retomável: o `cursor` (fase + passo + página) é entregue ao sink a cada página; uma rodada interrompida recomeça dali.
 */
import { CONSULTA_MODALIDADES, DeadlineError, consultaPages, searchPages } from "./pncp";
import { triage } from "./triage";
import { SCORE_STORE_MIN, type Cursor, type EditalInput, type RunStats } from "./types";

/** Consultas da busca do portal (por radical). Ordem = prioridade (a varredura rápida usa só as primeiras). */
export const QUERIES_QUICK = ["restauro", "patrimônio histórico", "bem tombado", "tombado", "igreja", "capela", "museu", "teatro", "centro histórico", "patrimônio cultural", "conservação restauro", "monumento"];
export const QUERIES_FULL = [
  ...QUERIES_QUICK,
  "patrimônio artístico",
  "patrimônio edificado",
  "bens tombados",
  "tombamento",
  "sítio histórico",
  "conjunto arquitetônico",
  "catedral",
  "basílica",
  "convento",
  "mosteiro",
  "santuário",
  "palácio",
  "fortaleza",
  "retábulo",
  "douramento",
  "pintura mural",
  "azulejo",
  "vitral",
  "iphan",
  "iepha",
  "condephaat",
  "acervo",
  "obras de arte",
  "revitalização",
  "requalificação",
  "paróquia",
  "histórico",
];

/** Edital já triado: o que o sink recebe. */
export type Scored = EditalInput & { score: number; kind: string; kindWhy: string; matched: string[]; relevant: boolean };

export type ScanOpts = {
  mode: "rapida" | "completa";
  /** janela por data de publicação (os editais ainda abertos entram sempre, independentemente da data) */
  days: number;
  deadline?: number;
  cursor?: Cursor | null;
  /** chamado a cada página com os candidatos dela; deve persistir/enviar antes de devolver */
  sink: (items: Scored[], cursor: Cursor, stats: RunStats) => Promise<void>;
  log?: (m: string) => void;
  /** quais fontes usar (padrão: rápida = busca; completa = busca + consulta) */
  sources?: ("busca" | "consulta")[];
  throttleMs?: number;
  /** tentativas por chamada ao PNCP (padrão do coletor; os testes usam 0) */
  retries?: number;
};

export type ScanResult = { stats: RunStats; cursor: Cursor | null; completed: boolean; error?: string };

export function scoreItem(it: EditalInput): Scored {
  const t = triage(it.object, `${it.organ} ${it.unit ?? ""}`);
  return { ...it, score: t.score, kind: t.kind, kindWhy: t.kindWhy, matched: t.matched, relevant: t.relevant };
}

export async function runScan(o: ScanOpts): Promise<ScanResult> {
  const log = o.log ?? (() => {});
  const stats: RunStats = { scanned: 0, candidates: 0, relevant: 0, errors: 0, sources: {} };
  const seen = new Set<string>();
  const sources = o.sources ?? (o.mode === "rapida" ? ["busca"] : ["busca", "consulta"]);
  const queries = o.mode === "rapida" ? QUERIES_QUICK : QUERIES_FULL;
  const cutoffMs = Date.now() - o.days * 864e5;
  const http = { deadline: o.deadline, log, throttleMs: o.throttleMs, retries: o.retries };
  let cursor: Cursor = o.cursor ?? { phase: "busca", step: 0, page: 1 };

  const handle = async (items: EditalInput[], source: string, next: Cursor, failed = false) => {
    if (failed) stats.errors = (stats.errors ?? 0) + 1;
    const out: Scored[] = [];
    for (const it of items) {
      stats.scanned = (stats.scanned ?? 0) + 1;
      if (seen.has(it.externalId)) continue;
      seen.add(it.externalId);
      const s = scoreItem(it);
      if (s.score < SCORE_STORE_MIN) continue;
      out.push(s);
      stats.candidates = (stats.candidates ?? 0) + 1;
      if (s.relevant) stats.relevant = (stats.relevant ?? 0) + 1;
      stats.sources![source] = (stats.sources![source] ?? 0) + 1;
    }
    cursor = next;
    await o.sink(out, next, stats);
  };

  try {
    if (sources.includes("busca") && cursor.phase === "busca") {
      for (let i = cursor.step ?? 0; i < queries.length; i++) {
        const q = queries[i];
        // 1) todos os abertos que citam o termo  2) os publicados na janela (abertos ou não)
        // (a retomada é por consulta: recomeçar uma consulta é seguro, porque a gravação é idempotente)
        for (const status of ["recebendo_proposta", ""] as const) {
          for await (const p of searchPages(q, { ...http, status, cutoffMs: status ? undefined : cutoffMs, maxPages: o.mode === "rapida" ? 4 : 10 })) {
            await handle(p.items, "pncp-busca", { phase: "busca", step: i, page: 1 }, p.error);
          }
        }
        log(`busca “${q}” ok — ${stats.scanned} vistos, ${stats.relevant} relevantes`);
        cursor = { phase: "busca", step: i + 1, page: 1 };
      }
      cursor = { phase: "consulta", step: 0, page: 1 };
    }

    if (sources.includes("consulta")) {
      if (cursor.phase !== "consulta") cursor = { phase: "consulta", step: 0, page: 1 };
      for (let m = cursor.step ?? 0; m < CONSULTA_MODALIDADES.length; m++) {
        const startPage = m === (cursor.step ?? 0) ? (cursor.page ?? 1) : 1;
        for await (const p of consultaPages(CONSULTA_MODALIDADES[m], { ...http, startPage })) {
          await handle(p.items, "pncp-consulta", { phase: "consulta", step: m, page: p.page + 1 });
          if (p.page % 25 === 0) log(`consulta modalidade ${CONSULTA_MODALIDADES[m]}: página ${p.page}/${p.total} — ${stats.scanned} vistos, ${stats.relevant} relevantes`);
        }
        cursor = { phase: "consulta", step: m + 1, page: 1 };
      }
    }
    return { stats, cursor: null, completed: true };
  } catch (e) {
    if (e instanceof DeadlineError) return { stats, cursor, completed: false, error: "tempo esgotado (a rodada pode ser retomada)" };
    stats.errors = (stats.errors ?? 0) + 1;
    return { stats, cursor, completed: false, error: e instanceof Error ? e.message : "erro na varredura" };
  }
}
