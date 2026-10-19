/**
 * Leitor próprio do .xls antigo (BIFF8 dentro de um contêiner OLE2). Traz valores, resultados de fórmulas,
 * formatos numéricos, negrito/itálico/alinhamento, mesclagens e largura de colunas.
 * As FÓRMULAS do .xls não são decodificadas (ficam os valores calculados): para manter fórmulas, salve como .xlsx.
 */
import { excelToFmt } from "./format";
import { MAX_CELLS, emptyTab, type Cell, type CellStyle, type TabData } from "./types";

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const f64 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 8).getFloat64(0, true);

/* ----------------------------- contêiner OLE2 ----------------------------- */

function readWorkbookStream(buf: Uint8Array): Uint8Array {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (buf.length < 512 || sig.some((x, i) => buf[i] !== x)) throw new Error("Arquivo .xls inválido ou corrompido.");
  const shift = u16(buf, 30);
  const miniShift = u16(buf, 32);
  const secSize = 1 << shift;
  const miniSize = 1 << miniShift;
  const dirStart = u32(buf, 48);
  const cutoff = u32(buf, 56);
  const miniFatStart = u32(buf, 60);
  const numDifat = u32(buf, 72);
  const difatStart = u32(buf, 68);
  const secOff = (s: number) => (s + 1) * secSize;
  const END = 0xfffffffe;

  const fatSecs: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(buf, 76 + i * 4);
    if (s < 0xfffffffa) fatSecs.push(s);
  }
  let d = difatStart;
  for (let i = 0; i < numDifat && d < 0xfffffffa; i++) {
    const o = secOff(d);
    for (let j = 0; j < secSize / 4 - 1; j++) {
      const s = u32(buf, o + j * 4);
      if (s < 0xfffffffa) fatSecs.push(s);
    }
    d = u32(buf, o + secSize - 4);
  }
  const fat: number[] = [];
  for (const s of fatSecs) {
    const o = secOff(s);
    for (let j = 0; j < secSize / 4; j++) fat.push(u32(buf, o + j * 4));
  }
  const chain = (start: number): number[] => {
    const out: number[] = [];
    let s = start;
    while (s < 0xfffffffa && out.length < fat.length + 1) {
      out.push(s);
      s = fat[s] ?? END;
    }
    return out;
  };
  const readBig = (start: number, size?: number) => {
    const secs = chain(start);
    const out = new Uint8Array(secs.length * secSize);
    secs.forEach((s, i) => out.set(buf.subarray(secOff(s), secOff(s) + secSize), i * secSize));
    return size === undefined ? out : out.subarray(0, size);
  };

  const dir = readBig(dirStart);
  type Ent = { name: string; type: number; start: number; size: number };
  const ents: Ent[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = u16(dir, o + 64);
    let name = "";
    for (let i = 0; i + 2 <= Math.max(0, nl - 2); i += 2) name += String.fromCharCode(u16(dir, o + i));
    ents.push({ name, type: dir[o + 66], start: u32(dir, o + 116), size: u32(dir, o + 120) });
  }
  const root = ents.find((e) => e.type === 5);
  const wb = ents.find((e) => e.type === 2 && (e.name === "Workbook" || e.name === "Book"));
  if (!wb || !root) throw new Error("Não encontrei a pasta de trabalho dentro do .xls (arquivo protegido ou de formato antigo, anterior ao Excel 97).");
  if (wb.size >= cutoff) return readBig(wb.start, wb.size);
  const miniStream = readBig(root.start);
  const miniFat: number[] = [];
  const mf = readBig(miniFatStart);
  for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
  const out = new Uint8Array(wb.size);
  let s = wb.start;
  let n = 0;
  while (s < 0xfffffffa && n * miniSize < wb.size) {
    out.set(miniStream.subarray(s * miniSize, s * miniSize + miniSize), n * miniSize);
    s = miniFat[s] ?? END;
    n++;
  }
  return out;
}

/* ----------------------------- BIFF8 ----------------------------- */

type Rec = { id: number; data: Uint8Array };

function* records(b: Uint8Array, from = 0): Generator<Rec> {
  let o = from;
  while (o + 4 <= b.length) {
    const id = u16(b, o);
    const len = u16(b, o + 2);
    yield { id, data: b.subarray(o + 4, o + 4 + len) };
    o += 4 + len;
  }
}

