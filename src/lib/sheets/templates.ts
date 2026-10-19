/**
 * Modelos de planilha prontos (Controle de materiais, Custo por projeto, Orçamento de obra, Fluxo de caixa, Cronograma).
 */
import { serialFromYMD } from "./format";
import { emptyTab, type Cell, type CellStyle, type TabData } from "./types";

export type TemplateKey = "branca" | "materiais" | "custos" | "orcamento" | "fluxo" | "cronograma";

export const TEMPLATES: { key: TemplateKey; label: string; description: string }[] = [
  { key: "branca", label: "Em branco", description: "Uma planilha vazia para começar do zero." },
  { key: "materiais", label: "Controle de materiais", description: "Material, quantidade, preço, fornecedor e total por item." },
  { key: "custos", label: "Custo por projeto", description: "Lançamentos de custo por projeto, com resumo automático por projeto." },
  { key: "orcamento", label: "Orçamento de obra", description: "Itens, quantidades e preços, com BDI e total." },
  { key: "fluxo", label: "Fluxo de caixa simples", description: "Entradas, saídas, saldo do mês e saldo acumulado." },
  { key: "cronograma", label: "Cronograma", description: "Etapas, responsáveis, datas, prazo em dias e andamento." },
];

const HEAD: CellStyle = { b: 1, c: "#ffffff", bg: "#193f32", al: "l" };
const TOTAL: CellStyle = { b: 1, bg: "#eef2ef", bt: "#193f32" };
const INPUT_NOTE: CellStyle = { i: 1, c: "#6b7280" };

type Spec = (string | number | { f: string; fmt?: string; s?: CellStyle } | { v: string | number; fmt?: string; s?: CellStyle } | null)[][];

function build(id: string, name: string, spec: Spec, opts: { widths?: number[]; headRows?: number; fmts?: Record<number, string>; frozen?: number; rows?: number } = {}): TabData {
  const tab = emptyTab(id, name, opts.rows ?? 1000, Math.max(26, (spec[0]?.length ?? 0) + 2));
  const headRows = opts.headRows ?? 1;
  spec.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null) return;
      const out: Cell = {};
      if (typeof cell === "object") {
        if ("f" in cell) out.f = cell.f;
        else out.v = cell.v;
        if (cell.fmt) out.fmt = cell.fmt;
        if (cell.s) out.s = cell.s;
      } else out.v = cell;
      if (r < headRows) out.s = { ...HEAD, ...(typeof cell === "object" && "s" in cell ? cell.s : {}) };
      else if (opts.fmts?.[c] && !out.fmt) out.fmt = opts.fmts[c];
      (tab.grid[r] ??= {})[c] = out;
    });
  });
  opts.widths?.forEach((w, c) => (tab.colW[c] = w));
  tab.frozenRows = opts.frozen ?? headRows;
  return tab;
}

const d = (y: number, m: number, day: number) => serialFromYMD(y, m, day);

