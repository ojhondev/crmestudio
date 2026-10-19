/**
 * Operações puras sobre as abas: inserir/excluir linhas e colunas (reescrevendo as fórmulas),
 * ordenar, preencher em série, copiar/colar (TSV). Sem dependências de servidor.
 */
import { adjustFormula, canonicalFormula, offsetFormula, renameSheetInFormula, type V } from "./formula";
import { FErr, parseTyped } from "./format";
import { applyCells, MAX_COLS, MAX_ROWS, type Cell, type CellValue, type Grid, type Merge, type TabData } from "./types";

/* =========================== estrutura: inserir / excluir =========================== */

function shiftIdx(v: number, at: number, delta: number): number | null {
  if (delta > 0) return v >= at ? v + delta : v;
  const n = -delta;
  if (v >= at && v < at + n) return null;
  return v >= at + n ? v - n : v;
}

function shiftEnds(v1: number, v2: number, at: number, delta: number): [number, number] | null {
  if (delta > 0) return [v1 >= at ? v1 + delta : v1, v2 >= at ? v2 + delta : v2];
  const n = -delta;
  const a = v1 >= at + n ? v1 - n : v1 >= at ? at : v1;
  const b = v2 >= at + n ? v2 - n : v2 >= at ? at - 1 : v2;
  return b < a ? null : [a, b];
}

function mapKeys<T>(rec: Record<number, T>, at: number, delta: number): Record<number, T> {
  const out: Record<number, T> = {};
  for (const k in rec) {
    const nk = shiftIdx(Number(k), at, delta);
    if (nk !== null) out[nk] = rec[k];
  }
  return out;
}

/** Inserir (delta>0) ou excluir (delta<0) linhas/colunas da aba `ti`; reescreve fórmulas de todas as abas. */
export function shiftStructure(tabs: TabData[], ti: number, axis: "row" | "col", at: number, delta: number): TabData[] {
  const target = tabs[ti];
  const out = tabs.map((t, i) => {
    // fórmulas desta aba (qualquer aba pode apontar para a aba alterada)
    const grid: Grid = {};
    for (const rk in t.grid) {
      const row = t.grid[rk];
      const nr: Record<number, Cell> = {};
      for (const ck in row) {
        const cell = row[ck];
        nr[ck as unknown as number] = cell.f !== undefined ? { ...cell, f: adjustFormula(cell.f, t.name, target.name, axis, at, delta) } : cell;
      }
      grid[rk as unknown as number] = nr;
    }
    if (i !== ti) return { ...t, grid };
    return { ...t, grid: moveGrid(grid, axis, at, delta) };
  });
  const t = out[ti];
  const limit = axis === "row" ? MAX_ROWS : MAX_COLS;
  const total = (axis === "row" ? t.rows : t.cols) + delta;
  const merges: Merge[] = [];
  for (const m of t.merges) {
    const e = axis === "row" ? shiftEnds(m.r1, m.r2, at, delta) : shiftEnds(m.c1, m.c2, at, delta);
    if (!e) continue;
    merges.push(axis === "row" ? { ...m, r1: e[0], r2: e[1] } : { ...m, c1: e[0], c2: e[1] });
  }
  const next: TabData = { ...t, merges: merges.filter((m) => m.r1 !== m.r2 || m.c1 !== m.c2) };
  if (axis === "row") {
    next.rows = Math.min(limit, Math.max(1, total));
    next.rowH = mapKeys(t.rowH, at, delta);
    next.hiddenRows = t.hiddenRows.map((r) => shiftIdx(r, at, delta)).filter((x): x is number => x !== null);
    if (delta > 0 && at < t.frozenRows) next.frozenRows = t.frozenRows + delta;
    else if (delta < 0 && at < t.frozenRows) next.frozenRows = Math.max(0, t.frozenRows + Math.max(delta, -(t.frozenRows - at)));
    if (t.filter) {
      const e = shiftEnds(t.filter.r1, t.filter.r2, at, delta);
      next.filter = e ? { ...t.filter, r1: e[0], r2: e[1] } : null;
    }
  } else {
    next.cols = Math.min(limit, Math.max(1, total));
    next.colW = mapKeys(t.colW, at, delta);
    next.hiddenCols = t.hiddenCols.map((c) => shiftIdx(c, at, delta)).filter((x): x is number => x !== null);
    if (delta > 0 && at < t.frozenCols) next.frozenCols = t.frozenCols + delta;
    else if (delta < 0 && at < t.frozenCols) next.frozenCols = Math.max(0, t.frozenCols + Math.max(delta, -(t.frozenCols - at)));
    if (t.filter) {
      const e = shiftEnds(t.filter.c1, t.filter.c2, at, delta);
      next.filter = e ? { ...t.filter, c1: e[0], c2: e[1], rules: {} } : null;
    }
  }
  out[ti] = next;
  return out;
}