const decodeLatin = (b: Uint8Array) => String.fromCharCode(...b);
function decodeUtf16(b: Uint8Array) {
  let s = "";
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
  return s;
}

/** XLUnicodeString a partir de `o` (cch u16 + flags). Devolve texto e próximo offset. */
function readXLString(d: Uint8Array, o: number, cch16 = true): { s: string; next: number } {
  const cch = cch16 ? u16(d, o) : d[o];
  o += cch16 ? 2 : 1;
  const flags = d[o++];
  const wide = flags & 1;
  let runs = 0;
  let ext = 0;
  if (flags & 8) {
    runs = u16(d, o);
    o += 2;
  }
  if (flags & 4) {
    ext = u32(d, o);
    o += 4;
  }
  const bytes = wide ? cch * 2 : cch;
  const s = wide ? decodeUtf16(d.subarray(o, o + bytes)) : decodeLatin(d.subarray(o, o + bytes));
  return { s, next: o + bytes + runs * 4 + ext };
}

/** Tabela de textos compartilhados, que pode atravessar registros CONTINUE. */
function readSST(chunks: Uint8Array[]): string[] {
  let ci = 0;
  let o = 8; // pula cstTotal e cstUnique
  let cur = chunks[0];
  const out: string[] = [];
  const total = u32(chunks[0], 4);
  const nextChunk = () => {
    ci++;
    cur = chunks[ci];
    o = 0;
  };
  const need = () => {
    if (o >= cur.length && ci < chunks.length - 1) nextChunk();
  };
  const rd8 = () => {
    need();
    return cur[o++];
  };
  const rd16 = () => rd8() | (rd8() << 8);
  const rd32 = () => (rd16() | (rd16() << 16)) >>> 0;
  for (let k = 0; k < total && ci < chunks.length; k++) {
    if (o >= cur.length && ci >= chunks.length - 1) break;
    const cch = rd16();
    const flags = rd8();
    let wide = flags & 1;
    const runs = flags & 8 ? rd16() : 0;
    const ext = flags & 4 ? rd32() : 0;
    let s = "";
    let left = cch;
    while (left > 0) {
      if (o >= cur.length) {
        if (ci >= chunks.length - 1) break;
        nextChunk();
        wide = cur[o++] & 1; // byte de flags no início do CONTINUE
      }
      const avail = cur.length - o;
      const n = Math.min(left, wide ? Math.floor(avail / 2) : avail);
      if (n <= 0) {
        if (ci >= chunks.length - 1) break;
        nextChunk();
        wide = cur[o++] & 1;
        continue;
      }
      s += wide ? decodeUtf16(cur.subarray(o, o + n * 2)) : decodeLatin(cur.subarray(o, o + n));
      o += wide ? n * 2 : n;
      left -= n;
    }
    let skip = runs * 4 + ext;
    while (skip > 0) {
      if (o >= cur.length) {
        if (ci >= chunks.length - 1) break;
        nextChunk();
      }
      const n = Math.min(skip, cur.length - o);
      o += n;
      skip -= n;
    }
    out.push(s);
  }
  return out;
}

function rkValue(rk: number): number {
  const isInt = rk & 2;
  const div = rk & 1;
  let v: number;
  if (isInt) v = rk >> 2;
  else {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(4, (rk & 0xfffffffc) >>> 0, true);
    v = dv.getFloat64(0, true);
  }
  return div ? v / 100 : v;
}

const BUILTIN_FMT: Record<number, string> = {
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  14: "dd/mm/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "hh:mm",
  21: "hh:mm:ss",
  22: "dd/mm/yyyy hh:mm",
  37: "#,##0;(#,##0)",
  38: "#,##0;(#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;(#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  49: "@",
};

const ERR_CODES: Record<number, string> = { 0: "#NULL!", 7: "#DIV/0!", 15: "#VALUE!", 23: "#REF!", 29: "#NAME?", 36: "#NUM!", 42: "#N/A" };

export type XlsResult = { tabs: TabData[]; warnings: string[] };

