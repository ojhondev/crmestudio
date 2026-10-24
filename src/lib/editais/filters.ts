/**
 * Filtros da lista de editais (puro: viaja pela URL, então a tela é compartilhável e o CSV exporta exatamente o que se vê).
 */
import { ESFERAS, KINDS, TRIAGES, UFS, SCORE_MIN_DEFAULT, type EditalKind, type EditalTriage } from "./types";

export type SituationFilter = "aberto" | "encerrado" | "suspenso" | "cancelado" | "todos";
export type SortKey = "prazo" | "relevancia" | "valor" | "recentes";
export type TriageFilter = "" | "ativos" | EditalTriage | "todos";

export type EditalFilters = {
  q: string;
  /** tipos: "projeto" também traz projeto+execução; "execucao" também traz projeto+execução */
  tipos: EditalKind[];
  esfera: string;
  ufs: string[];
  city: string;
  /** valores em reais */
  vmin: number | null;
  vmax: number | null;
  /** encerra em até N dias (0 = sem filtro); "sem" = sem prazo informado */
  prazo: number;
  situacao: SituationFilter;
  triagem: TriageFilter;
  rel: number;
  sort: SortKey;
  /** "me" ou id do responsável */
  owner: string;
  page: number;
};

export const DEFAULT_FILTERS: EditalFilters = {
  q: "",
  tipos: [],
  esfera: "",
  ufs: [],
  city: "",
  vmin: null,
  vmax: null,
  prazo: 0,
  situacao: "aberto",
  triagem: "",
  rel: SCORE_MIN_DEFAULT,
  sort: "prazo",
  owner: "",
  page: 1,
};

export const PAGE_SIZE = 40;

type SP = Record<string, string | string[] | undefined> | URLSearchParams;
const get = (sp: SP, k: string) => {
  const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function parseFilters(sp: SP): EditalFilters {
  const f = { ...DEFAULT_FILTERS };
  f.q = get(sp, "q").trim().slice(0, 100);
  f.tipos = get(sp, "tipo").split(",").filter((k): k is EditalKind => (KINDS as string[]).includes(k));
  const es = get(sp, "esfera");
  f.esfera = (ESFERAS as string[]).includes(es) ? es : "";
  f.ufs = get(sp, "uf").split(",").map((s) => s.trim().toUpperCase()).filter((s) => UFS.includes(s));
  f.city = get(sp, "cidade").trim().slice(0, 60);
  f.vmin = num(get(sp, "vmin"));
  f.vmax = num(get(sp, "vmax"));
  const pz = Number(get(sp, "prazo"));
  f.prazo = [3, 7, 15, 30, 60].includes(pz) ? pz : 0;
  const si = get(sp, "situacao");
  f.situacao = (["aberto", "encerrado", "suspenso", "cancelado", "todos"] as string[]).includes(si) ? (si as SituationFilter) : "aberto";
  const tr = get(sp, "triagem");
  f.triagem = tr === "ativos" || tr === "todos" || (TRIAGES as string[]).includes(tr) ? (tr as TriageFilter) : "";
  const rel = get(sp, "rel");
  f.rel = rel === "0" ? 0 : [35, 50, 70].includes(Number(rel)) ? Number(rel) : SCORE_MIN_DEFAULT;
  const so = get(sp, "ordem");
  f.sort = (["prazo", "relevancia", "valor", "recentes"] as string[]).includes(so) ? (so as SortKey) : "prazo";
  f.owner = get(sp, "resp").slice(0, 40);
  f.page = Math.max(1, Math.min(50, Number(get(sp, "pagina")) || 1));
  return f;
}

/** Só o que difere do padrão, para a URL ficar limpa. */
export function filtersToQuery(f: Partial<EditalFilters>): string {
  const p = new URLSearchParams();
  const d = DEFAULT_FILTERS;
  if (f.q) p.set("q", f.q);
  if (f.tipos?.length) p.set("tipo", f.tipos.join(","));
  if (f.esfera) p.set("esfera", f.esfera);
  if (f.ufs?.length) p.set("uf", f.ufs.join(","));
  if (f.city) p.set("cidade", f.city);
  if (f.vmin !== null && f.vmin !== undefined) p.set("vmin", String(f.vmin));
  if (f.vmax !== null && f.vmax !== undefined) p.set("vmax", String(f.vmax));
  if (f.prazo) p.set("prazo", String(f.prazo));
  if (f.situacao && f.situacao !== d.situacao) p.set("situacao", f.situacao);
  if (f.triagem) p.set("triagem", f.triagem);
  if (f.rel !== undefined && f.rel !== d.rel) p.set("rel", String(f.rel));
  if (f.sort && f.sort !== d.sort) p.set("ordem", f.sort);
  if (f.owner) p.set("resp", f.owner);
  if (f.page && f.page > 1) p.set("pagina", String(f.page));
  return p.toString();
}

/** Situação efetiva de um edital: "aberto" que já passou do prazo vira "encerrado". */
export function effectiveSituation(e: { situation: string; closeAt: string | Date | null }, nowMs = Date.now()) {
  if (e.situation === "aberto" && e.closeAt && new Date(e.closeAt).getTime() < nowMs) return "encerrado";
  return e.situation;
}

/** Dias inteiros até o fim do prazo (fuso de Brasília); negativo = já passou; null = sem prazo. */
export function daysLeft(closeAt: string | Date | null, nowMs = Date.now()): number | null {
  if (!closeAt) return null;
  const day = (ms: number) => Math.floor((ms - 3 * 3600e3) / 864e5);
  return day(new Date(closeAt).getTime()) - day(nowMs);
}

export const URGENT_DAYS = 7;

export function deadlineText(d: number | null) {
  if (d === null) return "Sem prazo informado";
  if (d < 0) return `Encerrou há ${-d} ${-d === 1 ? "dia" : "dias"}`;
  if (d === 0) return "Encerra hoje";
  if (d === 1) return "Encerra amanhã";
  return `Encerra em ${d} dias`;
}
