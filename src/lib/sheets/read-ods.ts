/**
 * Leitor próprio do .ods (LibreOffice/OpenOffice): zip + content.xml.
 * Traz abas, valores, fórmulas, formatos de número, mesclagens, largura de colunas e estilos simples.
 */
import JSZip from "jszip";
import { SaxesParser } from "saxes";
import { canonicalFormula } from "./formula";
import { serialFromYMD } from "./format";
import { assertZipSafe } from "./zip-guard";
import { MAX_CELLS, emptyTab, type Cell, type CellStyle, type TabData } from "./types";

type DataStyle = { kind: "number" | "currency" | "percentage" | "date" | "time" | "datetime"; decimals: number; currency?: string; hasDate?: boolean; hasTime?: boolean; grouping?: boolean };
type CellStyleDef = { s: CellStyle; dataStyle?: string };

const cm = (v: string | undefined) => {
  if (!v) return 0;
  const n = parseFloat(v);
  if (/in$/.test(v)) return n * 2.54;
  if (/mm$/.test(v)) return n / 10;
  if (/pt$/.test(v)) return (n / 72) * 2.54;
  return n; // cm
};

export type OdsResult = { tabs: TabData[]; warnings: string[] };

function odfFormulaToCanonical(raw: string): string | undefined {
  let f = raw.replace(/^of:=?/i, "").replace(/^=/, "");
  f = f.replace(/\[(?:\$?('[^']+'|[^.\]:']+))?\.(\$?[A-Za-z]{1,3}\$?\d+)(?::(?:\$?('[^']+'|[^.\]:']+))?\.(\$?[A-Za-z]{1,3}\$?\d+))?\]/g, (_m, s1: string | undefined, a: string, _s2: string | undefined, b: string | undefined) => {
    const pre = s1 ? (s1.startsWith("'") ? s1 : /^[A-Za-z_][A-Za-z0-9_]*$/.test(s1) ? s1 : `'${s1}'`) + "!" : "";
    return pre + a + (b ? ":" + b : "");
  });
  f = f.replace(/\{[^}]*\}/g, "").replace(/<>/g, "<>");
  return canonicalFormula(f) ?? undefined;
}

