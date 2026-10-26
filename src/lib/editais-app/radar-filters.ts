/**
 * Filtros do Radar (puro): reaproveita os filtros do módulo Editais e acrescenta a ABA e a modalidade.
 * Viaja pela URL, então a tela é compartilhável.
 */
import { DEFAULT_FILTERS, filtersToQuery, parseFilters, type EditalFilters } from "@/lib/editais/filters";
import { isRadarTab, type RadarTab } from "./access";

export type RadarFilters = EditalFilters & { tab: RadarTab; mod: string };

type SP = Record<string, string | string[] | undefined> | URLSearchParams;
const get = (sp: SP, k: string) => {
  const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

/** Abas em que a decisão já foi tomada: mostram tudo (inclusive encerrados e de qualquer relevância). */
export const DECIDED_TABS: RadarTab[] = ["proposta", "descartados"];

export function parseRadar(sp: SP, opts: { partner?: boolean } = {}): RadarFilters {
  const base = parseFilters(sp);
  const t = get(sp, "aba");
  const tab: RadarTab = opts.partner ? "todos" : isRadarTab(t) ? t : "novos";
  const f: RadarFilters = { ...base, tab, mod: get(sp, "mod").trim().slice(0, 60), triagem: "todos" };
  const decided = DECIDED_TABS.includes(tab) || opts.partner;
  if (decided) {
    if (!get(sp, "situacao")) f.situacao = "todos";
    if (!get(sp, "rel")) f.rel = 0;
  }
  return f;
}

/** Só o que difere do padrão da aba (URL limpa). */
export function radarQuery(f: Partial<RadarFilters>, opts: { partner?: boolean } = {}): string {
  const p = new URLSearchParams(filtersToQuery({ ...f, triagem: "" } as EditalFilters));
  const tab = f.tab ?? "novos";
  const decided = DECIDED_TABS.includes(tab) || opts.partner;
  // padrões que mudam conforme a aba não entram na URL
  if (decided) {
    if (p.get("situacao") === "todos") p.delete("situacao");
    if (p.get("rel") === "0") p.delete("rel");
    if (f.situacao === "aberto") p.set("situacao", "aberto");
    if (f.rel !== undefined && f.rel !== 0) p.set("rel", String(f.rel));
  } else {
    if (f.situacao === "todos") p.set("situacao", "todos");
    if (f.rel === 0) p.set("rel", "0");
  }
  if (!opts.partner && tab !== "novos") p.set("aba", tab);
  if (f.mod) p.set("mod", f.mod);
  return p.toString();
}

/** Quantos filtros "extras" (os do Mais filtros) estão ligados — para o selo do botão. */
export function extraFilterCount(f: Pick<RadarFilters, "esfera" | "city" | "vmin" | "vmax" | "owner" | "mod">): number {
  return [f.esfera, f.city, f.vmin !== null && f.vmin !== undefined, f.vmax !== null && f.vmax !== undefined, f.owner, f.mod].filter(Boolean).length;
}

export { DEFAULT_FILTERS };