export function templateTabs(key: TemplateKey): { name: string; tabs: TabData[] } {
  const y = new Date().getFullYear();
  switch (key) {
    case "materiais": {
      const rows: Spec = [["Material", "Unidade", "Quantidade", "Preço unit. (R$)", "Total (R$)", "Fornecedor", "Projeto", "Data da compra"]];
      const samples: [string, string, number, number, string, string, number][] = [
        ["Pigmento ultramar", "pote 250 g", 4, 86.9, "Casa das Tintas", "Matriz de Itu", d(y, 3, 12)],
        ["Verniz damar", "litro", 2, 142, "Casa das Tintas", "Matriz de Itu", d(y, 3, 12)],
        ["Folha de ouro 23k", "livreto", 6, 58.5, "Doratura Brasil", "Capela do Carmo", d(y, 4, 2)],
      ];
      samples.forEach((s, i) => rows.push([s[0], s[1], s[2], { v: s[3], fmt: "brl:2" }, { f: `C${i + 2}*D${i + 2}`, fmt: "brl:2" }, s[4], s[5], { v: s[6], fmt: "date" }]));
      for (let r = samples.length; r < 40; r++) rows.push([null, null, null, null, { f: `IF(C${r + 2}="","",C${r + 2}*D${r + 2})`, fmt: "brl:2" }]);
      rows.push([{ v: "Total", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { f: "SUM(E2:E41)", fmt: "brl:2", s: TOTAL }]);
      return { name: "Controle de materiais", tabs: [build("t1", "Materiais", rows, { widths: [200, 110, 100, 120, 120, 160, 160, 120], fmts: { 3: "brl:2", 7: "date" } })] };
    }
    case "custos": {
      const lanc: Spec = [["Projeto", "Categoria", "Descrição", "Valor (R$)", "Data"]];
      const samples: [string, string, string, number, number][] = [
        ["Matriz de Itu", "Materiais", "Pigmentos e vernizes", 1325.4, d(y, 3, 12)],
        ["Matriz de Itu", "Mão de obra", "Equipe — março", 8400, d(y, 3, 31)],
        ["Capela do Carmo", "Materiais", "Folha de ouro", 351, d(y, 4, 2)],
        ["Capela do Carmo", "Transporte", "Deslocamento da equipe", 280, d(y, 4, 5)],
      ];
      samples.forEach((s) => lanc.push([s[0], s[1], s[2], { v: s[3], fmt: "brl:2" }, { v: s[4], fmt: "date" }]));
      const resumo: Spec = [["Projeto", "Custo total (R$)", "Lançamentos"]];
      ["Matriz de Itu", "Capela do Carmo"].forEach((p, i) =>
        resumo.push([p, { f: `SUMIF(Lançamentos!A:A,A${i + 2},Lançamentos!D:D)`, fmt: "brl:2" }, { f: `COUNTIF(Lançamentos!A:A,A${i + 2})`, fmt: "n:0" }]),
      );
      resumo.push([{ v: "Total", s: TOTAL }, { f: "SUM(B2:B30)", fmt: "brl:2", s: TOTAL }, { f: "SUM(C2:C30)", fmt: "n:0", s: TOTAL }]);
      resumo.push([null]);
      resumo.push([{ v: "Dica: acrescente um projeto em uma nova linha acima do Total e copie a fórmula da linha anterior.", s: INPUT_NOTE }]);
      return {
        name: "Custo por projeto",
        tabs: [build("t1", "Lançamentos", lanc, { widths: [180, 140, 260, 130, 110], fmts: { 3: "brl:2", 4: "date" } }), build("t2", "Resumo", resumo, { widths: [200, 160, 120] })],
      };
    }
    case "orcamento": {
      const rows: Spec = [["Item", "Descrição", "Un.", "Qtd.", "Preço unit. (R$)", "Subtotal (R$)"]];
      const samples: [string, string, string, number, number][] = [
        ["1.1", "Limpeza e prospecção estratigráfica", "m²", 42, 95],
        ["1.2", "Consolidação do reboco", "m²", 42, 180],
        ["2.1", "Reintegração pictórica", "m²", 30, 420],
        ["3.1", "Proteção final (verniz)", "m²", 42, 60],
      ];
      samples.forEach((s, i) => rows.push([s[0], s[1], s[2], s[3], { v: s[4], fmt: "brl:2" }, { f: `D${i + 2}*E${i + 2}`, fmt: "brl:2" }]));
      for (let r = samples.length; r < 25; r++) rows.push([null, null, null, null, null, { f: `IF(D${r + 2}="","",D${r + 2}*E${r + 2})`, fmt: "brl:2" }]);
      rows.push([null]);
      rows.push([null, { v: "Subtotal", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { f: "SUM(F2:F26)", fmt: "brl:2", s: TOTAL }]);
      rows.push([null, "BDI / margem", null, null, { v: 0.2, fmt: "pct:0" }, { f: "F28*E29", fmt: "brl:2" }]);
      rows.push([null, { v: "Total do orçamento", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { f: "F28+F29", fmt: "brl:2", s: TOTAL }]);
      return { name: "Orçamento de obra", tabs: [build("t1", "Orçamento", rows, { widths: [60, 330, 60, 80, 130, 140], fmts: { 4: "brl:2" } })] };
    }
    case "fluxo": {
      const rows: Spec = [["Mês", "Entradas (R$)", "Saídas (R$)", "Saldo do mês (R$)", "Saldo acumulado (R$)"]];
      const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      meses.forEach((m, i) =>
        rows.push([
          m,
          { v: i < 3 ? [18500, 12000, 21000][i] : 0, fmt: "brl:2" },
          { v: i < 3 ? [9800, 10250, 11400][i] : 0, fmt: "brl:2" },
          { f: `B${i + 2}-C${i + 2}`, fmt: "brl:2" },
          { f: i === 0 ? "D2" : `E${i + 1}+D${i + 2}`, fmt: "brl:2" },
        ]),
      );
      rows.push([{ v: "Total", s: TOTAL }, { f: "SUM(B2:B13)", fmt: "brl:2", s: TOTAL }, { f: "SUM(C2:C13)", fmt: "brl:2", s: TOTAL }, { f: "SUM(D2:D13)", fmt: "brl:2", s: TOTAL }, { v: "", s: TOTAL }]);
      return { name: "Fluxo de caixa", tabs: [build("t1", "Fluxo", rows, { widths: [130, 150, 150, 160, 170], fmts: { 1: "brl:2", 2: "brl:2", 3: "brl:2", 4: "brl:2" } })] };
    }
    case "cronograma": {
      const rows: Spec = [["Etapa", "Responsável", "Início", "Fim", "Dias", "Status", "% concluído"]];
      const samples: [string, string, number, number, string, number][] = [
        ["Visita técnica e levantamento", "Equipe", d(y, 3, 3), d(y, 3, 5), "Concluída", 1],
        ["Prospecção estratigráfica", "Restauradora", d(y, 3, 10), d(y, 3, 21), "Concluída", 1],
        ["Consolidação e limpeza", "Equipe", d(y, 3, 24), d(y, 4, 18), "Em andamento", 0.6],
        ["Reintegração pictórica", "Restauradora", d(y, 4, 21), d(y, 6, 6), "A fazer", 0],
      ];
      samples.forEach((s, i) =>
        rows.push([s[0], s[1], { v: s[2], fmt: "date" }, { v: s[3], fmt: "date" }, { f: `D${i + 2}-C${i + 2}+1`, fmt: "n:0" }, s[4], { v: s[5], fmt: "pct:0" }]),
      );
      for (let r = samples.length; r < 20; r++) rows.push([null, null, null, null, { f: `IF(OR(C${r + 2}="",D${r + 2}=""),"",D${r + 2}-C${r + 2}+1)`, fmt: "n:0" }]);
      rows.push([{ v: "Andamento geral", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { v: "", s: TOTAL }, { f: "SUM(E2:E21)", fmt: "n:0", s: TOTAL }, { v: "", s: TOTAL }, { f: "IFERROR(AVERAGE(G2:G21),0)", fmt: "pct:0", s: TOTAL }]);
      return { name: "Cronograma", tabs: [build("t1", "Cronograma", rows, { widths: [260, 140, 110, 110, 70, 130, 120], fmts: { 2: "date", 3: "date", 6: "pct:0" } })] };
    }
    default:
      return { name: "Planilha sem título", tabs: [emptyTab("t1", "Planilha1")] };
  }
}

export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === "string" && TEMPLATES.some((t) => t.key === v);
