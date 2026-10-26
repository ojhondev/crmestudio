/**
 * Planilha de preços reaproveitável do dossiê (composição de custos, BDI, cronograma físico-financeiro e resumo).
 * Usa as fórmulas do módulo Planilhas; BDI e encargos ficam na aba “Resumo” (editáveis em cada proposta).
 */
import { emptyTab, type Cell, type CellStyle, type TabData } from "@/lib/sheets/types";

const HEAD: CellStyle = { b: 1, c: "#ffffff", bg: "#193f32", al: "l" };
const TOTAL: CellStyle = { b: 1, bg: "#eef2ef", bt: "#193f32" };
const NOTE: CellStyle = { i: 1, c: "#6b7280" };
const INPUT: CellStyle = { bg: "#fff7e6" };

type Spec = (string | number | null | { v?: string | number; f?: string; fmt?: string; s?: CellStyle })[][];

function build(id: string, name: string, spec: Spec, widths: number[], headRows = 1): TabData {
  const tab = emptyTab(id, name, 200, Math.max(12, (spec[0]?.length ?? 0) + 2));
  spec.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null) return;
      const out: Cell = {};
      if (typeof cell === "object") {
        if (cell.f !== undefined) out.f = cell.f;
        else if (cell.v !== undefined) out.v = cell.v;
        if (cell.fmt) out.fmt = cell.fmt;
        if (cell.s) out.s = cell.s;
      } else out.v = cell;
      if (r < headRows) out.s = { ...HEAD, ...out.s };
      (tab.grid[r] ??= {})[c] = out;
    });
  });
  widths.forEach((w, c) => (tab.colW[c] = w));
  tab.frozenRows = headRows;
  return tab;
}

export type PriceItemInput = { desc: string; unit: string; qty: number; material: number; labor: number };
export type PriceSheetOptions = { bdiPercent: number; encargosPercent: number; estimatedCents?: number | null; title?: string; /** itens principais já preenchidos (substituem os exemplos) */ items?: PriceItemInput[] };

export const PRICE_ROWS = 40;
export const SCHEDULE_ROWS = 10;
export const SCHEDULE_MONTHS = 6;