function moveGrid(g: Grid, axis: "row" | "col", at: number, delta: number): Grid {
  const out: Grid = {};
  if (axis === "row") {
    for (const rk in g) {
      const nk = shiftIdx(Number(rk), at, delta);
      if (nk !== null) out[nk] = g[rk];
    }
    return out;
  }
  for (const rk in g) {
    const row: Record<number, Cell> = {};
    for (const ck in g[rk]) {
      const nk = shiftIdx(Number(ck), at, delta);
      if (nk !== null) row[nk] = g[rk][ck];
    }
    if (Object.keys(row).length) out[rk as unknown as number] = row;
  }
  return out;
}

export function renameTab(tabs: TabData[], ti: number, name: string): TabData[] {
  const from = tabs[ti].name;
  if (from === name) return tabs;
  return tabs.map((t, i) => {
    const grid: Grid = {};
    for (const rk in t.grid) {
      const row: Record<number, Cell> = {};
      for (const ck in t.grid[rk]) {
        const c = t.grid[rk][ck];
        row[ck as unknown as number] = c.f !== undefined ? { ...c, f: renameSheetInFormula(c.f, from, name) } : c;
      }
      grid[rk as unknown as number] = row;
    }
    return { ...t, grid, name: i === ti ? name : t.name };
  });
}

