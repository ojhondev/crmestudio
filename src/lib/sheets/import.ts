/**
 * Importação de arquivos para o modelo de planilha: .xlsx (exceljs), .xls, .ods, .csv, .tsv, .txt.
 * Roda no servidor (rota de importação) e nos testes.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { canonicalFormula } from "./formula";
import { excelToFmt, formatValue, parseTyped, serialFromUTCDate } from "./format";
import { readOds } from "./read-ods";
import { readXls } from "./read-xls";
import { assertZipSafe } from "./zip-guard";
import { MAX_CELLS, MAX_COLS, MAX_ROWS, addr, emptyTab, type Cell, type CellStyle, type CellValue, type TabData } from "./types";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const IMPORT_EXTS = [".xlsx", ".xlsm", ".xls", ".ods", ".csv", ".tsv", ".txt"];

export type ImportResult = { name: string; tabs: TabData[]; warnings: string[] };

const extOf = (n: string) => (/\.[^.]+$/.exec(n.toLowerCase())?.[0] ?? "");
const baseName = (n: string) => n.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim() || "Planilha importada";

export async function importFile(buf: Uint8Array, filename: string): Promise<ImportResult> {
  if (buf.length > MAX_IMPORT_BYTES) throw new Error("Arquivo maior que 15 MB.");
  const ext = extOf(filename);
  const name = baseName(filename);
  let tabs: TabData[];
  let warnings: string[] = [];
  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
    tabs = [importDelimited(buf, name, ext === ".tsv")];
  } else if (ext === ".xlsx" || ext === ".xlsm") {
    ({ tabs, warnings } = await importXlsx(buf));
  } else if (ext === ".xls") {
    // alguns .xls são, na verdade, .xlsx renomeado (começam com "PK")
    if (buf[0] === 0x50 && buf[1] === 0x4b) ({ tabs, warnings } = await importXlsx(buf));
    else ({ tabs, warnings } = readXls(buf));
  } else if (ext === ".ods") {
    ({ tabs, warnings } = await readOds(buf));
  } else {
    throw new Error("Formato não suportado. Use .xlsx, .xls, .ods, .csv ou .tsv.");
  }
  if (!tabs.length) throw new Error("O arquivo não tem nenhuma aba com dados.");
  tabs = tabs.map((t, i) => ({ ...t, id: `imp${i}`, name: cleanTabName(t.name, i) }));
  const seen = new Set<string>();
  for (const t of tabs) {
    let n = t.name;
    for (let k = 2; seen.has(n.toLowerCase()); k++) n = `${t.name} ${k}`;
    t.name = n;
    seen.add(n.toLowerCase());
  }
  return { name, tabs, warnings };
}

const cleanTabName = (n: string, i: number) => (n || `Aba ${i + 1}`).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 60) || `Aba ${i + 1}`;

/* ----------------------------- CSV / TSV ----------------------------- */

export function decodeText(buf: Uint8Array): string {
  let start = 0;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(start));
  } catch {
    return new TextDecoder("windows-1252").decode(buf.subarray(start)); // Excel BR antigo
  }
}

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const cands = [";", "\t", ",", "|"];
  let best = ";";
  let bestN = -1;
  for (const d of cands) {
    const n = (sample.match(new RegExp(d === "|" ? "\\|" : d === "\t" ? "\\t" : d, "g")) ?? []).length;
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

export function importDelimited(buf: Uint8Array, name: string, tsv = false): TabData {
  const text = decodeText(buf);
  const delimiter = tsv ? "\t" : detectDelimiter(text);
  const parsed = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false });
  const rows = parsed.data;
  while (rows.length && rows[rows.length - 1].every((x) => x === "")) rows.pop();
  const tab = emptyTab("imp0", name.slice(0, 60) || "Planilha");
  let maxC = 0;
  let n = 0;
  for (let r = 0; r < Math.min(rows.length, MAX_ROWS); r++) {
    const row = rows[r];
    for (let c = 0; c < Math.min(row.length, MAX_COLS); c++) {
      const raw = row[c];
      if (raw === undefined || raw === "") continue;
      if (n >= MAX_CELLS) break;
      const keepText = /^0\d+$/.test(raw.trim()) || /^[=+@-]/.test(raw.trim()) && !/^[+-]?[\d.,]+%?$/.test(raw.trim());
      const p = keepText ? { v: raw } : parseTyped(raw);
      const cell: Cell = {};
      if (p.v !== undefined) cell.v = p.v;
      if (p.fmt) cell.fmt = p.fmt;
      if (cell.v === undefined) continue;
      (tab.grid[r] ??= {})[c] = cell;
      n++;
      if (c + 1 > maxC) maxC = c + 1;
    }
  }
  tab.rows = Math.max(1000, rows.length + 100);
  tab.cols = Math.max(26, maxC + 2);
  return tab;
}

