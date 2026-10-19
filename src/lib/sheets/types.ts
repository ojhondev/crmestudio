/**
 * Modelo de dados das planilhas (sem dependências de servidor: roda no navegador e no servidor).
 * A grade é esparsa: só existem as células que têm algo. Linhas e colunas são índices base 0.
 */

export type CellStyle = {
  b?: 1; // negrito
  i?: 1; // itálico
  u?: 1; // sublinhado
  st?: 1; // tachado
  c?: string; // cor do texto (#rrggbb)
  bg?: string; // cor de preenchimento
  al?: "l" | "c" | "r"; // alinhamento horizontal
  va?: "t" | "m" | "b"; // alinhamento vertical
  wrap?: 1; // quebra de texto
  fs?: number; // tamanho da fonte (pt)
  bt?: string; // borda superior (cor)
  br?: string;
  bb?: string;
  bl?: string;
};

export type CellValue = string | number | boolean;

export type Cell = {
  /** valor digitado ou, em fórmulas, o último resultado calculado */
  v?: CellValue;
  /** fórmula canônica (en-US, vírgula como separador), sem o "=" inicial */
  f?: string;
  /** formato numérico: "n:2" "brl:2" "pct:1" "date" "datetime" "text" "x:<padrão>" */
  fmt?: string;
  s?: CellStyle;
};

export type Grid = Record<number, Record<number, Cell>>;

export type Merge = { r1: number; c1: number; r2: number; c2: number };

export type FilterState = {
  /** linha do cabeçalho do filtro e colunas cobertas */
  r1: number;
  c1: number;
  c2: number;
  /** última linha de dados */
  r2: number;
  /** por coluna: valores (texto exibido) PERMITIDOS; ausente = todos */
  rules: Record<number, string[]>;
};

export type TabData = {
  id: string;
  name: string;
  grid: Grid;
  rows: number;
  cols: number;
  colW: Record<number, number>;
  rowH: Record<number, number>;
  frozenRows: number;
  frozenCols: number;
  merges: Merge[];
  hiddenRows: number[];
  hiddenCols: number[];
  filter: FilterState | null;
  showGrid: boolean;
};

export const DEFAULT_COL_W = 100;
export const DEFAULT_ROW_H = 24;
export const MAX_ROWS = 100_000;
export const MAX_COLS = 702;
export const MAX_CELLS = 400_000;

export const emptyTab = (id: string, name: string, rows = 1000, cols = 26): TabData => ({
  id,
  name,
  grid: {},
  rows,
  cols,
  colW: {},
  rowH: {},
  frozenRows: 0,
  frozenCols: 0,
  merges: [],
  hiddenRows: [],
  hiddenCols: [],
  filter: null,
  showGrid: true,
});

/* ----------------------------- endereços A1 ----------------------------- */

export function colName(c: number): string {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const addr = (r: number, c: number) => `${colName(c)}${r + 1}`;

export function parseAddr(a: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(a.trim());
  if (!m) return null;
  return { c: colIndex(m[1]), r: Number(m[2]) - 1 };
}

/* ------------------------------ acesso à grade ------------------------------ */

export const getCell = (g: Grid, r: number, c: number): Cell | undefined => g[r]?.[c];

export function usedRange(g: Grid): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const rk in g) {
    const row = g[rk];
    let any = false;
    for (const ck in row) {
      const cell = row[ck];
      if (cell.v === undefined && cell.f === undefined && !cell.s && !cell.fmt) continue;
      any = true;
      if (Number(ck) + 1 > cols) cols = Number(ck) + 1;
    }
    if (any && Number(rk) + 1 > rows) rows = Number(rk) + 1;
  }
  return { rows, cols };
}

export function countCells(g: Grid): number {
  let n = 0;
  for (const rk in g) n += Object.keys(g[rk]).length;
  return n;
}

/** Remove chaves vazias para guardar menos. */
export function pruneCell(cell: Cell | undefined): Cell | undefined {
  if (!cell) return undefined;
  const out: Cell = {};
  if (cell.v !== undefined && cell.v !== "") out.v = cell.v;
  if (cell.f) out.f = cell.f;
  if (cell.fmt) out.fmt = cell.fmt;
  if (cell.s && Object.keys(cell.s).length) out.s = cell.s;
  return Object.keys(out).length ? out : undefined;
}

/** Aplica alterações {r,c,cell|null} devolvendo nova grade (copia só as linhas tocadas). */
export function applyCells(g: Grid, changes: { r: number; c: number; cell: Cell | undefined }[]): Grid {
  const next: Grid = { ...g };
  const copied = new Set<number>();
  for (const { r, c, cell } of changes) {
    if (!copied.has(r)) {
      next[r] = { ...(g[r] ?? {}) };
      copied.add(r);
    }
    const p = pruneCell(cell);
    if (p) next[r][c] = p;
    else delete next[r][c];
  }
  for (const r of copied) if (!Object.keys(next[r]).length) delete next[r];
  return next;
}

export const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const normRange = (a: { r: number; c: number }, b: { r: number; c: number }) => ({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });
