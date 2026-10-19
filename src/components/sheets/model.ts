/**
 * Auxiliares do editor de planilhas: medidas das linhas/colunas, seleção, região atual, estilos.
 */
import type { Book } from "@/lib/sheets/formula";
import { formatValue } from "@/lib/sheets/format";
import { DEFAULT_COL_W, DEFAULT_ROW_H, applyCells, type Cell, type CellStyle, type Grid, type TabData } from "@/lib/sheets/types";

export const HEADER_W = 46; // largura da coluna de números de linha
export const HEADER_H = 24; // altura da linha de letras

export type Sel = { ar: number; ac: number; fr: number; fc: number };
export type Range = { r1: number; c1: number; r2: number; c2: number };

export const rangeOf = (s: Sel): Range => ({ r1: Math.min(s.ar, s.fr), c1: Math.min(s.ac, s.fc), r2: Math.max(s.ar, s.fr), c2: Math.max(s.ac, s.fc) });
export const cellSel = (r: number, c: number): Sel => ({ ar: r, ac: c, fr: r, fc: c });

export type Layout = {
  rowTop: Float64Array;
  colLeft: Float64Array;
  totalH: number;
  totalW: number;
  rowHidden: Uint8Array;
  colHidden: Uint8Array;
  frozenH: number;
  frozenW: number;
};

export function computeLayout(tab: TabData, filterHidden: Set<number> | null): Layout {
  const rows = tab.rows;
  const cols = tab.cols;
  const rowHidden = new Uint8Array(rows);
  const colHidden = new Uint8Array(cols);
  for (const r of tab.hiddenRows) if (r < rows) rowHidden[r] = 1;
  if (filterHidden) for (const r of filterHidden) if (r < rows) rowHidden[r] = 1;
  for (const c of tab.hiddenCols) if (c < cols) colHidden[c] = 1;
  const rowTop = new Float64Array(rows + 1);
  const colLeft = new Float64Array(cols + 1);
  for (let r = 0; r < rows; r++) rowTop[r + 1] = rowTop[r] + (rowHidden[r] ? 0 : (tab.rowH[r] ?? DEFAULT_ROW_H));
  for (let c = 0; c < cols; c++) colLeft[c + 1] = colLeft[c] + (colHidden[c] ? 0 : (tab.colW[c] ?? DEFAULT_COL_W));
  return { rowTop, colLeft, totalH: rowTop[rows], totalW: colLeft[cols], rowHidden, colHidden, frozenH: rowTop[Math.min(tab.frozenRows, rows)], frozenW: colLeft[Math.min(tab.frozenCols, cols)] };
}

