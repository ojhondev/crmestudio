/**
 * Valida o que chega do navegador: nunca confiamos no formato da grade.
 */
import { DEFAULT_COL_W, MAX_CELLS, MAX_COLS, MAX_ROWS, emptyTab, type Cell, type CellStyle, type FilterState, type Grid, type Merge, type TabData } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number, def = lo) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : def);

function cleanStyle(raw: unknown): CellStyle | undefined {
  if (!isObj(raw)) return undefined;
  const s: CellStyle = {};
  if (raw.b) s.b = 1;
  if (raw.i) s.i = 1;
  if (raw.u) s.u = 1;
  if (raw.st) s.st = 1;
  if (raw.wrap) s.wrap = 1;
  for (const k of ["c", "bg", "bt", "br", "bb", "bl"] as const) if (typeof raw[k] === "string" && HEX.test(raw[k] as string)) s[k] = (raw[k] as string).toLowerCase();
  if (raw.al === "l" || raw.al === "c" || raw.al === "r") s.al = raw.al;
  if (raw.va === "t" || raw.va === "m" || raw.va === "b") s.va = raw.va;
  if (typeof raw.fs === "number" && raw.fs >= 6 && raw.fs <= 72) s.fs = Math.round(raw.fs);
  return Object.keys(s).length ? s : undefined;
}

function cleanCell(raw: unknown): Cell | undefined {
  if (!isObj(raw)) return undefined;
  const c: Cell = {};
  if (typeof raw.v === "number" && Number.isFinite(raw.v)) c.v = raw.v;
  else if (typeof raw.v === "string") c.v = raw.v.slice(0, 32_000);
  else if (typeof raw.v === "boolean") c.v = raw.v;
  if (typeof raw.f === "string" && raw.f.length <= 8000) c.f = raw.f;
  if (typeof raw.fmt === "string" && raw.fmt.length <= 200 && /^[a-z]+(:.*)?$/.test(raw.fmt)) c.fmt = raw.fmt;
  const s = cleanStyle(raw.s);
  if (s) c.s = s;
  return Object.keys(c).length ? c : undefined;
}

function cleanNumMap(raw: unknown, lo: number, hi: number, maxKeys = 5000): Record<number, number> {
  const out: Record<number, number> = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const k of Object.keys(raw)) {
    const i = Number(k);
    const v = raw[k];
    if (!Number.isInteger(i) || i < 0 || typeof v !== "number" || !Number.isFinite(v)) continue;
    out[i] = Math.max(lo, Math.min(hi, Math.round(v)));
    if (++n >= maxKeys) break;
  }
  return out;
}

export function sanitizeTab(raw: unknown, idFallback = "t"): TabData {
  if (!isObj(raw)) throw new Error("Aba inválida.");
  const name = (typeof raw.name === "string" ? raw.name : "Aba").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 60) || "Aba";
  const tab = emptyTab(typeof raw.id === "string" ? raw.id.slice(0, 40) : idFallback, name);
  tab.rows = int(raw.rows, 1, MAX_ROWS, 1000);
  tab.cols = int(raw.cols, 1, MAX_COLS, 26);
  const grid: Grid = {};
  let cells = 0;
  if (isObj(raw.grid)) {
    for (const rk of Object.keys(raw.grid)) {
      const r = Number(rk);
      const row: unknown = (raw.grid as Record<string, unknown>)[rk];
      if (!Number.isInteger(r) || r < 0 || r >= MAX_ROWS || !isObj(row)) continue;
      for (const ck of Object.keys(row as Record<string, unknown>)) {
        const c = Number(ck);
        if (!Number.isInteger(c) || c < 0 || c >= MAX_COLS) continue;
        const cell = cleanCell((row as Record<string, unknown>)[ck]);
        if (!cell) continue;
        if (++cells > MAX_CELLS) throw new Error("Planilha grande demais (mais de 400 mil células).");
        (grid[r] ??= {})[c] = cell;
        if (r + 1 > tab.rows) tab.rows = Math.min(MAX_ROWS, r + 1);
        if (c + 1 > tab.cols) tab.cols = Math.min(MAX_COLS, c + 1);
      }
    }
  }
  tab.grid = grid;
  tab.colW = cleanNumMap(raw.colW, 8, 1200);
  tab.rowH = cleanNumMap(raw.rowH, 8, 1200);
  tab.frozenRows = int(raw.frozenRows, 0, 50, 0);
  tab.frozenCols = int(raw.frozenCols, 0, 20, 0);
  tab.showGrid = raw.showGrid !== false;
  tab.merges = (Array.isArray(raw.merges) ? raw.merges : [])
    .slice(0, 5000)
    .map((m): Merge | null => {
      if (!isObj(m)) return null;
      const mm = { r1: int(m.r1, 0, MAX_ROWS), c1: int(m.c1, 0, MAX_COLS), r2: int(m.r2, 0, MAX_ROWS), c2: int(m.c2, 0, MAX_COLS) };
      return mm.r2 >= mm.r1 && mm.c2 >= mm.c1 && (mm.r1 !== mm.r2 || mm.c1 !== mm.c2) ? mm : null;
    })
    .filter((m): m is Merge => m !== null);
  const ints = (a: unknown, hi: number) => (Array.isArray(a) ? a.slice(0, 20000).filter((x): x is number => Number.isInteger(x) && x >= 0 && x < hi) : []);
  tab.hiddenRows = ints(raw.hiddenRows, MAX_ROWS);
  tab.hiddenCols = ints(raw.hiddenCols, MAX_COLS);
  if (isObj(raw.filter)) {
    const f = raw.filter;
    const rules: Record<number, string[]> = {};
    if (isObj(f.rules)) {
      for (const k of Object.keys(f.rules)) {
        const arr = (f.rules as Record<string, unknown>)[k];
        if (Number.isInteger(Number(k)) && Array.isArray(arr)) rules[Number(k)] = arr.filter((x): x is string => typeof x === "string").slice(0, 5000);
      }
    }
    const flt: FilterState = { r1: int(f.r1, 0, MAX_ROWS), c1: int(f.c1, 0, MAX_COLS), c2: int(f.c2, 0, MAX_COLS), r2: int(f.r2, 0, MAX_ROWS), rules };
    tab.filter = flt.r2 > flt.r1 && flt.c2 >= flt.c1 ? flt : null;
  }
  void DEFAULT_COL_W;
  return tab;
}

export type TabLayout = Omit<TabData, "id" | "name" | "grid">;

export function splitTab(t: TabData): { grid: Grid; layout: TabLayout } {
  const { id: _id, name: _name, grid, ...layout } = t;
  void _id;
  void _name;
  return { grid, layout };
}

export function joinTab(row: { id: string; name: string; grid: unknown; layout: unknown }): TabData {
  const layout = (isObj(row.layout) ? row.layout : {}) as Record<string, unknown>;
  return sanitizeTab({ ...layout, id: row.id, name: row.name, grid: row.grid }, row.id);
}