/* ----------------------------- XLSX ----------------------------- */

const THEME = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"];
const INDEXED_BASIC: Record<number, string> = { 0: "000000", 1: "FFFFFF", 2: "FF0000", 3: "00FF00", 4: "0000FF", 5: "FFFF00", 6: "FF00FF", 7: "00FFFF", 8: "000000", 9: "FFFFFF", 10: "FF0000", 11: "00FF00", 12: "0000FF", 13: "FFFF00", 14: "FF00FF", 15: "00FFFF", 64: "000000" };

function tint(hex: string, t: number) {
  const ch = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = ch.map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
  return out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

type XColor = { argb?: string; theme?: number; tint?: number; indexed?: number };
function colorOf(c: XColor | undefined): string | undefined {
  if (!c) return undefined;
  if (c.argb) {
    const h = c.argb.length === 8 ? c.argb.slice(2) : c.argb;
    return /^[0-9a-f]{6}$/i.test(h) ? "#" + h.toLowerCase() : undefined;
  }
  if (c.theme !== undefined) {
    const base = THEME[c.theme];
    if (!base) return undefined;
    return "#" + (c.tint ? tint(base, c.tint) : base).toLowerCase();
  }
  if (c.indexed !== undefined && INDEXED_BASIC[c.indexed]) return "#" + INDEXED_BASIC[c.indexed].toLowerCase();
  return undefined;
}

function styleOf(cell: ExcelJS.Cell): CellStyle | undefined {
  const s: CellStyle = {};
  const f = cell.font;
  if (f) {
    if (f.bold) s.b = 1;
    if (f.italic) s.i = 1;
    if (f.underline) s.u = 1;
    if (f.strike) s.st = 1;
    const c = colorOf(f.color as XColor | undefined);
    if (c && c !== "#000000") s.c = c;
    if (f.size && f.size !== 10 && f.size !== 11) s.fs = Math.round(f.size);
  }
  const fill = cell.fill;
  if (fill && fill.type === "pattern" && fill.pattern === "solid") {
    const c = colorOf(fill.fgColor as XColor | undefined);
    if (c && c !== "#ffffff") s.bg = c;
  }
  const al = cell.alignment;
  if (al) {
    if (al.horizontal === "center" || al.horizontal === "centerContinuous") s.al = "c";
    else if (al.horizontal === "right") s.al = "r";
    else if (al.horizontal === "left") s.al = "l";
    if (al.vertical === "middle") s.va = "m";
    else if (al.vertical === "top") s.va = "t";
    if (al.wrapText) s.wrap = 1;
  }
  const b = cell.border;
  if (b) {
    const col = (x?: Partial<ExcelJS.Border>) => (x?.style ? (colorOf(x.color as XColor | undefined) ?? "#000000") : undefined);
    const t = col(b.top);
    const r = col(b.right);
    const bo = col(b.bottom);
    const l = col(b.left);
    if (t) s.bt = t;
    if (r) s.br = r;
    if (bo) s.bb = bo;
    if (l) s.bl = l;
  }
  return Object.keys(s).length ? s : undefined;
}

function plainValue(v: ExcelJS.CellValue): CellValue | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Date) return serialFromUTCDate(v);
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((x) => x.text).join("");
    if ("error" in o) return String(o.error);
    if ("hyperlink" in o && "text" in o) return typeof o.text === "object" ? ((o.text as { richText?: { text: string }[] }).richText ?? []).map((x) => x.text).join("") : String(o.text);
  }
  return undefined;
}