/** Maior índice i tal que arr[i] <= pos (limitado a [0, len-2]). */
export function indexAt(arr: Float64Array, pos: number): number {
  let lo = 0;
  let hi = arr.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function filterHiddenRows(tab: TabData, book: Book, ti: number): Set<number> | null {
  const f = tab.filter;
  if (!f) return null;
  const hidden = new Set<number>();
  const cols = Object.keys(f.rules).map(Number);
  if (!cols.length) return hidden;
  const allowed = new Map(cols.map((c) => [c, new Set(f.rules[c])]));
  for (let r = f.r1 + 1; r <= f.r2; r++) {
    for (const c of cols) {
      const cell = tab.grid[r]?.[c];
      const text = cell ? formatValue(book.get(ti, r, c), cell.fmt) : "";
      if (!allowed.get(c)!.has(text)) {
        hidden.add(r);
        break;
      }
    }
  }
  return hidden;
}

/** Próxima linha/coluna visível a partir de `from` na direção `dir`. */
export function stepVisible(hidden: Uint8Array, from: number, dir: 1 | -1, limit: number): number {
  let i = from + dir;
  while (i >= 0 && i < limit && hidden[i]) i += dir;
  return i < 0 || i >= limit ? from : i;
}

export const hasContent = (c: Cell | undefined) => !!c && (c.v !== undefined && c.v !== "" ? true : c.f !== undefined);

/** Região contígua de dados ao redor da célula (como Ctrl+A no Excel). */
export function currentRegion(g: Grid, r: number, c: number): Range {
  let r1 = r;
  let r2 = r;
  let c1 = c;
  let c2 = c;
  const rowHas = (rr: number, a: number, b: number) => {
    for (let cc = a; cc <= b; cc++) if (hasContent(g[rr]?.[cc])) return true;
    return false;
  };
  const colHas = (cc: number, a: number, b: number) => {
    for (let rr = a; rr <= b; rr++) if (hasContent(g[rr]?.[cc])) return true;
    return false;
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20000) {
    changed = false;
    if (r1 > 0 && rowHas(r1 - 1, Math.max(0, c1 - 1), c2 + 1)) {
      r1--;
      changed = true;
    }
    if (rowHas(r2 + 1, Math.max(0, c1 - 1), c2 + 1) && r2 < 100000) {
      r2++;
      changed = true;
    }
    if (c1 > 0 && colHas(c1 - 1, Math.max(0, r1 - 1), r2 + 1)) {
      c1--;
      changed = true;
    }
    if (colHas(c2 + 1, Math.max(0, r1 - 1), r2 + 1) && c2 < 700) {
      c2++;
      changed = true;
    }
  }
  return { r1, c1, r2, c2 };
}

/** Borda de dados na direção (Ctrl+seta). */
export function jumpEdge(g: Grid, r: number, c: number, dr: number, dc: number, maxR: number, maxC: number): { r: number; c: number } {
  const has = (rr: number, cc: number) => hasContent(g[rr]?.[cc]);
  let rr = r;
  let cc = c;
  const inb = (a: number, b: number) => a >= 0 && b >= 0 && a < maxR && b < maxC;
  if (!inb(rr + dr, cc + dc)) return { r, c };
  if (has(rr, cc) && has(rr + dr, cc + dc)) {
    while (inb(rr + dr, cc + dc) && has(rr + dr, cc + dc)) {
      rr += dr;
      cc += dc;
    }
    return { r: rr, c: cc };
  }
  rr += dr;
  cc += dc;
  while (inb(rr, cc) && !has(rr, cc)) {
    if (!inb(rr + dr, cc + dc)) return { r: rr, c: cc };
    rr += dr;
    cc += dc;
  }
  return { r: rr, c: cc };
}

/* ------------------------------- estilos ------------------------------- */

export function mapRange(tab: TabData, rg: Range, fn: (cell: Cell | undefined, r: number, c: number) => Cell | undefined, maxRows = 50000): Grid {
  const changes: { r: number; c: number; cell: Cell | undefined }[] = [];
  const r2 = Math.min(rg.r2, rg.r1 + maxRows - 1);
  for (let r = rg.r1; r <= r2; r++) for (let c = rg.c1; c <= rg.c2; c++) changes.push({ r, c, cell: fn(tab.grid[r]?.[c], r, c) });
  return applyCells(tab.grid, changes);
}

export function withStyle(cell: Cell | undefined, patch: Partial<CellStyle> | ((s: CellStyle) => CellStyle)): Cell {
  const s = typeof patch === "function" ? patch({ ...(cell?.s ?? {}) }) : { ...(cell?.s ?? {}), ...patch };
  for (const k of Object.keys(s) as (keyof CellStyle)[]) if (s[k] === undefined || s[k] === null || s[k] === 0) delete s[k];
  return { ...(cell ?? {}), s: Object.keys(s).length ? s : undefined };
}

/** Texto legível sobre um fundo: preto em fundos claros, branco em escuros. */
export function readableOn(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}

export const PALETTE = [
  ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"],
  ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"],
  ["#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc"],
  ["#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
  ["#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"],
  ["#193f32", "#b75928", "#537179", "#776157", "#002934", "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f"],
];

/** Estatísticas da seleção (barra de status). */
export function selectionStats(tab: TabData, book: Book, ti: number, rg: Range, cap = 200000) {
  let sum = 0;
  let nums = 0;
  let count = 0;
  let seen = 0;
  const g = tab.grid;
  for (const rk in g) {
    const r = Number(rk);
    if (r < rg.r1 || r > rg.r2) continue;
    for (const ck in g[rk]) {
      const c = Number(ck);
      if (c < rg.c1 || c > rg.c2) continue;
      if (++seen > cap) return { sum, nums, count, partial: true };
      const v = book.get(ti, r, c);
      if (v === null || v === "") continue;
      count++;
      if (typeof v === "number") {
        sum += v;
        nums++;
      }
    }
  }
  return { sum, nums, count, partial: false };
}