export async function readOds(buf: Uint8Array): Promise<OdsResult> {
  await assertZipSafe(buf);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("content.xml");
  if (!file) throw new Error("Arquivo .ods inválido (sem content.xml).");
  const xml = await file.async("string");
  const warnings: string[] = [];

  const dataStyles = new Map<string, DataStyle>();
  const cellStyles = new Map<string, CellStyleDef>();
  const colStyles = new Map<string, number>(); // px
  const rowStyles = new Map<string, number>();

  const tabs: TabData[] = [];
  let total = 0;
  let tab: TabData | null = null;
  let row = 0;
  let col = 0;
  let maxR = 0;
  let maxC = 0;
  let rowRepeat = 1;
  let rowHidden = false;
  let rowStyleName = "";
  let rowCells: { c: number; cell: Cell; span?: { cs: number; rs: number } }[] = [];
  let colIdx = 0;
  let curCell: { attrs: Record<string, string>; text: string[] } | null = null;
  let inP = false;
  let pText = "";
  // contexto de estilos
  let curStyle: { name: string; family: string; dataStyle?: string; s: CellStyle; width?: string; rowH?: string } | null = null;
  let curData: { name: string; ds: DataStyle } | null = null;
  const hiddenSheetNames: string[] = [];

  const parser = new SaxesParser();
  parser.on("error", () => {
    /* tolerante */
  });

  parser.on("opentag", (t) => {
    const a = t.attributes as Record<string, string>;
    const n = t.name;
    // ---- estilos de dados
    if (n === "number:number-style" || n === "number:currency-style" || n === "number:percentage-style" || n === "number:date-style" || n === "number:time-style") {
      const kind = n === "number:number-style" ? "number" : n === "number:currency-style" ? "currency" : n === "number:percentage-style" ? "percentage" : n === "number:date-style" ? "date" : "time";
      curData = { name: a["style:name"], ds: { kind, decimals: 0 } };
    } else if (curData && n === "number:number") {
      curData.ds.decimals = Number(a["number:decimal-places"] ?? 0);
      curData.ds.grouping = a["number:grouping"] === "true";
    }
    else if (curData && n === "number:currency-symbol") curData.ds.currency = "";
    else if (curData && (n === "number:day" || n === "number:month" || n === "number:year")) curData.ds.hasDate = true;
    else if (curData && (n === "number:hours" || n === "number:minutes")) curData.ds.hasTime = true;
    // ---- estilos de célula/coluna/linha
    else if (n === "style:style") {
      curStyle = { name: a["style:name"], family: a["style:family"], dataStyle: a["style:data-style-name"], s: {} };
    } else if (curStyle && n === "style:text-properties") {
      if (a["fo:font-weight"] === "bold") curStyle.s.b = 1;
      if (a["fo:font-style"] === "italic") curStyle.s.i = 1;
      if (a["style:text-underline-style"] && a["style:text-underline-style"] !== "none") curStyle.s.u = 1;
      if (a["style:text-line-through-style"] && a["style:text-line-through-style"] !== "none") curStyle.s.st = 1;
      if (a["fo:color"] && /^#[0-9a-f]{6}$/i.test(a["fo:color"]) && a["fo:color"] !== "#000000") curStyle.s.c = a["fo:color"].toLowerCase();
    } else if (curStyle && n === "style:table-cell-properties") {
      if (a["fo:background-color"] && /^#[0-9a-f]{6}$/i.test(a["fo:background-color"])) curStyle.s.bg = a["fo:background-color"].toLowerCase();
      if (a["fo:wrap-option"] === "wrap") curStyle.s.wrap = 1;
      const bord = (v?: string) => (v && v !== "none" ? (/#[0-9a-f]{6}/i.exec(v)?.[0] ?? "#000000") : undefined);
      const all = bord(a["fo:border"]);
      const bt = bord(a["fo:border-top"]) ?? all;
      const bb = bord(a["fo:border-bottom"]) ?? all;
      const bl = bord(a["fo:border-left"]) ?? all;
      const br = bord(a["fo:border-right"]) ?? all;
      if (bt) curStyle.s.bt = bt;
      if (bb) curStyle.s.bb = bb;
      if (bl) curStyle.s.bl = bl;
      if (br) curStyle.s.br = br;
      const va = a["style:vertical-align"];
      if (va === "middle") curStyle.s.va = "m";
      else if (va === "top") curStyle.s.va = "t";
    } else if (curStyle && n === "style:paragraph-properties") {
      const ta = a["fo:text-align"];
      if (ta === "center") curStyle.s.al = "c";
      else if (ta === "end" || ta === "right") curStyle.s.al = "r";
      else if (ta === "start" || ta === "left") curStyle.s.al = "l";
    } else if (curStyle && n === "style:table-column-properties") curStyle.width = a["style:column-width"];
    else if (curStyle && n === "style:table-row-properties") curStyle.rowH = a["style:row-height"];
    // ---- tabelas
    else if (n === "table:table") {
      const name = a["table:name"] ?? `Planilha${tabs.length + 1}`;
      tab = emptyTab(`imp${tabs.length}`, name);
      row = 0;
      col = 0;
      maxR = 0;
      maxC = 0;
      colIdx = 0;
      if (a["table:display"] === "false") hiddenSheetNames.push(name);
    } else if (tab && n === "table:table-column") {
      const rep = Math.min(Number(a["table:number-columns-repeated"] ?? 1), 1024);
      const w = colStyles.get(a["table:style-name"] ?? "");
      for (let i = 0; i < rep; i++) {
        if (a["table:visibility"] === "collapse" || a["table:visibility"] === "hidden") tab.hiddenCols.push(colIdx + i);
        else if (w) tab.colW[colIdx + i] = w;
      }
      colIdx += Number(a["table:number-columns-repeated"] ?? 1);
    } else if (tab && n === "table:table-row") {
      rowRepeat = Number(a["table:number-rows-repeated"] ?? 1);
      rowHidden = a["table:visibility"] === "collapse" || a["table:visibility"] === "hidden";
      rowStyleName = a["table:style-name"] ?? "";
      rowCells = [];
      col = 0;
    } else if (tab && (n === "table:table-cell" || n === "table:covered-table-cell")) {
      curCell = { attrs: { ...a, __covered: n === "table:covered-table-cell" ? "1" : "" }, text: [] };
    } else if (curCell && n === "text:p") {
      inP = true;
      pText = "";
    } else if (inP && n === "text:s") pText += " ".repeat(Number(a["text:c"] ?? 1));
    else if (inP && n === "text:tab") pText += "\t";
    else if (inP && n === "text:line-break") pText += "\n";
  });

  parser.on("text", (t) => {
    if (inP) pText += t;
  });

  parser.on("closetag", (t) => {
    const n = t.name;
    if (n === "text:p" && inP) {
      inP = false;
      curCell?.text.push(pText);
    } else if (n === "style:style" && curStyle) {
      if (curStyle.family === "table-column" && curStyle.width) colStyles.set(curStyle.name, Math.round(cm(curStyle.width) * 37.8));
      else if (curStyle.family === "table-row" && curStyle.rowH) rowStyles.set(curStyle.name, Math.round(cm(curStyle.rowH) * 37.8));
      else if (curStyle.family === "table-cell") cellStyles.set(curStyle.name, { s: curStyle.s, dataStyle: curStyle.dataStyle });
      curStyle = null;
    } else if (curData && /^number:(number|currency|percentage|date|time)-style$/.test(n)) {
      const ds = curData.ds;
      if (ds.kind === "date" || ds.kind === "time") ds.kind = ds.hasDate && ds.hasTime ? "datetime" : ds.hasTime ? "time" : "date";
      dataStyles.set(curData.name, ds);
      curData = null;
    } else if ((n === "table:table-cell" || n === "table:covered-table-cell") && curCell && tab) {
      const a = curCell.attrs;
      const rep = Math.min(Number(a["table:number-columns-repeated"] ?? 1), 1024);
      const covered = !!a.__covered;
      const text = curCell.text.join("\n");
      const vtype = a["office:value-type"];
      const sdef = cellStyles.get(a["table:style-name"] ?? "");
      const ds = sdef?.dataStyle ? dataStyles.get(sdef.dataStyle) : undefined;
      const cell: Cell = {};
      if (!covered) {
        if (vtype === "float" || vtype === "percentage" || vtype === "currency") {
          cell.v = Number(a["office:value"]);
          if (vtype === "percentage") cell.fmt = `pct:${ds?.decimals ?? 0}`;
          else if (vtype === "currency") cell.fmt = a["office:currency"] === "BRL" || /R\$/.test(text) ? `brl:${ds?.decimals ?? 2}` : `n:${ds?.decimals ?? 2}`;
          else if (ds?.kind === "number" && (ds.decimals > 0 || ds.grouping)) cell.fmt = ds.grouping ? `n:${ds.decimals}` : "x:0." + "0".repeat(ds.decimals);
        } else if (vtype === "date") {
          const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(a["office:date-value"] ?? "");
          if (m) {
            const ser = serialFromYMD(Number(m[1]), Number(m[2]), Number(m[3]));
            if (m[4]) {
              cell.v = ser + (Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6])) / 86400;
              cell.fmt = "datetime";
            } else {
              cell.v = ser;
              cell.fmt = "date";
            }
          }
        } else if (vtype === "time") {
          const m = /^PT(\d+)H(\d+)M(\d+)/.exec(a["office:time-value"] ?? "");
          if (m) {
            cell.v = (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) / 86400;
            cell.fmt = "time";
          }
        } else if (vtype === "boolean") cell.v = a["office:boolean-value"] === "true";
        else if (vtype === "string") cell.v = a["office:string-value"] ?? text;
        else if (text) cell.v = text;
        if (a["table:formula"]) {
          const f = odfFormulaToCanonical(a["table:formula"]);
          if (f) cell.f = f;
        }
        if (sdef && Object.keys(sdef.s).length) cell.s = sdef.s;
        if (cell.v === undefined) delete cell.v;
      }
      const cs = Number(a["table:number-columns-spanned"] ?? 1);
      const rs = Number(a["table:number-rows-spanned"] ?? 1);
      const has = cell.v !== undefined || cell.f !== undefined || cell.s || cell.fmt;
      if (has && !covered) {
        for (let i = 0; i < Math.min(rep, has && cell.v === undefined && !cell.f ? 64 : rep); i++) rowCells.push({ c: col + i, cell: i === 0 ? cell : { ...cell }, span: i === 0 && (cs > 1 || rs > 1) ? { cs, rs } : undefined });
      } else if (has && covered && cell.s) {
        rowCells.push({ c: col, cell: { s: cell.s } });
      }
      col += Number(a["table:number-columns-repeated"] ?? 1);
      curCell = null;
    } else if (n === "table:table-row" && tab) {
      const h = rowStyles.get(rowStyleName);
      const reps = Math.min(rowRepeat, rowCells.length ? 1000 : 1);
      if (rowCells.length || rowHidden || h) {
        for (let k = 0; k < reps; k++) {
          const r = row + k;
          for (const { c, cell, span } of rowCells) {
            if (total >= MAX_CELLS) break;
            (tab.grid[r] ??= {})[c] = cell;
            total++;
            if (c + 1 > maxC) maxC = c + 1;
            if (span && k === 0) tab.merges.push({ r1: r, c1: c, r2: r + span.rs - 1, c2: c + span.cs - 1 });
          }
          if (rowCells.length && r + 1 > maxR) maxR = r + 1;
          if (rowHidden) tab.hiddenRows.push(r);
          else if (h && rowCells.length) tab.rowH[r] = h;
        }
      }
      row += rowRepeat;
    } else if (n === "table:table" && tab) {
      tab.rows = Math.max(1000, maxR + 100);
      tab.cols = Math.max(26, maxC + 2);
      tabs.push(tab);
      tab = null;
    }
  });

  parser.write(xml).close();
  if (!tabs.length) throw new Error("Nenhuma planilha encontrada no arquivo .ods.");
  for (const h of hiddenSheetNames) warnings.push(`A aba “${h}” estava oculta no arquivo original.`);
  if (total >= MAX_CELLS) warnings.push(`Arquivo muito grande: foram lidas só as primeiras ${MAX_CELLS.toLocaleString("pt-BR")} células.`);
  return { tabs, warnings };
}