export async function importXlsx(buf: Uint8Array): Promise<{ tabs: TabData[]; warnings: string[] }> {
  await assertZipSafe(buf);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error("Não consegui abrir o arquivo. Ele pode estar corrompido ou protegido por senha.");
  }
  const warnings: string[] = [];
  const tabs: TabData[] = [];
  let total = 0;
  wb.eachSheet((ws, idx) => {
    const tab = emptyTab(`imp${idx}`, ws.name);
    let maxR = 0;
    let maxC = 0;
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (rn > MAX_ROWS) return;
      if (row.hidden) tab.hiddenRows.push(rn - 1);
      if (row.height) tab.rowH[rn - 1] = Math.round((row.height * 4) / 3);
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        if (cn > MAX_COLS || total >= MAX_CELLS) return;
        const out: Cell = {};
        const val = cell.value as ExcelJS.CellValue;
        const isFormula = cell.type === ExcelJS.ValueType.Formula;
        if (isFormula) {
          const raw = (cell as unknown as { formula?: string }).formula;
          if (raw) {
            out.f = canonicalFormula(raw) ?? raw;
            const res = (val as { result?: ExcelJS.CellValue }).result;
            const pv = plainValue(res ?? null);
            if (pv !== undefined) out.v = pv;
          } else {
            const pv = plainValue((val as { result?: ExcelJS.CellValue }).result ?? null);
            if (pv !== undefined) out.v = pv;
          }
        } else {
          const pv = plainValue(val);
          if (pv !== undefined) out.v = pv;
        }
        let fmt = excelToFmt(cell.numFmt);
        if (!fmt && val instanceof Date) fmt = "date";
        if (fmt) out.fmt = fmt;
        const st = styleOf(cell);
        if (st) out.s = st;
        if (out.v === undefined && out.f === undefined && !out.s && !out.fmt) return;
        (tab.grid[rn - 1] ??= {})[cn - 1] = out;
        total++;
        if (rn > maxR) maxR = rn;
        if (cn > maxC) maxC = cn;
      });
    });
    ws.columns?.forEach((col, i) => {
      if (!col) return;
      if (col.hidden) tab.hiddenCols.push(i);
      else if (col.width) tab.colW[i] = Math.round(col.width * 7 + 5);
    });
    const merges = (ws.model as unknown as { merges?: string[] }).merges ?? [];
    for (const m of merges) {
      const [a, b] = m.split(":");
      const ca = ws.getCell(a);
      const cb = ws.getCell(b ?? a);
      const m1 = { r1: Number(ca.row) - 1, c1: Number(ca.col) - 1, r2: Number(cb.row) - 1, c2: Number(cb.col) - 1 };
      if (m1.r2 > m1.r1 || m1.c2 > m1.c1) tab.merges.push(m1);
    }
    const view = ws.views?.[0];
    if (view && view.state === "frozen") {
      tab.frozenRows = Math.min(view.ySplit ?? 0, 50);
      tab.frozenCols = Math.min(view.xSplit ?? 0, 20);
    }
    if (ws.properties?.defaultColWidth && !Object.keys(tab.colW).length) {
      /* largura padrão do arquivo é ignorada: usamos a nossa */
    }
    if (ws.state && ws.state !== "visible") warnings.push(`A aba “${ws.name}” estava oculta no arquivo original.`);
    const cf = (ws as unknown as { conditionalFormattings?: unknown[] }).conditionalFormattings;
    if (cf && cf.length) warnings.push(`A aba “${ws.name}” tem formatação condicional, que não é suportada (as cores fixas foram mantidas).`);
    if (ws.getImages().length) warnings.push(`A aba “${ws.name}” tem imagens/gráficos, que não são importados.`);
    tab.rows = Math.max(1000, maxR + 100);
    tab.cols = Math.max(26, maxC + 2);
    tabs.push(tab);
  });
  if (total >= MAX_CELLS) warnings.push(`Arquivo muito grande: foram lidas só as primeiras ${MAX_CELLS.toLocaleString("pt-BR")} células.`);
  void addr;
  return { tabs, warnings };
}

/* ----------------------------- prévia ----------------------------- */

export type ImportPreview = {
  name: string;
  warnings: string[];
  tabs: { name: string; rows: number; cols: number; cells: number; formulas: number; merges: number; sample: string[][] }[];
};

export function previewOf(r: ImportResult): ImportPreview {
  return {
    name: r.name,
    warnings: r.warnings,
    tabs: r.tabs.map((t) => {
      let cells = 0;
      let formulas = 0;
      let maxR = 0;
      let maxC = 0;
      for (const rk in t.grid) {
        for (const ck in t.grid[rk]) {
          const c = t.grid[rk][ck];
          if (c.v === undefined && c.f === undefined) continue;
          cells++;
          if (c.f !== undefined) formulas++;
          if (Number(rk) + 1 > maxR) maxR = Number(rk) + 1;
          if (Number(ck) + 1 > maxC) maxC = Number(ck) + 1;
        }
      }
      const sample: string[][] = [];
      for (let r = 0; r < Math.min(maxR, 8); r++) {
        const row: string[] = [];
        for (let c = 0; c < Math.min(maxC, 8); c++) {
          const cell = t.grid[r]?.[c];
          row.push(cell ? (cell.v !== undefined ? formatValue(cell.v, cell.fmt) : cell.f ? "=" + cell.f : "") : "");
        }
        sample.push(row);
      }
      return { name: t.name, rows: maxR, cols: maxC, cells, formulas, merges: t.merges.length, sample };
    }),
  };
}