export function uniqueTabName(tabs: { name: string }[], base: string): string {
  const names = new Set(tabs.map((t) => t.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const n = `${base} ${i}`;
    if (!names.has(n.toLowerCase())) return n;
  }
}

export const cloneGrid = (g: Grid): Grid => JSON.parse(JSON.stringify(g)) as Grid;

/* =========================== ordenar =========================== */

export function sortRange(
  tab: TabData,
  range: { r1: number; c1: number; r2: number; c2: number },
  keyCol: number,
  asc: boolean,
  valueOf: (r: number, c: number) => V,
): Grid {
  const { r1, c1, r2, c2 } = range;
  const rows: { r: number; cells: Record<number, Cell | undefined>; key: V }[] = [];
  for (let r = r1; r <= r2; r++) {
    const cells: Record<number, Cell | undefined> = {};
    for (let c = c1; c <= c2; c++) cells[c] = tab.grid[r]?.[c];
    rows.push({ r, cells, key: valueOf(r, keyCol) });
  }
  const rank = (v: V) => (v === null || v === "" ? 4 : v instanceof FErr ? 3 : typeof v === "number" ? 0 : typeof v === "boolean" ? 2 : 1);
  const sorted = [...rows].sort((a, b) => {
    const ra = rank(a.key);
    const rb = rank(b.key);
    if (ra === 4 || rb === 4) return ra === rb ? a.r - b.r : ra === 4 ? 1 : -1; // vazios sempre no fim
    if (ra !== rb) return asc ? ra - rb : rb - ra;
    let c = 0;
    if (ra === 0) c = (a.key as number) - (b.key as number);
    else if (ra === 1) c = String(a.key).localeCompare(String(b.key), "pt-BR", { sensitivity: "base", numeric: true });
    else c = String(a.key).localeCompare(String(b.key));
    return (asc ? c : -c) || a.r - b.r;
  });
  const changes: { r: number; c: number; cell: Cell | undefined }[] = [];
  sorted.forEach((row, i) => {
    const target = r1 + i;
    for (let c = c1; c <= c2; c++) {
      const cell = row.cells[c];
      changes.push({ r: target, c, cell: cell && cell.f !== undefined ? { ...cell, f: offsetFormula(cell.f, target - row.r, 0) } : cell });
    }
  });
  return applyCells(tab.grid, changes);
}

/* =========================== preencher em série =========================== */

const TRAIL_NUM = /^(.*?)(\d+)$/;

/** Gera `count` células a partir de `src` (na direção do preenchimento). dir: +1 para frente, -1 para trás. */
export function fillLine(src: (Cell | undefined)[], count: number, dir: 1 | -1, axis: "row" | "col"): (Cell | undefined)[] {
  const k = src.length;
  const out: (Cell | undefined)[] = [];
  const ordered = dir === 1 ? src : [...src].reverse();
  const nums = ordered.map((c) => (c && c.f === undefined && typeof c.v === "number" ? c.v : null));
  const allNum = k >= 2 && nums.every((n) => n !== null);
  let step = 0;
  if (allNum) {
    // regressão linear simples (como o Google Sheets) sobre os pontos da origem, em ordem de preenchimento
    const xs = nums.map((_, i) => i);
    const mx = (k - 1) / 2;
    const my = (nums as number[]).reduce((a, b) => a + b, 0) / k;
    let sxy = 0;
    let sxx = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * ((nums[i] as number) - my);
      sxx += (x - mx) * (x - mx);
    });
    step = sxx ? sxy / sxx : 0;
  }
  const texts = ordered.map((c) => (c && c.f === undefined && typeof c.v === "string" ? TRAIL_NUM.exec(c.v) : null));
  const allTextNum = k >= 1 && texts.every((m) => m !== null) && texts.every((m) => m![1] === texts[0]![1]);
  let tstep = 1;
  if (allTextNum && k >= 2) tstep = Number(texts[1]![2]) - Number(texts[0]![2]);
  for (let i = 1; i <= count; i++) {
    // posição em relação à origem, no sentido do preenchimento
    const base = ordered[(i - 1) % k];
    const j = (i - 1) % k;
    const delta = dir === 1 ? k + i - 1 - j : -i - (k - 1 - j);
    if (!base) {
      out.push(undefined);
      continue;
    }
    if (allNum) {
      const v = (nums[k - 1] as number) + step * i;
      out.push({ ...base, v: Math.round(v * 1e10) / 1e10 });
    } else if (allTextNum) {
      const last = texts[k - 1]!;
      const num = Number(last[2]) + tstep * i;
      const width = last[2].length;
      out.push({ ...base, v: last[1] + (last[2].startsWith("0") ? String(num).padStart(width, "0") : String(num)) });
    } else if (base.f !== undefined) {
      out.push({ ...base, f: axis === "row" ? offsetFormula(base.f, delta, 0) : offsetFormula(base.f, 0, delta) });
    } else {
      out.push(base);
    }
  }
  return out;
}

/* =========================== área de transferência =========================== */

export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"' && cur === "") q = true;
    else if (ch === "\t") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export function toTSV(rows: string[][]): string {
  return rows.map((r) => r.map((s) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join("\t")).join("\n");
}

/** Texto digitado → célula (mantém formato/estilo antigos quando fizer sentido). */
export function cellFromTyped(raw: string, old?: Cell): Cell | undefined {
  const p = parseTyped(raw);
  const base: Cell = {};
  if (old?.s) base.s = old.s;
  if (old?.fmt && old.fmt !== "text") base.fmt = old.fmt;
  if (p.formula !== undefined) {
    base.f = canonicalFormula(p.formula) ?? p.formula;
    return base;
  }
  if (p.v === undefined) return base.s || base.fmt ? base : undefined;
  if (old?.fmt === "text") return { ...base, fmt: "text", v: raw };
  base.v = p.v as CellValue;
  if (p.fmt) base.fmt = p.fmt;
  else if (typeof p.v !== "number" && base.fmt) delete base.fmt;
  return base;
}
