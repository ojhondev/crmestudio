/**
 * Página HTML limpa para imprimir / salvar como PDF (valores já calculados e formatados).
 */
import { Book } from "./formula";
import { formatValue } from "./format";
import { DEFAULT_COL_W, DEFAULT_ROW_H, colName, usedRange, type TabData } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function printHtml(title: string, tabs: TabData[], all: TabData[]): string {
  const book = new Book(all.map((t) => ({ name: t.name, grid: t.grid })));
  const sections = tabs.map((tab) => {
    const ti = all.indexOf(tab);
    book.warm(ti);
    const ur = usedRange(tab.grid);
    const hiddenC = new Set(tab.hiddenCols);
    const hiddenR = new Set(tab.hiddenRows);
    const skip = new Set<string>();
    const spans = new Map<string, { rs: number; cs: number }>();
    for (const m of tab.merges) {
      spans.set(`${m.r1},${m.c1}`, { rs: m.r2 - m.r1 + 1, cs: m.c2 - m.c1 + 1 });
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) skip.add(`${r},${c}`);
    }
    const cols: string[] = [];
    for (let c = 0; c < ur.cols; c++) if (!hiddenC.has(c)) cols.push(`<col style="width:${tab.colW[c] ?? DEFAULT_COL_W}px">`);
    const rows: string[] = [];
    for (let r = 0; r < ur.rows; r++) {
      if (hiddenR.has(r)) continue;
      const tds: string[] = [];
      for (let c = 0; c < ur.cols; c++) {
        if (hiddenC.has(c) || skip.has(`${r},${c}`)) continue;
        const cell = tab.grid[r]?.[c];
        const v = cell ? book.get(ti, r, c) : null;
        const text = cell ? formatValue(v, cell.fmt) : "";
        const s = cell?.s;
        const css: string[] = [];
        const isNum = typeof v === "number";
        css.push(`text-align:${s?.al === "c" ? "center" : s?.al === "r" || (!s?.al && isNum) ? "right" : "left"}`);
        if (s?.b) css.push("font-weight:700");
        if (s?.i) css.push("font-style:italic");
        if (s?.u || s?.st) css.push(`text-decoration:${[s.u ? "underline" : "", s.st ? "line-through" : ""].join(" ").trim()}`);
        if (s?.c) css.push(`color:${s.c}`);
        if (s?.bg) css.push(`background:${s.bg}`);
        if (s?.fs) css.push(`font-size:${s.fs}pt`);
        if (s?.wrap) css.push("white-space:pre-wrap");
        if (s?.bt) css.push(`border-top:1px solid ${s.bt}`);
        if (s?.bb) css.push(`border-bottom:1px solid ${s.bb}`);
        if (s?.bl) css.push(`border-left:1px solid ${s.bl}`);
        if (s?.br) css.push(`border-right:1px solid ${s.br}`);
        const sp = spans.get(`${r},${c}`);
        tds.push(`<td${sp ? ` rowspan="${sp.rs}" colspan="${sp.cs}"` : ""} style="${css.join(";")}">${esc(text)}</td>`);
      }
      rows.push(`<tr style="height:${tab.rowH[r] ?? DEFAULT_ROW_H}px">${tds.join("")}</tr>`);
    }
    void colName;
    return `<section><h2>${esc(tab.name)}</h2><table class="${tab.showGrid ? "grid" : ""}"><colgroup>${cols.join("")}</colgroup><tbody>${rows.join("")}</tbody></table></section>`;
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font:10pt Arial,Helvetica,sans-serif;color:#111;margin:16px}
  h1{font-size:15pt;margin:0 0 4px} h2{font-size:11pt;margin:18px 0 6px;color:#444}
  table{border-collapse:collapse;table-layout:fixed} td{padding:2px 5px;overflow:hidden;vertical-align:middle;word-break:break-word}
  table.grid td{border:1px solid #d4d4d8} section{page-break-inside:auto} tr{page-break-inside:avoid}
  .bar{margin-bottom:12px;font-size:9pt;color:#555} .bar button{font:inherit;padding:4px 10px;margin-right:8px}
  @media print{.bar{display:none} body{margin:0}} @page{size:A4 landscape;margin:12mm}
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimir / salvar como PDF</button>Dica: na janela de impressão, escolha “Salvar como PDF”.</div>
<h1>${esc(title)}</h1>${sections.join("")}
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>
</body></html>`;
}