/** Abas: Composição · Cronograma · Resumo. */
export function priceSheetTabs(opts: PriceSheetOptions): { name: string; tabs: TabData[] } {
  const bdi = Math.max(0, opts.bdiPercent) / 100;
  const enc = Math.max(0, opts.encargosPercent) / 100;
  const last = PRICE_ROWS + 1; // última linha de itens (linha 41)

  // ---- Composição ----
  const comp: Spec = [["Item", "Descrição", "Un.", "Qtd.", "Material / serviço unit. (R$)", "Mão de obra unit. (R$)", "Custo unit. (R$)", "Custo total (R$)", "Preço unit. c/ BDI (R$)", "Preço total (R$)"]];
  const given = (opts.items ?? []).filter((it) => it.desc.trim() && it.qty > 0).slice(0, PRICE_ROWS);
  const samples: [string, string, string, number, number, number][] = given.length
    ? given.map((it, i) => [`1.${i + 1}`, it.desc.trim(), it.unit.trim() || "un", it.qty, it.material, it.labor])
    : [
        ["1.1", "Exemplo: limpeza e prospecção estratigráfica", "m²", 42, 18, 55],
        ["1.2", "Exemplo: consolidação do reboco", "m²", 42, 60, 95],
      ];
  for (let i = 0; i < PRICE_ROWS; i++) {
    const r = i + 2;
    const s = samples[i];
    comp.push([
      s ? s[0] : null,
      s ? s[1] : null,
      s ? s[2] : null,
      s ? { v: s[3], s: INPUT } : null,
      s ? { v: s[4], fmt: "brl:2", s: INPUT } : null,
      s ? { v: s[5], fmt: "brl:2", s: INPUT } : null,
      { f: `IF(D${r}="","",E${r}+F${r}*(1+Resumo!$B$3))`, fmt: "brl:2" },
      { f: `IF(D${r}="","",D${r}*G${r})`, fmt: "brl:2" },
      { f: `IF(D${r}="","",G${r}*(1+Resumo!$B$2))`, fmt: "brl:2" },
      { f: `IF(D${r}="","",D${r}*I${r})`, fmt: "brl:2" },
    ]);
  }
  comp.push([{ v: "Total", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { f: `SUM(H2:H${last})`, fmt: "brl:2", s: TOTAL }, { v: "", s: TOTAL }, { f: `SUM(J2:J${last})`, fmt: "brl:2", s: TOTAL }]);
  comp.push([null]);
  comp.push([{ v: "Preencha só as células amarelas (quantidade e custos). O resto é calculado com o BDI e os encargos da aba Resumo. Apague os exemplos.", s: NOTE }]);
  const compTab = build("t1", "Composição", comp, [60, 340, 60, 80, 150, 140, 120, 130, 150, 140]);

  // ---- Resumo ----
  const sum: Spec = [
    ["Parâmetro / resultado", "Valor"],
    ["BDI (%)", { v: bdi, fmt: "pct:2", s: INPUT }],
    ["Encargos sociais sobre a mão de obra (%)", { v: enc, fmt: "pct:2", s: INPUT }],
    [null],
    ["Custo direto total", { f: `Composição!H${PRICE_ROWS + 2}`, fmt: "brl:2" }],
    ["BDI (valor)", { f: "B5*B2", fmt: "brl:2" }],
    [{ v: "Preço total da proposta", s: TOTAL }, { f: "B5+B6", fmt: "brl:2", s: TOTAL }],
    [null],
    ["Valor estimado pelo órgão", { v: opts.estimatedCents ? opts.estimatedCents / 100 : "", fmt: "brl:2", s: INPUT }],
    ["Proposta em relação ao estimado", { f: 'IF(OR(B9="",B9=0),"",B7/B9-1)', fmt: "pct:1" }],
    [null],
    [{ v: "Dica: o preço total pode diferir do estimado. Confira no edital o critério de aceitabilidade (preço máximo / inexequível).", s: NOTE }],
  ];
  const sumTab = build("t3", "Resumo", sum, [330, 190]);

  // ---- Cronograma físico-financeiro ----
  const months = Array.from({ length: SCHEDULE_MONTHS }, (_, i) => `Mês ${i + 1} (%)`);
  const sched: Spec = [["Etapa", "Peso (%)", "Valor (R$)", ...months, "Soma (%)"]];
  const stages: [string, number, number[]][] = [
    ["Canteiro e levantamentos", 0.1, [1, 0, 0, 0, 0, 0]],
    ["Consolidação e limpeza", 0.4, [0.3, 0.4, 0.3, 0, 0, 0]],
    ["Restauro / reintegração", 0.4, [0, 0, 0.3, 0.4, 0.3, 0]],
    ["Acabamento e entrega", 0.1, [0, 0, 0, 0, 0.5, 0.5]],
  ];
  for (let i = 0; i < SCHEDULE_ROWS; i++) {
    const r = i + 2;
    const s = stages[i];
    sched.push([
      s ? s[0] : null,
      s ? { v: s[1], fmt: "pct:0", s: INPUT } : null,
      { f: `IF(B${r}="","",B${r}*Resumo!$B$7)`, fmt: "brl:2" },
      ...months.map((_, m) => (s ? { v: s[2][m], fmt: "pct:0", s: INPUT } : null)),
      { f: `IF(B${r}="","",SUM(D${r}:I${r}))`, fmt: "pct:0" },
    ]);
  }
  const fl = SCHEDULE_ROWS + 1;
  sched.push([
    { v: "Total / desembolso do mês (R$)", s: TOTAL },
    { f: `SUM(B2:B${fl})`, fmt: "pct:0", s: TOTAL },
    { f: `SUM(C2:C${fl})`, fmt: "brl:2", s: TOTAL },
    ...months.map((_, m) => {
      const col = String.fromCharCode(68 + m); // D..I
      return { f: `SUMPRODUCT($C$2:$C$${fl},${col}2:${col}${fl})`, fmt: "brl:2", s: TOTAL };
    }),
    { v: "", s: TOTAL },
  ]);
  sched.push([null]);
  sched.push([{ v: "Em cada etapa, distribua 100% da execução entre os meses. Os pesos das etapas devem somar 100%.", s: NOTE }]);
  const schedTab = build("t2", "Cronograma", sched, [260, 90, 140, 90, 90, 90, 90, 90, 90, 90]);

  return { name: opts.title ?? "Planilha de preços", tabs: [compTab, schedTab, sumTab] };
}