export function readXls(file: Uint8Array): XlsResult {
  const wbs = readWorkbookStream(file);
  const warnings: string[] = [];
  const fonts: { b: boolean; i: boolean; u: boolean; st: boolean }[] = [];
  const formats = new Map<number, string>();
  const xfs: { fmt: number; font: number; al: number; wrap: boolean }[] = [];
  let sst: string[] = [];
  const sheetsInfo: { name: string; offset: number; hidden: boolean }[] = [];
  let date1904 = false;

  // --- globais ---
  const sstChunks: Uint8Array[] = [];
  let inSST = false;
  for (const r of records(wbs)) {
    if (inSST && r.id !== 0x3c) {
      inSST = false;
      sst = readSST(sstChunks);
    }
    const d = r.data;
    if (r.id === 0x22) date1904 = u16(d, 0) === 1;
    else if (r.id === 0x31) fonts.push({ b: u16(d, 6) >= 700, i: !!(u16(d, 2) & 2), st: !!(u16(d, 2) & 8), u: d[10] > 0 });
    else if (r.id === 0x41) formats.set(u16(d, 0), readXLString(d, 2).s);
    else if (r.id === 0xe0) xfs.push({ font: u16(d, 0), fmt: u16(d, 2), al: d[6] & 7, wrap: !!(d[6] & 8) });
    else if (r.id === 0x85) {
      const nameLen = d[6];
      const flags = d[7];
      const name = flags & 1 ? decodeUtf16(d.subarray(8, 8 + nameLen * 2)) : decodeLatin(d.subarray(8, 8 + nameLen));
      sheetsInfo.push({ name, offset: u32(d, 0), hidden: (d[4] & 3) !== 0 });
    } else if (r.id === 0xfc) {
      sstChunks.length = 0;
      sstChunks.push(d);
      inSST = true;
    } else if (r.id === 0x3c && inSST) sstChunks.push(d);
    else if (r.id === 0x0a) break; // EOF das globais
  }
  if (inSST) sst = readSST(sstChunks);

  const styleOf = (xfi: number): { s?: CellStyle; fmt?: string } => {
    const xf = xfs[xfi];
    if (!xf) return {};
    const s: CellStyle = {};
    const f = fonts[xf.font >= 4 ? xf.font - 1 : xf.font];
    if (f?.b) s.b = 1;
    if (f?.i) s.i = 1;
    if (f?.u) s.u = 1;
    if (f?.st) s.st = 1;
    if (xf.al === 2) s.al = "c";
    else if (xf.al === 3) s.al = "r";
    else if (xf.al === 1) s.al = "l";
    if (xf.wrap) s.wrap = 1;
    const pat = formats.get(xf.fmt) ?? BUILTIN_FMT[xf.fmt];
    return { s: Object.keys(s).length ? s : undefined, fmt: excelToFmt(pat) };
  };

  const tabs: TabData[] = [];
  let total = 0;
  sheetsInfo.forEach((info, idx) => {
    const tab = emptyTab(`imp${idx}`, info.name || `Planilha${idx + 1}`);
    let maxR = 0;
    let maxC = 0;
    let depth = 0;
    let lastFormula: { r: number; c: number; xf: number } | null = null;
    const put = (r: number, c: number, xfi: number, v?: string | number | boolean) => {
      if (total >= MAX_CELLS || r > 100_000 || c > 700) return;
      const st = styleOf(xfi);
      const cell: Cell = {};
      if (v !== undefined) cell.v = v;
      if (st.s) cell.s = st.s;
      if (st.fmt) cell.fmt = st.fmt;
      if (!Object.keys(cell).length) return;
      (tab.grid[r] ??= {})[c] = cell;
      total++;
      if (r + 1 > maxR) maxR = r + 1;
      if (c + 1 > maxC) maxC = c + 1;
    };
    const adj = (n: number) => (date1904 ? n + 1462 : n);
    for (const r of records(wbs, info.offset)) {
      const d = r.data;
      if (r.id === 0x809) {
        depth++;
        continue;
      }
      if (r.id === 0x0a) {
        depth--;
        if (depth <= 0) break;
        continue;
      }
      if (depth > 1) continue;
      switch (r.id) {
        case 0x203: {
          const fmtd = styleOf(u16(d, 4)).fmt;
          const v = f64(d, 6);
          put(u16(d, 0), u16(d, 2), u16(d, 4), fmtd && /^(date|datetime|time|x:)/.test(fmtd) ? adj(v) : v);
          break;
        }
        case 0x27e: {
          const v = rkValue(u32(d, 6));
          const fmtd = styleOf(u16(d, 4)).fmt;
          put(u16(d, 0), u16(d, 2), u16(d, 4), fmtd && /^(date|datetime|time|x:)/.test(fmtd) ? adj(v) : v);
          break;
        }
        case 0xbd: {
          const row = u16(d, 0);
          const first = u16(d, 2);
          const n = (d.length - 6) / 6;
          for (let i = 0; i < n; i++) {
            const o = 4 + i * 6;
            const v = rkValue(u32(d, o + 2));
            const fmtd = styleOf(u16(d, o)).fmt;
            put(row, first + i, u16(d, o), fmtd && /^(date|datetime|time|x:)/.test(fmtd) ? adj(v) : v);
          }
          break;
        }
        case 0xfd:
          put(u16(d, 0), u16(d, 2), u16(d, 4), sst[u32(d, 6)] ?? "");
          break;
        case 0x204: {
          const cch = u16(d, 6);
          const flags = d[8];
          put(u16(d, 0), u16(d, 2), u16(d, 4), flags & 1 ? decodeUtf16(d.subarray(9, 9 + cch * 2)) : decodeLatin(d.subarray(9, 9 + cch)));
          break;
        }
        case 0x205:
          put(u16(d, 0), u16(d, 2), u16(d, 4), d[7] ? (ERR_CODES[d[6]] ?? "#VALUE!") : d[6] !== 0);
          break;
        case 0x06: {
          const row = u16(d, 0);
          const col = u16(d, 2);
          const xfi = u16(d, 4);
          if (d[12] === 0xff && d[13] === 0xff) {
            const t = d[6];
            if (t === 0) lastFormula = { r: row, c: col, xf: xfi };
            else if (t === 1) put(row, col, xfi, d[8] !== 0);
            else if (t === 2) put(row, col, xfi, ERR_CODES[d[8]] ?? "#VALUE!");
            else put(row, col, xfi);
          } else {
            const fmtd = styleOf(xfi).fmt;
            const v = f64(d, 6);
            put(row, col, xfi, fmtd && /^(date|datetime|time|x:)/.test(fmtd) ? adj(v) : v);
          }
          break;
        }
        case 0x207:
          if (lastFormula) {
            put(lastFormula.r, lastFormula.c, lastFormula.xf, readXLString(d, 0).s);
            lastFormula = null;
          }
          break;
        case 0xe5: {
          const n = u16(d, 0);
          for (let i = 0; i < n; i++) {
            const o = 2 + i * 8;
            const m = { r1: u16(d, o), c1: u16(d, o + 4), r2: u16(d, o + 2), c2: u16(d, o + 6) };
            if (m.r2 >= m.r1 && m.c2 >= m.c1 && (m.r1 !== m.r2 || m.c1 !== m.c2)) tab.merges.push(m);
          }
          break;
        }
        case 0x7d: {
          const first = u16(d, 0);
          const last = Math.min(u16(d, 2), first + 200);
          const w = u16(d, 4);
          const flags = u16(d, 8);
          for (let c = first; c <= last; c++) {
            if (flags & 1) tab.hiddenCols.push(c);
            else if (w > 0) tab.colW[c] = Math.round((w / 256) * 7 + 5);
          }
          break;
        }
        case 0x208: {
          const row = u16(d, 0);
          const h = u16(d, 6);
          const flags = u32(d, 12);
          if (flags & 0x20) tab.hiddenRows.push(row);
          else if (!(h & 0x8000) && h > 0 && h !== 255) tab.rowH[row] = Math.round(((h / 20) * 4) / 3);
          break;
        }
        case 0x41e:
          break;
      }
    }
    tab.rows = Math.max(1000, maxR + 100);
    tab.cols = Math.max(26, maxC + 2);
    if (info.hidden) warnings.push(`A aba “${info.name}” estava oculta no arquivo original.`);
    tabs.push(tab);
  });
  if (total >= MAX_CELLS) warnings.push(`Arquivo muito grande: foram lidas só as primeiras ${MAX_CELLS.toLocaleString("pt-BR")} células.`);
  warnings.push("Arquivo .xls (formato antigo): valores, formatos e mesclagens foram importados, mas as fórmulas viram valores. Salve como .xlsx para manter fórmulas e cores.");
  return { tabs, warnings };
}
