/**
 * Exportação: .xlsx (formatos, estilos, fórmulas, mesclagens, larguras, congelamento) e .csv/.tsv.
 */
import ExcelJS from "exceljs";
import { Book } from "./formula";
import { FErr, fmtToExcel, numToText, parseFmt, utcDateFromSerial, ymdFromSerial } from "./format";
import { DEFAULT_COL_W, DEFAULT_ROW_H, type Cell, type CellStyle, type TabData, usedRange } from "./types";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

function applyStyle(xc: ExcelJS.Cell, s: CellStyle | undefined) {
  if (!s) return;
  const font: Partial<ExcelJS.Font> = {};
  if (s.b) font.bold = true;
  if (s.i) font.italic = true;
  if (s.u) font.underline = true;
  if (s.st) font.strike = true;
  if (s.c) font.color = { argb: argb(s.c) };
  if (s.fs) font.size = s.fs;
  if (Object.keys(font).length) xc.font = { name: "Arial", size: 10, ...font };
  if (s.bg) xc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(s.bg) } };
  if (s.al || s.va || s.wrap) {
    xc.alignment = {
      horizontal: s.al === "c" ? "center" : s.al === "r" ? "right" : s.al === "l" ? "left" : undefined,
      vertical: s.va === "m" ? "middle" : s.va === "t" ? "top" : s.va === "b" ? "bottom" : undefined,
      wrapText: s.wrap ? true : undefined,
    };
  }
  if (s.bt || s.br || s.bb || s.bl) {
    const b = (c?: string): Partial<ExcelJS.Border> | undefined => (c ? { style: "thin", color: { argb: argb(c) } } : undefined);
    xc.border = { top: b(s.bt), right: b(s.br), bottom: b(s.bb), left: b(s.bl) };
  }
}

export async function toXlsx(name: string, tabs: TabData[]): Promise<Buffer> {
  const book = new Book(tabs.map((t) => ({ name: t.name, grid: t.grid })));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Restaura Gestão";
  wb.created = new Date();
  tabs.forEach((tab, ti) => {
    const ws = wb.addWorksheet(tab.name.slice(0, 31), {
      views: tab.frozenRows || tab.frozenCols ? [{ state: "frozen", xSplit: tab.frozenCols, ySplit: tab.frozenRows, showGridLines: tab.showGrid }] : [{ showGridLines: tab.showGrid }],
    });
    book.warm(ti);
    const ur = usedRange(tab.grid);
    for (let c = 0; c < Math.max(ur.cols, 1); c++) {
      const col = ws.getColumn(c + 1);
      col.width = Math.max(2, ((tab.colW[c] ?? DEFAULT_COL_W) - 5) / 7);
      if (tab.hiddenCols.includes(c)) col.hidden = true;
    }
    for (const rk in tab.grid) {
      const r = Number(rk);
      const row = ws.getRow(r + 1);
      for (const ck in tab.grid[rk]) {
        const c = Number(ck);
        const cell: Cell = tab.grid[rk][ck];
        const xc = row.getCell(c + 1);
        const val = book.get(ti, r, c);
        const { kind } = parseFmt(cell.fmt);
        const isDate = kind === "date" || kind === "datetime" || kind === "time";
        let jsVal: ExcelJS.CellValue = null;
        if (val instanceof FErr) jsVal = { error: val.code as ExcelJS.ErrorValue };
        else if (val === null) jsVal = null;
        else if (typeof val === "number" && isDate) jsVal = utcDateFromSerial(val);
        else jsVal = val;
        if (cell.f !== undefined) {
          const result = val instanceof FErr ? undefined : isDate && typeof val === "number" ? utcDateFromSerial(val) : (val as string | number | boolean | null);
          xc.value = { formula: cell.f, result: result ?? undefined } as ExcelJS.CellFormulaValue;
        } else if (jsVal !== null) xc.value = jsVal;
        const nf = fmtToExcel(cell.fmt);
        if (nf) xc.numFmt = nf;
        applyStyle(xc, cell.s);
      }
      if (tab.rowH[r]) row.height = (tab.rowH[r] * 3) / 4;
      if (tab.hiddenRows.includes(r)) row.hidden = true;
    }
    for (const rk in tab.rowH) {
      const r = Number(rk);
      if (tab.rowH[r] !== DEFAULT_ROW_H && !tab.grid[r]) ws.getRow(r + 1).height = (tab.rowH[r] * 3) / 4;
    }
    for (const m of tab.merges) {
      try {
        ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1);
      } catch {
        /* mesclagem sobreposta: ignora */
      }
    }
    if (tab.filter) {
      const f = tab.filter;
      ws.autoFilter = { from: { row: f.r1 + 1, column: f.c1 + 1 }, to: { row: f.r1 + 1, column: f.c2 + 1 } };
    }
  });
  void name;
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/* ----------------------------- CSV / TSV ----------------------------- */

export type CsvKind = "br" | "us" | "tsv";

function csvField(v: string, delim: string) {
  return v.includes(delim) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function plainText(val: ReturnType<Book["get"]>, fmt: string | undefined, kind: CsvKind): string {
  if (val === null) return "";
  if (val instanceof FErr) return val.code;
  if (typeof val === "boolean") return val ? "VERDADEIRO" : "FALSO";
  if (typeof val === "string") return /^[=@]/.test(val) || /^[+-][^\d\s.,]/.test(val) ? "'" + val : val; // evita que o Excel trate texto como fórmula
  const { kind: k } = parseFmt(fmt);
  if (k === "date" || k === "datetime") {
    const p = ymdFromSerial(val);
    const d = kind === "br" ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}` : `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    if (k === "datetime") {
      const secs = Math.round((val - Math.floor(val)) * 86400);
      const t = `${String(Math.floor(secs / 3600)).padStart(2, "0")}:${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}`;
      return `${d} ${t}`;
    }
    return d;
  }
  const t = numToText(val);
  return kind === "br" ? t : t.replace(",", ".");
}

export function toCsv(tab: TabData, kind: CsvKind, allTabs?: TabData[]): string {
  const delim = kind === "br" ? ";" : kind === "tsv" ? "\t" : ",";
  const tabs = allTabs ?? [tab];
  const book = new Book(tabs.map((t) => ({ name: t.name, grid: t.grid })));
  const ti = Math.max(0, tabs.indexOf(tab));
  book.warm(ti);
  const ur = usedRange(tab.grid);
  const lines: string[] = [];
  for (let r = 0; r < ur.rows; r++) {
    const parts: string[] = [];
    for (let c = 0; c < ur.cols; c++) {
      const cell = tab.grid[r]?.[c];
      parts.push(cell ? csvField(plainText(book.get(ti, r, c), cell.fmt, kind), delim) : "");
    }
    lines.push(parts.join(delim));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

