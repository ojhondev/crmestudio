/**
 * Motor de fórmulas próprio (sem dependências): leitor, impressor e avaliador.
 * - Fórmulas ficam guardadas na forma canônica en-US (nomes em inglês, "," separando argumentos, "." decimal),
 *   a mesma do arquivo .xlsx. Na barra de fórmulas aparecem em português (SOMA, ";" e vírgula decimal).
 * - Ao digitar, aceita nomes em português OU inglês e ";" OU ",".
 */
import { FErr, formatPattern, formatValue, parseTyped, guessPatternDecimal, nowSerial, numToText, parseNumberText, roundTo, serialFromYMD, todaySerial, ymdFromSerial } from "./format";
import { EN_BY_ANY, FUNCTION_NAMES, PT_BY_EN, PT_ONLY, XLFN, norm } from "./functions";
import type { CellValue, Grid } from "./types";
import { colIndex, colName } from "./types";

/* ================================ AST ================================ */

export type Ref = { r: number; c: number; ra: boolean; ca: boolean };
export type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; ref: Ref; sheet?: string }
  | { t: "range"; a: Ref; b: Ref; sheet?: string }
  | { t: "un"; op: "-" | "+"; x: Node }
  | { t: "pct"; x: Node }
  | { t: "paren"; x: Node }
  | { t: "bin"; op: string; l: Node; r: Node }
  | { t: "call"; name: string; args: Node[] }
  | { t: "err"; code: string }
  | { t: "empty" };

export const LAST_ROW = 1048575;

/* ================================ nomes das funções ================================ */

export { FUNCTION_NAMES };

/* ================================ leitor (tokenizer + parser) ================================ */

type Tok =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "id"; v: string }
  | { k: "op"; v: string }
  | { k: "ref"; v: Ref; sheet?: string }
  | { k: "colrange"; a: number; b: number; aa: boolean; ba: boolean; sheet?: string }
  | { k: "err"; v: string };

export class FormulaSyntaxError extends Error {}

const ERR_PT: Record<string, string> = { "#NOME?": "#NAME?", "#VALOR!": "#VALUE!", "#N/D": "#N/A", "#NÚM!": "#NUM!" };
const canonErr = (c: string) => {
  const u = c.toUpperCase();
  return ERR_PT[u] ?? u;
};

function tokenize(src: string): Tok[] {
  // modo BR: se há ";" fora de texto, a vírgula é decimal
  let br = false;
  {
    let q = false;
    for (const ch of src) {
      if (ch === '"') q = !q;
      else if (ch === ";" && !q) {
        br = true;
        break;
      }
    }
    // nome de função só em português (ex.: ARRED(3,14)) também indica vírgula decimal
    if (!br) {
      const bare = src.replace(/"(?:[^"]|"")*"/g, '""');
      for (const m of bare.matchAll(/([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)\s*\(/g)) {
        if (PT_ONLY.has(norm(m[1]))) {
          br = true;
          break;
        }
      }
    }
  }
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      for (;;) {
        if (j >= n) throw new FormulaSyntaxError("texto sem fechar");
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      out.push({ k: "str", v: s });
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const m = /^#(DIV\/0!|REF!|NAME\?|NOME\?|VALUE!|VALOR!|N\/A|N\/D|NUM!|NÚM!|NULL!|ERRO!|CIRC!)/i.exec(src.slice(i));
      if (!m) throw new FormulaSyntaxError("caractere #");
      out.push({ k: "err", v: canonErr(m[0]) });
      i += m[0].length;
      continue;
    }
    // número
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    // prefixo de aba: 'nome da aba'! ou Nome!
    let sheet: string | undefined;
    let consumed = 0;
    if ((m = /^'((?:[^']|'')+)'!/.exec(rest))) {
      sheet = m[1].replace(/''/g, "'");
      consumed = m[0].length;
    } else if ((m = /^([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)!/.exec(rest))) {
      sheet = m[1];
      consumed = m[0].length;
    }
    const body = rest.slice(consumed);
    if (sheet !== undefined || /^\$?[A-Za-z]/.test(body)) {
      // A1, A1:B2 (o ":" é tratado pelo parser), A:A
      if ((m = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/.exec(body))) {
        out.push({ k: "colrange", a: colIndex(m[2]), b: colIndex(m[4]), aa: !!m[1], ba: !!m[3], sheet });
        i += consumed + m[0].length;
        continue;
      }
      if ((m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_.(])/.exec(body))) {
        out.push({ k: "ref", v: { c: colIndex(m[2]), r: Number(m[4]) - 1, ca: !!m[1], ra: !!m[3] }, sheet });
        i += consumed + m[0].length;
        continue;
      }
      if (sheet !== undefined) throw new FormulaSyntaxError("referência inválida");
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const re = br ? /^(\d+([.,]\d+)?|[.,]\d+)([eE][+-]?\d+)?/ : /^(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?/;
      const mm = re.exec(rest);
      if (!mm) throw new FormulaSyntaxError("número inválido");
      out.push({ k: "num", v: Number(mm[0].replace(",", ".")) });
      i += mm[0].length;
      continue;
    }
    if ((m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(rest))) {
      out.push({ k: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = rest.slice(0, 2);
    if (two === "<>" || two === "<=" || two === ">=") {
      out.push({ k: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/^&=<>(),;:%".includes(ch)) {
      out.push({ k: "op", v: ch });
      i++;
      continue;
    }
    throw new FormulaSyntaxError(`caractere inesperado "${ch}"`);
  }
  return out;
}

export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => toks[p]?.k === "op" && (toks[p] as { v: string }).v === v;

  function parseCmp(): Node {
    let l = parseConcat();
    while (peek()?.k === "op" && ["=", "<>", "<", ">", "<=", ">="].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v;
      l = { t: "bin", op, l, r: parseConcat() };
    }
    return l;
  }
  function parseConcat(): Node {
    let l = parseAdd();
    while (isOp("&")) {
      p++;
      l = { t: "bin", op: "&", l, r: parseAdd() };
    }
    return l;
  }
  function parseAdd(): Node {
    let l = parseMul();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      l = { t: "bin", op, l, r: parseMul() };
    }
    return l;
  }
  function parseMul(): Node {
    let l = parsePow();
    while (isOp("*") || isOp("/")) {
      const op = (toks[p++] as { v: string }).v;
      l = { t: "bin", op, l, r: parsePow() };
    }
    return l;
  }
  function parsePow(): Node {
    let l = parseUnary();
    while (isOp("^")) {
      p++;
      l = { t: "bin", op: "^", l, r: parseUnary() };
    }
    return l;
  }
  function parseUnary(): Node {
    if (isOp("-") || isOp("+")) {
      const op = (toks[p++] as { v: string }).v as "-" | "+";
      return { t: "un", op, x: parseUnary() };
    }
    return parsePostfix();
  }
  function parsePostfix(): Node {
    let x = parsePrimary();
    while (isOp("%")) {
      p++;
      x = { t: "pct", x };
    }
    return x;
  }
  function parsePrimary(): Node {
    const t = toks[p++];
    if (!t) throw new FormulaSyntaxError("fórmula incompleta");
    switch (t.k) {
      case "num":
        return { t: "num", v: t.v };
      case "str":
        return { t: "str", v: t.v };
      case "err":
        return { t: "err", code: t.v };
      case "colrange":
        return { t: "range", a: { r: 0, c: t.a, ra: false, ca: t.aa }, b: { r: LAST_ROW, c: t.b, ra: false, ca: t.ba }, sheet: t.sheet };
      case "ref": {
        if (isOp(":")) {
          p++;
          const t2 = toks[p++];
          if (!t2 || t2.k !== "ref") throw new FormulaSyntaxError("intervalo inválido");
          return { t: "range", a: t.v, b: t2.v, sheet: t.sheet };
        }
        return { t: "ref", ref: t.v, sheet: t.sheet };
      }
      case "id": {
        if (isOp("(")) {
          p++;
          const args: Node[] = [];
          if (isOp(")")) {
            p++;
          } else {
            for (;;) {
              if (isOp(",") || isOp(";")) args.push({ t: "empty" });
              else if (isOp(")")) args.push({ t: "empty" });
              else args.push(parseCmp());
              if (isOp(",") || isOp(";")) {
                p++;
                continue;
              }
              if (isOp(")")) {
                p++;
                break;
              }
              throw new FormulaSyntaxError("esperava ) ou separador");
            }
          }
          const bare = t.v.replace(/^(_xl(fn|ws)\.)+/i, "");
          const en = EN_BY_ANY.get(norm(bare));
          return { t: "call", name: en ?? t.v.toUpperCase(), args };
        }
        const up = norm(t.v);
        if (up === "TRUE" || up === "VERDADEIRO") return { t: "bool", v: true };
        if (up === "FALSE" || up === "FALSO") return { t: "bool", v: false };
        return { t: "err", code: "#NAME?" };
      }
      case "op": {
        if (t.v === "(") {
          const x = parseCmp();
          if (!isOp(")")) throw new FormulaSyntaxError("falta )");
          p++;
          return { t: "paren", x };
        }
        throw new FormulaSyntaxError(`"${t.v}" inesperado`);
      }
    }
  }

  const root = parseCmp();
  if (p < toks.length) throw new FormulaSyntaxError("sobrou texto no fim");
  return root;
}

/* ================================ impressor ================================ */

export type Locale = "en" | "pt";

function refText(r: Ref, whole?: "col") {
  if (whole === "col") return (r.ca ? "$" : "") + colName(r.c);
  return (r.ca ? "$" : "") + colName(r.c) + (r.ra ? "$" : "") + (r.r + 1);
}
const sheetPrefix = (s?: string) => (s === undefined ? "" : /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? `${s}!` : `'${s.replace(/'/g, "''")}'!`);

export function unparse(n: Node, loc: Locale = "en"): string {
  const sep = loc === "pt" ? ";" : ",";
  switch (n.t) {
    case "num":
      return loc === "pt" ? String(n.v).replace(".", ",") : String(n.v);
    case "str":
      return `"${n.v.replace(/"/g, '""')}"`;
    case "bool":
      return loc === "pt" ? (n.v ? "VERDADEIRO" : "FALSO") : n.v ? "TRUE" : "FALSE";
    case "ref":
      return sheetPrefix(n.sheet) + refText(n.ref);
    case "range":
      if (n.a.r === 0 && n.b.r === LAST_ROW) return sheetPrefix(n.sheet) + refText(n.a, "col") + ":" + refText(n.b, "col");
      return sheetPrefix(n.sheet) + refText(n.a) + ":" + refText(n.b);
    case "un":
      return n.op + unparse(n.x, loc);
    case "pct":
      return unparse(n.x, loc) + "%";
    case "paren":
      return "(" + unparse(n.x, loc) + ")";
    case "bin":
      return unparse(n.l, loc) + n.op + unparse(n.r, loc);
    case "call": {
      const name = loc === "pt" ? (PT_BY_EN.get(n.name) ?? n.name) : n.name;
      return `${name}(${n.args.map((a) => unparse(a, loc)).join(sep)})`;
    }
    case "err":
      return n.code;
    case "empty":
      return "";
  }
}

/** Normaliza o que foi digitado (pt ou en) para a forma canônica. Devolve null se não for fórmula válida. */
export function canonicalFormula(typed: string): string | null {
  try {
    return unparse(parseFormula(typed), "en");
  } catch {
    return null;
  }
}

/** Forma canônica → fórmula do arquivo .xlsx (funções novas do Excel levam o prefixo _xlfn.). */
export function toXlsxFormula(canonical: string): string {
  let ast: Node;
  try {
    ast = parseFormula(canonical);
  } catch {
    return canonical;
  }
  const walk = (n: Node): Node => mapNode(n, (x) => (x.t === "call" ? { ...x, name: (XLFN.has(x.name) ? "_xlfn." : "") + x.name, args: x.args.map(walk) } : null));
  return unparse(walk(ast), "en");
}

/** Forma canônica → texto da barra de fórmulas (português). */
export function displayFormula(canonical: string): string {
  try {
    return unparse(parseFormula(canonical), "pt");
  } catch {
    return canonical;
  }
}

/* ================================ reescrita de referências ================================ */

function mapNode(n: Node, f: (n: Node) => Node | null): Node {
  const r = f(n);
  if (r) return r;
  switch (n.t) {
    case "un":
      return { ...n, x: mapNode(n.x, f) };
    case "pct":
    case "paren":
      return { ...n, x: mapNode(n.x, f) };
    case "bin":
      return { ...n, l: mapNode(n.l, f), r: mapNode(n.r, f) };
    case "call":
      return { ...n, args: n.args.map((a) => mapNode(a, f)) };
    default:
      return n;
  }
}

/** Copiar/colar: desloca as referências relativas. */
export function offsetFormula(canonical: string, dr: number, dc: number): string {
  let ast: Node;
  try {
    ast = parseFormula(canonical);
  } catch {
    return canonical;
  }
  const shift = (r: Ref): Ref | null => {
    const nr = r.ra ? r.r : r.r + dr;
    const nc = r.ca ? r.c : r.c + dc;
    if (nr < 0 || nc < 0) return null;
    return { ...r, r: nr, c: nc };
  };
  const out = mapNode(ast, (n) => {
    if (n.t === "ref") {
      const s = shift(n.ref);
      return s ? { ...n, ref: s } : { t: "err", code: "#REF!" };
    }
    if (n.t === "range") {
      const whole = n.a.r === 0 && n.b.r === LAST_ROW;
      const a = shift(n.a);
      const b = whole ? { ...n.b, c: n.b.ca ? n.b.c : n.b.c + dc } : shift(n.b);
      if (!a || !b) return { t: "err", code: "#REF!" };
      return { ...n, a: whole ? { ...a, r: 0 } : a, b };
    }
    return null;
  });
  return unparse(out, "en");
}

/**
 * Inserir/excluir linhas ou colunas: ajusta as referências de uma fórmula.
 * `owner` = nome da aba onde a fórmula mora; `target` = nome da aba que mudou.
 * delta > 0 insere `delta` itens antes de `at`; delta < 0 exclui |delta| itens a partir de `at`.
 */
export function adjustFormula(canonical: string, owner: string, target: string, axis: "row" | "col", at: number, delta: number): string {
  let ast: Node;
  try {
    ast = parseFormula(canonical);
  } catch {
    return canonical;
  }
  const same = (sheet?: string) => (sheet === undefined ? owner : sheet).toLowerCase() === target.toLowerCase();
  const key = axis === "row" ? "r" : "c";
  const pt = (v: number): number | null => {
    if (delta > 0) return v >= at ? v + delta : v;
    const n = -delta;
    if (v >= at && v < at + n) return null;
    return v >= at + n ? v - n : v;
  };
  const rangeEnds = (v1: number, v2: number): [number, number] | null => {
    if (delta > 0) return [v1 >= at ? v1 + delta : v1, v2 >= at ? v2 + delta : v2];
    const n = -delta;
    const a = v1 >= at + n ? v1 - n : v1 >= at ? at : v1;
    const b = v2 >= at + n ? v2 - n : v2 >= at ? at - 1 : v2;
    return b < a ? null : [a, b];
  };
  const out = mapNode(ast, (n) => {
    if (n.t === "ref" && same(n.sheet)) {
      const v = pt(n.ref[key]);
      return v === null ? { t: "err", code: "#REF!" } : { ...n, ref: { ...n.ref, [key]: v } };
    }
    if (n.t === "range" && same(n.sheet)) {
      if (axis === "row" && n.a.r === 0 && n.b.r === LAST_ROW) return n;
      const e = rangeEnds(n.a[key], n.b[key]);
      return e ? { ...n, a: { ...n.a, [key]: e[0] }, b: { ...n.b, [key]: e[1] } } : { t: "err", code: "#REF!" };
    }
    return null;
  });
  return unparse(out, "en");
}

/** Renomear aba: atualiza referências "Antiga!A1". */
export function renameSheetInFormula(canonical: string, from: string, to: string): string {
  let ast: Node;
  try {
    ast = parseFormula(canonical);
  } catch {
    return canonical;
  }
  const out = mapNode(ast, (n) => {
    if ((n.t === "ref" || n.t === "range") && n.sheet?.toLowerCase() === from.toLowerCase()) return { ...n, sheet: to };
    return null;
  });
  return unparse(out, "en");
}

/* ================================ avaliador ================================ */

export type V = number | string | boolean | null | FErr;
export type Arr = { rows: number; cols: number; d: V[][] };
type A = V | Arr;
const isArr = (x: A): x is Arr => typeof x === "object" && x !== null && !(x instanceof FErr);

const E = {
  div0: () => new FErr("#DIV/0!"),
  ref: () => new FErr("#REF!"),
  name: () => new FErr("#NAME?"),
  value: () => new FErr("#VALUE!"),
  na: () => new FErr("#N/A"),
  num: () => new FErr("#NUM!"),
  circ: () => new FErr("#CIRC!"),
  erro: () => new FErr("#ERRO!"),
};

export type BookTab = { name: string; grid: Grid; /** linhas ocultas à mão (SUBTOTAL 101-111) */ hiddenManual?: Set<number>; /** linhas escondidas por filtro (SUBTOTAL/AGREGAR) */ hiddenFilter?: Set<number> | (() => Set<number>); /** cache interno de hiddenFilter */ hiddenFilterCache?: Set<number> };

/** Fórmulas cujo resultado em matriz "derrama" nas células vizinhas (como no Planilhas Google / Excel 365). */
export const SPILL_RE = /\b(ARRAYFORMULA|UNIQUE|SORT|FILTER|SEQUENCE|TRANSPOSE|SPLIT|MMULT)\(/;

const PARSE_CACHE = new Map<string, Node | null>();
function parseCached(f: string): Node | null {
  let n = PARSE_CACHE.get(f);
  if (n === undefined) {
    try {
      n = parseFormula(f);
    } catch {
      n = null;
    }
    if (PARSE_CACHE.size > 20000) PARSE_CACHE.clear();
    PARSE_CACHE.set(f, n);
  }
  return n;
}

type Ctx = { tab: number; r: number; c: number; arr?: boolean };

export class Book {
  private cache = new Map<number, V>();
  private busy = new Set<number>();
  private usedRowsCache = new Map<number, number>();
  constructor(public tabs: BookTab[]) {}

  private spillMap = new Map<number, V>();
  private spillAnchors = new Map<number, { r: number; c: number; rows: number; cols: number }[]>();
  private spillScanned = new Set<number>();
  private spillBusy = false;
  private spillMax = new Map<number, number>();

  invalidate() {
    this.cache.clear();
    this.busy.clear();
    this.usedRowsCache.clear();
    this.spillMap.clear();
    this.spillAnchors.clear();
    this.spillScanned.clear();
    this.spillMax.clear();
  }

  /** Regiões derramadas de uma aba (para exportar os valores). */
  spills(tab: number): { r: number; c: number; rows: number; cols: number }[] {
    this.scanSpills(tab);
    return this.spillAnchors.get(tab) ?? [];
  }

  /** Valor derramado numa célula vazia (ou null). */
  spillValue(tab: number, r: number, c: number): V {
    this.scanSpills(tab);
    return this.spillMap.get(this.key(tab, r, c)) ?? null;
  }

  isSpilled(tab: number, r: number, c: number): boolean {
    this.scanSpills(tab);
    return this.spillMap.has(this.key(tab, r, c));
  }

  private scanSpills(tab: number) {
    if (this.spillScanned.has(tab) || this.spillBusy) return;
    this.spillScanned.add(tab);
    const g = this.tabs[tab]?.grid ?? {};
    const list: [number, number][] = [];
    for (const rk in g) for (const ck in g[rk]) if (g[rk][ck].f !== undefined && SPILL_RE.test(g[rk][ck].f!)) list.push([Number(rk), Number(ck)]);
    if (!list.length) return;
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    this.spillBusy = true;
    try {
      for (const [r, c] of list) this.get(tab, r, c);
    } finally {
      this.spillBusy = false;
    }
  }

  private registerSpill(tab: number, r: number, c: number, res: Arr): V | null {
    const g = this.tabs[tab]?.grid ?? {};
    if (r + res.rows > 100000 || c + res.cols > 702) return E.ref();
    for (let i = 0; i < res.rows; i++)
      for (let j = 0; j < res.cols; j++) {
        if (i === 0 && j === 0) continue;
        const cell = g[r + i]?.[c + j];
        if (cell && (cell.v !== undefined || cell.f !== undefined)) return E.ref();
        if (this.spillMap.has(this.key(tab, r + i, c + j))) return E.ref();
      }
    for (let i = 0; i < res.rows; i++) for (let j = 0; j < res.cols; j++) if (i || j) this.spillMap.set(this.key(tab, r + i, c + j), res.d[i][j] ?? null);
    const l = this.spillAnchors.get(tab) ?? [];
    l.push({ r, c, rows: res.rows, cols: res.cols });
    this.spillAnchors.set(tab, l);
    this.spillMax.set(tab, Math.max(this.spillMax.get(tab) ?? 0, r + res.rows));
    this.usedRowsCache.delete(tab);
    return null;
  }

  tabIndex(name: string | undefined, current: number): number {
    if (name === undefined) return current;
    const low = name.toLowerCase();
    return this.tabs.findIndex((t) => t.name.toLowerCase() === low);
  }

  private key(tab: number, r: number, c: number) {
    return (tab * 1_048_577 + r) * 1024 + c;
  }

  usedRows(tab: number): number {
    let u = this.usedRowsCache.get(tab);
    if (u === undefined) {
      u = 0;
      const g = this.tabs[tab]?.grid ?? {};
      for (const rk in g) if (Number(rk) + 1 > u) u = Number(rk) + 1;
      u = Math.max(u, this.spillMax.get(tab) ?? 0);
      this.usedRowsCache.set(tab, u);
    }
    return u;
  }

  get(tab: number, r: number, c: number): V {
    const cell = this.tabs[tab]?.grid[r]?.[c];
    if (!cell) return this.spillValue(tab, r, c);
    if (cell.f === undefined) return cell.v === undefined ? null : cell.v;
    const k = this.key(tab, r, c);
    const hit = this.cache.get(k);
    if (hit !== undefined) return hit;
    if (this.busy.has(k)) return E.circ();
    this.busy.add(k);
    let val: V;
    try {
      const ast = parseCached(cell.f);
      if (!ast) val = E.erro();
      else {
        const res = evalNode(this, ast, { tab, r, c });
        val = isArr(res) ? (res.d[0]?.[0] ?? null) : res;
        if (isArr(res) && res.rows * res.cols > 1 && SPILL_RE.test(cell.f)) {
          const blocked = this.registerSpill(tab, r, c, res);
          if (blocked) val = blocked;
        }
      }
    } catch (e) {
      val = e instanceof RangeError ? E.erro() : E.value();
    }
    this.busy.delete(k);
    this.cache.set(k, val);
    return val;
  }

  range(tab: number, r1: number, c1: number, r2: number, c2: number): Arr {
    this.scanSpills(tab);
    const last = Math.min(r2, Math.max(this.usedRows(tab) - 1, r1));
    const rows = Math.max(0, last - r1 + 1);
    const cols = c2 - c1 + 1;
    const d: V[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: V[] = new Array(cols);
      for (let c = 0; c < cols; c++) row[c] = this.get(tab, r1 + r, c1 + c);
      d.push(row);
    }
    return { rows, cols, d };
  }

  /** Calcula tudo em ordem de linhas (evita recursão profunda em cadeias longas). */
  warm(tab: number) {
    const g = this.tabs[tab]?.grid ?? {};
    const rows = Object.keys(g)
      .map(Number)
      .sort((a, b) => a - b);
    for (const r of rows) {
      for (const ck in g[r]) if (g[r][ck].f !== undefined) this.get(tab, r, Number(ck));
    }
  }
}

/* ---- coerção ---- */

function toNum(v: V): number | FErr {
  if (v instanceof FErr) return v;
  if (v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const t = v.trim();
  if (t === "") return 0;
  const n = parseNumberText(t.replace(/^R\$\s*/, ""));
  if (n !== null) return n;
  if (/^[+-]?\d+(\.\d+)?%$/.test(t) || /^[+-]?\d+(,\d+)?%$/.test(t)) return Number(t.slice(0, -1).replace(",", ".")) / 100;
  return E.value();
}
export function toText(v: V): string {
  if (v === null) return "";
  if (v instanceof FErr) return v.code;
  if (typeof v === "boolean") return v ? "VERDADEIRO" : "FALSO";
  if (typeof v === "number") return numToText(v);
  return v;
}
function toBool(v: V): boolean | FErr {
  if (v instanceof FErr) return v;
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const u = v.trim().toUpperCase();
  if (u === "TRUE" || u === "VERDADEIRO") return true;
  if (u === "FALSE" || u === "FALSO") return false;
  return E.value();
}

const scalar = (a: A): V => (isArr(a) ? (a.d[0]?.[0] ?? null) : a);

function cmpValues(a: V, b: V): number {
  const rank = (v: V) => (v === null ? 0 : typeof v === "number" ? 1 : typeof v === "string" ? 2 : 3);
  if (a === null && typeof b === "string") a = "";
  else if (b === null && typeof a === "string") b = "";
  else if (a === null && typeof b === "number") a = 0;
  else if (b === null && typeof a === "number") b = 0;
  else if (a === null && typeof b === "boolean") a = false;
  else if (b === null && typeof a === "boolean") b = false;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "pt-BR", { sensitivity: "accent" });
  const x = a === null ? 0 : Number(a);
  const y = b === null ? 0 : Number(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function binScalar(op: string, a: V, b: V): V {
  if (a instanceof FErr) return a;
  if (b instanceof FErr) return b;
  switch (op) {
    case "&":
      return toText(a) + toText(b);
    case "=":
      return cmpValues(a, b) === 0;
    case "<>":
      return cmpValues(a, b) !== 0;
    case "<":
      return cmpValues(a, b) < 0;
    case ">":
      return cmpValues(a, b) > 0;
    case "<=":
      return cmpValues(a, b) <= 0;
    case ">=":
      return cmpValues(a, b) >= 0;
  }
  const x = toNum(a);
  if (x instanceof FErr) return x;
  const y = toNum(b);
  if (y instanceof FErr) return y;
  switch (op) {
    case "+":
      return x + y;
    case "-":
      return x - y;
    case "*":
      return x * y;
    case "/":
      return y === 0 ? E.div0() : x / y;
    case "^": {
      const r = Math.pow(x, y);
      return Number.isFinite(r) ? r : E.num();
    }
  }
  return E.value();
}

function lift(a: A, b: A, f: (x: V, y: V) => V): A {
  if (!isArr(a) && !isArr(b)) return f(a, b);
  const A_ = isArr(a) ? a : null;
  const B_ = isArr(b) ? b : null;
  const rows = Math.max(A_?.rows ?? 1, B_?.rows ?? 1);
  const cols = Math.max(A_?.cols ?? 1, B_?.cols ?? 1);
  const at = (arr: Arr | null, s: A, r: number, c: number): V => (arr ? (arr.d[arr.rows === 1 ? 0 : r]?.[arr.cols === 1 ? 0 : c] ?? null) : (s as V));
  const d: V[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: V[] = [];
    for (let c = 0; c < cols; c++) row.push(f(at(A_, a, r, c), at(B_, b, r, c)));
    d.push(row);
  }
  return { rows, cols, d };
}

function evalNode(book: Book, n: Node, ctx: Ctx): A {
  switch (n.t) {
    case "num":
    case "str":
    case "bool":
      return n.v;
    case "empty":
      return null;
    case "err":
      return new FErr(n.code);
    case "paren":
      return evalNode(book, n.x, ctx);
    case "ref": {
      const tab = book.tabIndex(n.sheet, ctx.tab);
      if (tab < 0) return E.ref();
      return book.get(tab, n.ref.r, n.ref.c);
    }
    case "range": {
      const tab = book.tabIndex(n.sheet, ctx.tab);
      if (tab < 0) return E.ref();
      const r1 = Math.min(n.a.r, n.b.r);
      const r2 = Math.max(n.a.r, n.b.r);
      const c1 = Math.min(n.a.c, n.b.c);
      const c2 = Math.max(n.a.c, n.b.c);
      return book.range(tab, r1, c1, r2, c2);
    }
    case "un": {
      const x = evalNode(book, n.x, ctx);
      return lift(x, 0, (a) => {
        if (a instanceof FErr) return a;
        const v = toNum(a);
        return v instanceof FErr ? v : n.op === "-" ? -v : v;
      });
    }
    case "pct": {
      const x = evalNode(book, n.x, ctx);
      return lift(x, 0, (a) => {
        const v = toNum(a);
        return v instanceof FErr ? v : v / 100;
      });
    }
    case "bin": {
      const l = evalNode(book, n.l, ctx);
      const r = evalNode(book, n.r, ctx);
      return lift(l, r, (a, b) => binScalar(n.op, a, b));
    }
    case "call":
      return callFn(book, n, ctx);
  }
}

/* ---- ajudantes de funções ---- */

function* iterNums(args: A[], strict = false): Generator<number | FErr> {
  for (const a of args) {
    if (isArr(a)) {
      for (const row of a.d)
        for (const v of row) {
          if (v instanceof FErr) yield v;
          else if (typeof v === "number") yield v;
        }
    } else if (a instanceof FErr) yield a;
    else if (a === null) {
      if (strict) yield 0;
    } else {
      const v = toNum(a);
      yield v;
    }
  }
}

function numbers(args: A[]): number[] | FErr {
  const out: number[] = [];
  for (const v of iterNums(args)) {
    if (v instanceof FErr) return v;
    out.push(v);
  }
  return out;
}

function flatten(a: A): V[] {
  return isArr(a) ? a.d.flat() : [a];
}

function wildcardRe(p: string) {
  return new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/~\*/g, "\u0001").replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\u0001/g, "\\*") + "$", "i");
}

function matcher(crit: V): (v: V) => boolean {
  if (typeof crit === "string") {
    const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(crit)!;
    const op = m[1] ?? "=";
    const rhs = m[2];
    const num = rhs.trim() === "" ? null : parseNumberText(rhs.trim());
    const test = (v: V): boolean => {
      if (op === "=" || op === "<>") {
        let eq: boolean;
        if (rhs === "") eq = v === null || v === "";
        else if (num !== null && typeof v === "number") eq = v === num;
        else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") eq = (/[*?]/.test(rhs) ? wildcardRe(rhs) : new RegExp("^" + rhs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i")).test(toText(v));
        else eq = false;
        return op === "=" ? eq : !eq;
      }
      if (v === null || v instanceof FErr) return false;
      if (num !== null && typeof v === "number") return op === "<" ? v < num : op === ">" ? v > num : op === "<=" ? v <= num : v >= num;
      if (typeof v === "string" && num === null) {
        const c = cmpValues(v, rhs);
        return op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0;
      }
      return false;
    };
    return test;
  }
  if (crit instanceof FErr) return () => false;
  return (v) => (crit === null ? v === null : typeof v === typeof crit ? v === crit : false);
}

function criteriaPairs(args: A[], from: number): { rng: V[]; test: (v: V) => boolean }[] | FErr {
  const out: { rng: V[]; test: (v: V) => boolean }[] = [];
  for (let i = from; i + 1 < args.length; i += 2) {
    const rng = flatten(args[i]);
    const cr = scalar(args[i + 1]);
    if (cr instanceof FErr) return cr;
    out.push({ rng, test: matcher(cr) });
  }
  return out;
}

const firstErr = (...vs: V[]) => vs.find((v) => v instanceof FErr) as FErr | undefined;

function callFn(book: Book, n: Extract<Node, { t: "call" }>, ctx: Ctx): A {
  const name = n.name;
  const ev = (i: number): A => (n.args[i] ? evalNode(book, n.args[i], ctx) : null);
  const evs = (): A[] => n.args.map((a) => evalNode(book, a, ctx));
  const argc = n.args.length;
  const num = (i: number, def?: number): number | FErr => {
    if (!n.args[i] || n.args[i].t === "empty") return def ?? E.value();
    return toNum(scalar(ev(i)));
  };
  const txt = (i: number): string | FErr => {
    const v = scalar(ev(i));
    return v instanceof FErr ? v : toText(v);
  };

  const special = callSpecial(book, n, ctx);
  if (special !== undefined) return special;

  // formas especiais (avaliam só o necessário)
  switch (name) {
    case "IF": {
      if (argc < 2) return E.value();
      const c = toBool(scalar(ev(0)));
      if (c instanceof FErr) return c;
      if (c) return ev(1);
      return argc > 2 ? ev(2) : false;
    }
    case "IFS": {
      for (let i = 0; i + 1 < argc; i += 2) {
        const c = toBool(scalar(ev(i)));
        if (c instanceof FErr) return c;
        if (c) return ev(i + 1);
      }
      return E.na();
    }
    case "IFERROR": {
      if (argc < 2) return E.value();
      const v = ev(0);
      const s = scalar(v);
      return s instanceof FErr ? ev(1) : v;
    }
    case "ROW":
      return argc && n.args[0].t === "ref" ? n.args[0].ref.r + 1 : ctx.r + 1;
    case "COLUMN":
      return argc && n.args[0].t === "ref" ? n.args[0].ref.c + 1 : ctx.c + 1;
    case "TODAY":
      return todaySerial();
    case "NOW":
      return nowSerial();
    case "PI":
      return Math.PI;
  }

  const args = evs();
  switch (name) {
    case "SUM": {
      const ns = numbers(args);
      return ns instanceof FErr ? ns : ns.reduce((a, b) => a + b, 0);
    }
    case "PRODUCT": {
      const ns = numbers(args);
      return ns instanceof FErr ? ns : ns.length ? ns.reduce((a, b) => a * b, 1) : 0;
    }
    case "AVERAGE": {
      const ns = numbers(args);
      if (ns instanceof FErr) return ns;
      return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : E.div0();
    }
    case "MEDIAN": {
      const ns = numbers(args);
      if (ns instanceof FErr) return ns;
      if (!ns.length) return E.num();
      ns.sort((a, b) => a - b);
      const m = Math.floor(ns.length / 2);
      return ns.length % 2 ? ns[m] : (ns[m - 1] + ns[m]) / 2;
    }
    case "MIN":
    case "MAX": {
      const ns = numbers(args);
      if (ns instanceof FErr) return ns;
      if (!ns.length) return 0;
      return name === "MIN" ? Math.min(...ns) : Math.max(...ns);
    }
    case "COUNT": {
      let k = 0;
      for (const a of args) {
        if (isArr(a)) {
          for (const row of a.d) for (const v of row) if (typeof v === "number") k++;
        } else if (typeof a === "number" || (typeof a === "string" && parseNumberText(a) !== null)) k++;
      }
      return k;
    }
    case "COUNTA": {
      let k = 0;
      for (const a of args) for (const v of flatten(a)) if (v !== null && v !== "") k++;
      return k;
    }
    case "COUNTBLANK": {
      let k = 0;
      for (const a of args) for (const v of flatten(a)) if (v === null || v === "") k++;
      return k;
    }
    case "SUMIF":
    case "AVERAGEIF": {
      if (argc < 2) return E.value();
      const rng = flatten(args[0]);
      const cr = scalar(args[1]);
      if (cr instanceof FErr) return cr;
      const sum = args[2] !== undefined && n.args[2].t !== "empty" ? flatten(args[2]) : rng;
      const t = matcher(cr);
      let s = 0;
      let k = 0;
      for (let i = 0; i < rng.length; i++) {
        if (!t(rng[i])) continue;
        const v = sum[i];
        if (v instanceof FErr) return v;
        if (typeof v === "number") {
          s += v;
          k++;
        }
      }
      return name === "SUMIF" ? s : k ? s / k : E.div0();
    }
    case "SUMIFS":
    case "AVERAGEIFS":
    case "MAXIFS":
    case "MINIFS": {
      if (argc < 3) return E.value();
      const sum = flatten(args[0]);
      const pairs = criteriaPairs(args, 1);
      if (pairs instanceof FErr) return pairs;
      const vals: number[] = [];
      for (let i = 0; i < sum.length; i++) {
        if (pairs.every((p) => p.test(p.rng[i] ?? null))) {
          const v = sum[i];
          if (v instanceof FErr) return v;
          if (typeof v === "number") vals.push(v);
        }
      }
      if (name === "SUMIFS") return vals.reduce((a, b) => a + b, 0);
      if (name === "AVERAGEIFS") return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : E.div0();
      return vals.length ? (name === "MAXIFS" ? Math.max(...vals) : Math.min(...vals)) : 0;
    }
    case "COUNTIF": {
      if (argc < 2) return E.value();
      const cr = scalar(args[1]);
      if (cr instanceof FErr) return cr;
      const t = matcher(cr);
      return flatten(args[0]).filter(t).length;
    }
    case "COUNTIFS": {
      const pairs = criteriaPairs(args, 0);
      if (pairs instanceof FErr) return pairs;
      if (!pairs.length) return E.value();
      let k = 0;
      for (let i = 0; i < pairs[0].rng.length; i++) if (pairs.every((p) => p.test(p.rng[i] ?? null))) k++;
      return k;
    }
    case "SUMPRODUCT": {
      if (!args.length) return E.value();
      const lists = args.map(flatten);
      let s = 0;
      for (let i = 0; i < lists[0].length; i++) {
        let p = 1;
        for (const l of lists) {
          const v = l[i];
          if (v instanceof FErr) return v;
          p *= typeof v === "number" ? v : 0;
        }
        s += p;
      }
      return s;
    }
    case "VLOOKUP":
    case "HLOOKUP": {
      if (argc < 3 || !isArr(args[1])) return argc < 3 ? E.value() : E.na();
      const key = scalar(args[0]);
      if (key instanceof FErr) return key;
      const tbl = args[1];
      const idx = toNum(scalar(args[2]));
      if (idx instanceof FErr) return idx;
      const approxV = argc > 3 ? toBool(scalar(args[3])) : true;
      if (approxV instanceof FErr) return approxV;
      const horiz = name === "HLOOKUP";
      const len = horiz ? tbl.cols : tbl.rows;
      const span = horiz ? tbl.rows : tbl.cols;
      if (idx < 1 || idx > span) return E.ref();
      const keyAt = (i: number) => (horiz ? tbl.d[0][i] : tbl.d[i][0]);
      const valAt = (i: number) => (horiz ? tbl.d[idx - 1][i] : tbl.d[i][idx - 1]);
      let found = -1;
      if (!approxV) {
        for (let i = 0; i < len; i++) {
          const k = keyAt(i);
          if (k !== null && key !== null && cmpValues(k, key) === 0 && typeof k === typeof key) {
            found = i;
            break;
          }
        }
      } else {
        for (let i = 0; i < len; i++) {
          const k = keyAt(i);
          if (k === null || typeof k !== typeof key) continue;
          if (cmpValues(k, key) <= 0) found = i;
          else break;
        }
      }
      if (found < 0) return E.na();
      return valAt(found);
    }
    case "XLOOKUP": {
      if (argc < 3) return E.value();
      const key = scalar(args[0]);
      const look = flatten(args[1]);
      const ret = args[2];
      const i = look.findIndex((v) => v !== null && key !== null && typeof v === typeof key && cmpValues(v, key) === 0);
      if (i < 0) return argc > 3 ? scalar(args[3]) : E.na();
      const rl = flatten(ret);
      return rl[i] ?? E.na();
    }
    case "INDEX": {
      if (!args.length) return E.value();
      const a = args[0];
      const rr = argc > 1 ? toNum(scalar(args[1])) : 1;
      const cc = argc > 2 ? toNum(scalar(args[2])) : 1;
      if (rr instanceof FErr) return rr;
      if (cc instanceof FErr) return cc;
      if (!isArr(a)) return a;
      let r = rr;
      let c = cc;
      if (a.rows === 1 && argc === 2) {
        c = rr;
        r = 1;
      }
      if (r === 0 || c === 0) return E.value();
      return a.d[r - 1]?.[c - 1] ?? E.ref();
    }
    case "MATCH": {
      if (argc < 2) return E.value();
      const key = scalar(args[0]);
      const list = flatten(args[1]);
      const type = argc > 2 ? toNum(scalar(args[2])) : 1;
      if (type instanceof FErr) return type;
      if (key instanceof FErr) return key;
      if (type === 0) {
        const i = list.findIndex((v) => v !== null && key !== null && typeof v === typeof key && cmpValues(v, key) === 0);
        return i < 0 ? E.na() : i + 1;
      }
      let found = -1;
      for (let i = 0; i < list.length; i++) {
        const k = list[i];
        if (k === null || typeof k !== typeof key) continue;
        const c = cmpValues(k, key);
        if (type > 0 ? c <= 0 : c >= 0) found = i;
        else break;
      }
      return found < 0 ? E.na() : found + 1;
    }
    case "ROUND":
    case "ROUNDUP":
    case "ROUNDDOWN": {
      const x = toNum(scalar(args[0] ?? null));
      const d = argc > 1 ? toNum(scalar(args[1])) : 0;
      if (x instanceof FErr) return x;
      if (d instanceof FErr) return d;
      if (name === "ROUND") return roundTo(x, Math.trunc(d));
      const f = Math.pow(10, Math.trunc(d));
      const s = Math.abs(x) * f;
      const r = name === "ROUNDUP" ? Math.ceil(Number(s.toPrecision(15))) : Math.floor(Number(s.toPrecision(15)));
      return (Math.sign(x) * r) / f;
    }
    case "CEILING":
    case "FLOOR": {
      const x = num(0);
      const s = num(1, 1);
      if (x instanceof FErr) return x;
      if (s instanceof FErr) return s;
      if (s === 0) return 0;
      return (name === "CEILING" ? Math.ceil(x / s) : Math.floor(x / s)) * s;
    }
    case "ABS": {
      const x = num(0);
      return x instanceof FErr ? x : Math.abs(x);
    }
    case "INT": {
      const x = num(0);
      return x instanceof FErr ? x : Math.floor(x);
    }
    case "SQRT": {
      const x = num(0);
      if (x instanceof FErr) return x;
      return x < 0 ? E.num() : Math.sqrt(x);
    }
    case "EXP": {
      const x = num(0);
      return x instanceof FErr ? x : Math.exp(x);
    }
    case "LOG": {
      const x = num(0);
      const b = num(1, 10);
      if (x instanceof FErr) return x;
      if (b instanceof FErr) return b;
      return x <= 0 || b <= 0 || b === 1 ? E.num() : Math.log(x) / Math.log(b);
    }
    case "MOD": {
      const x = num(0);
      const d = num(1);
      if (x instanceof FErr) return x;
      if (d instanceof FErr) return d;
      return d === 0 ? E.div0() : x - d * Math.floor(x / d);
    }
    case "POWER": {
      const x = num(0);
      const y = num(1);
      if (x instanceof FErr) return x;
      if (y instanceof FErr) return y;
      const r = Math.pow(x, y);
      return Number.isFinite(r) ? r : E.num();
    }
    case "AND":
    case "OR": {
      const bs: boolean[] = [];
      for (const a of args)
        for (const v of flatten(a)) {
          if (v === null) continue;
          const b = toBool(v);
          if (b instanceof FErr) return b;
          bs.push(b);
        }
      if (!bs.length) return E.value();
      return name === "AND" ? bs.every(Boolean) : bs.some(Boolean);
    }
    case "NOT": {
      const b = toBool(scalar(args[0] ?? null));
      return b instanceof FErr ? b : !b;
    }
    case "CONCATENATE":
    case "CONCAT": {
      let s = "";
      for (const a of args)
        for (const v of flatten(a)) {
          if (v instanceof FErr) return v;
          s += toText(v);
        }
      return s;
    }
    case "TEXTJOIN": {
      const sep = txt(0);
      if (sep instanceof FErr) return sep;
      const skip = toBool(scalar(args[1] ?? false));
      const parts: string[] = [];
      for (const a of args.slice(2))
        for (const v of flatten(a)) {
          if (v instanceof FErr) return v;
          if ((v === null || v === "") && skip === true) continue;
          parts.push(toText(v));
        }
      return parts.join(sep);
    }
    case "TEXT": {
      const v = scalar(args[0] ?? null);
      const f = txt(1);
      if (v instanceof FErr) return v;
      if (f instanceof FErr) return f;
      if (typeof v === "string") return v;
      const x = toNum(v);
      if (x instanceof FErr) return x;
      return formatPattern(x, f.replace(/aaaa/gi, "yyyy").replace(/(?<![A-Za-z])aa(?![A-Za-z])/gi, "yy"), guessPatternDecimal(f));
    }
    case "VALUE": {
      const v = scalar(args[0] ?? null);
      if (v instanceof FErr) return v;
      return toNum(v);
    }
    case "LEN": {
      const s = txt(0);
      return s instanceof FErr ? s : s.length;
    }
    case "UPPER":
    case "LOWER":
    case "TRIM":
    case "PROPER": {
      const s = txt(0);
      if (s instanceof FErr) return s;
      if (name === "UPPER") return s.toUpperCase();
      if (name === "LOWER") return s.toLowerCase();
      if (name === "TRIM") return s.trim().replace(/\s+/g, " ");
      return s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
    }
    case "LEFT":
    case "RIGHT": {
      const s = txt(0);
      const k = num(1, 1);
      if (s instanceof FErr) return s;
      if (k instanceof FErr) return k;
      if (k < 0) return E.value();
      return name === "LEFT" ? s.slice(0, k) : k === 0 ? "" : s.slice(-k);
    }
    case "MID": {
      const s = txt(0);
      const st = num(1);
      const k = num(2);
      if (s instanceof FErr) return s;
      if (st instanceof FErr) return st;
      if (k instanceof FErr) return k;
      if (st < 1 || k < 0) return E.value();
      return s.slice(st - 1, st - 1 + k);
    }
    case "SUBSTITUTE": {
      const s = txt(0);
      const a = txt(1);
      const b = txt(2);
      if (s instanceof FErr) return s;
      if (a instanceof FErr) return a;
      if (b instanceof FErr) return b;
      if (a === "") return s;
      if (n.args[3] && n.args[3].t !== "empty") {
        const k = num(3);
        if (k instanceof FErr) return k;
        let pos = -1;
        for (let i = 0; i < Math.trunc(k); i++) {
          pos = s.indexOf(a, pos + 1);
          if (pos < 0) return s;
        }
        return Math.trunc(k) < 1 ? E.value() : s.slice(0, pos) + b + s.slice(pos + a.length);
      }
      return s.split(a).join(b);
    }
    case "REPT": {
      const s = txt(0);
      const k = num(1);
      if (s instanceof FErr) return s;
      if (k instanceof FErr) return k;
      return k < 0 || k > 10000 ? E.value() : s.repeat(k);
    }
    case "DATE": {
      const y = num(0);
      const m = num(1);
      const d = num(2);
      if (y instanceof FErr) return y;
      if (m instanceof FErr) return m;
      if (d instanceof FErr) return d;
      const yy = y < 100 ? y + 1900 : y;
      return serialFromYMD(yy, 1, 1) + (Date.UTC(yy, Math.trunc(m) - 1, Math.trunc(d)) - Date.UTC(yy, 0, 1)) / 86_400_000;
    }
    case "YEAR":
    case "MONTH":
    case "DAY":
    case "WEEKDAY": {
      const x = num(0);
      if (x instanceof FErr) return x;
      const p = ymdFromSerial(x);
      if (name === "YEAR") return p.y;
      if (name === "MONTH") return p.m;
      if (name === "DAY") return p.d;
      const t = num(1, 1);
      if (t instanceof FErr) return t;
      return t === 2 ? ((p.wd + 6) % 7) + 1 : p.wd + 1;
    }
    case "DAYS": {
      const a = num(0);
      const b = num(1);
      if (a instanceof FErr) return a;
      if (b instanceof FErr) return b;
      return Math.floor(a) - Math.floor(b);
    }
    case "EDATE":
    case "EOMONTH": {
      const x = num(0);
      const k = num(1);
      if (x instanceof FErr) return x;
      if (k instanceof FErr) return k;
      const p = ymdFromSerial(x);
      if (name === "EOMONTH") return serialFromYMD(p.y, p.m + Math.trunc(k) + 1, 0);
      const mm = p.m - 1 + Math.trunc(k);
      const lastDay = new Date(Date.UTC(p.y, mm + 1, 0)).getUTCDate();
      return serialFromYMD(p.y, mm + 1, Math.min(p.d, lastDay));
    }
    case "ISBLANK":
      return scalar(args[0] ?? null) === null;
    case "ISNUMBER":
      return typeof scalar(args[0] ?? null) === "number";
    case "ISTEXT":
      return typeof scalar(args[0] ?? null) === "string";
    case "ISERROR":
      return scalar(args[0] ?? null) instanceof FErr;
  }
  void firstErr;
  return callMore(book, n, args);
}

/* ================================ funções adicionais ================================ */

const MS_DAY = 86_400_000;
const mkArr = (d: V[][]): Arr => ({ rows: d.length, cols: d[0]?.length ?? 0, d });
const constNode = (v: V): Node => (v === null ? { t: "empty" } : v instanceof FErr ? { t: "err", code: v.code } : typeof v === "number" ? { t: "num", v } : typeof v === "boolean" ? { t: "bool", v } : { t: "str", v });

/** Funções que, dentro de ARRAYFORMULA, são aplicadas elemento a elemento quando recebem intervalos. */
const ELEMENTWISE = new Set(["IF", "IFERROR", "IFNA", "ROUND", "ROUNDUP", "ROUNDDOWN", "TRUNC", "ABS", "INT", "SQRT", "SIGN", "MOD", "POWER", "UPPER", "LOWER", "PROPER", "TRIM", "LEN", "LEFT", "RIGHT", "MID", "TEXT", "VALUE", "SUBSTITUTE", "ISBLANK", "ISNUMBER", "ISTEXT", "ISERROR", "NOT", "YEAR", "MONTH", "DAY", "WEEKDAY", "DATEVALUE", "EDATE", "EOMONTH", "DATEDIF", "DAYS", "CHOOSE", "SWITCH"]);

function serialDow(s: number): number {
  const f = Math.floor(s);
  return f >= 61 ? (f + 6) % 7 : ymdFromSerial(f).wd;
}

function isoWeekOf(serial: number): number {
  const p = ymdFromSerial(serial);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((dt.getTime() - firstThu.getTime()) / MS_DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

function weekNumOf(serial: number, type: number): number | FErr {
  if (type === 21) return isoWeekOf(serial);
  const start = type === 1 ? 0 : type === 2 || type === 11 ? 1 : type >= 12 && type <= 16 ? type - 10 : type === 17 ? 0 : -1;
  if (start < 0) return E.num();
  const p = ymdFromSerial(serial);
  const jan1 = serialFromYMD(p.y, 1, 1);
  const off = (serialDow(jan1) - start + 7) % 7;
  return Math.floor((Math.floor(serial) - jan1 + off) / 7) + 1;
}

function weekendMask(v: V | undefined): boolean[] | FErr {
  const m = [false, false, false, false, false, false, false]; // índice = dia JS (0 = domingo)
  if (v === undefined || v === null) {
    m[6] = m[0] = true;
    return m;
  }
  if (typeof v === "string" && /^[01]{7}$/.test(v)) {
    for (let i = 0; i < 7; i++) if (v[i] === "1") m[(i + 1) % 7] = true;
    return m;
  }
  const k = toNum(v);
  if (k instanceof FErr) return k;
  if (k >= 1 && k <= 7) {
    m[(k - 2 + 7) % 7] = true;
    m[(k - 1) % 7] = true;
    return m;
  }
  if (k >= 11 && k <= 17) {
    m[k - 11] = true;
    return m;
  }
  return E.num();
}

function holidaysOf(a: A | undefined): Set<number> | FErr {
  const out = new Set<number>();
  if (a === undefined) return out;
  for (const v of flatten(a)) {
    if (v === null || v === "") continue;
    const x = toNum(v);
    if (x instanceof FErr) return x;
    out.add(Math.floor(x));
  }
  return out;
}

function networkdays(s: number, e: number, mask: boolean[], hol: Set<number>): number | FErr {
  const a = Math.floor(Math.min(s, e));
  const b = Math.floor(Math.max(s, e));
  if (b - a > 366000) return E.num();
  let k = 0;
  for (let d = a; d <= b; d++) if (!mask[serialDow(d)] && !hol.has(d)) k++;
  return s <= e ? k : -k;
}

function workday(s: number, days: number, mask: boolean[], hol: Set<number>): number | FErr {
  if (mask.every(Boolean)) return E.value();
  let d = Math.floor(s);
  const step = days < 0 ? -1 : 1;
  let left = Math.min(Math.abs(Math.trunc(days)), 200000);
  while (left > 0) {
    d += step;
    if (!mask[serialDow(d)] && !hol.has(d)) left--;
  }
  return d;
}

const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function datedif(s: number, e: number, unit: string): number | FErr {
  if (e < s) return E.num();
  const a = ymdFromSerial(s);
  const b = ymdFromSerial(e);
  const before = b.d < a.d;
  switch (unit) {
    case "Y":
      return b.y - a.y - (b.m < a.m || (b.m === a.m && before) ? 1 : 0);
    case "M":
      return (b.y - a.y) * 12 + (b.m - a.m) - (before ? 1 : 0);
    case "D":
      return Math.floor(e) - Math.floor(s);
    case "MD":
      return before ? b.d - a.d + dim(b.m === 1 ? b.y - 1 : b.y, b.m === 1 ? 12 : b.m - 1) : b.d - a.d;
    case "YM":
      return (((b.m - a.m - (before ? 1 : 0)) % 12) + 12) % 12;
    case "YD": {
      const y = b.m > a.m || (b.m === a.m && b.d >= a.d) ? b.y : b.y - 1;
      return Math.floor(e) - serialFromYMD(y, a.m, a.d);
    }
  }
  return E.num();
}

function yearfrac(s0: number, e0: number, basis: number): number | FErr {
  const s = Math.min(s0, e0);
  const e = Math.max(s0, e0);
  const a = ymdFromSerial(s);
  const b = ymdFromSerial(e);
  const days = Math.floor(e) - Math.floor(s);
  switch (basis) {
    case 0:
    case 4: {
      let d1 = a.d;
      let d2 = b.d;
      if (d1 === 31) d1 = 30;
      if (d2 === 31 && (basis === 4 || d1 >= 30)) d2 = 30;
      return (360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1)) / 360;
    }
    case 1: {
      if (a.y === b.y) return days / (isLeap(a.y) ? 366 : 365);
      let tot = 0;
      for (let y = a.y; y <= b.y; y++) tot += isLeap(y) ? 366 : 365;
      return days / (tot / (b.y - a.y + 1));
    }
    case 2:
      return days / 360;
    case 3:
      return days / 365;
  }
  return E.num();
}

/* ---- financeiras ---- */
const fvCalc = (r: number, n: number, p: number, pv: number, t: number) => (r === 0 ? -(pv + p * n) : -(pv * Math.pow(1 + r, n) + (p * (1 + r * t) * (Math.pow(1 + r, n) - 1)) / r));
const pmtCalc = (r: number, n: number, pv: number, fv: number, t: number) => (r === 0 ? -(pv + fv) / n : -(r * (pv * Math.pow(1 + r, n) + fv)) / ((1 + r * t) * (Math.pow(1 + r, n) - 1)));

function irrCalc(vals: number[], guess: number): number | FErr {
  if (!vals.some((v) => v > 0) || !vals.some((v) => v < 0)) return E.num();
  const f = (r: number) => vals.reduce((s, v, i) => s + v / Math.pow(1 + r, i), 0);
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const y = f(r);
    const h = 1e-6;
    const dy = (f(r + h) - y) / h;
    if (!Number.isFinite(dy) || dy === 0) break;
    const nr = r - y / dy;
    if (!Number.isFinite(nr) || nr <= -1) break;
    if (Math.abs(nr - r) < 1e-10) return nr;
    r = nr;
  }
  let lo = -0.9999;
  let hi = 10;
  const flo = f(lo);
  if (flo * f(hi) > 0) return E.num();
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo * fm < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function rateCalc(n: number, p: number, pv: number, fv: number, t: number, guess: number): number | FErr {
  const f = (r: number) => (r === 0 ? pv + p * n + fv : pv * Math.pow(1 + r, n) + (p * (1 + r * t) * (Math.pow(1 + r, n) - 1)) / r + fv);
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const y = f(r);
    const h = 1e-7;
    const dy = (f(r + h) - y) / h;
    if (!Number.isFinite(dy) || dy === 0) return E.num();
    const nr = r - y / dy;
    if (!Number.isFinite(nr) || nr <= -1) return E.num();
    if (Math.abs(nr - r) < 1e-10) return nr;
    r = nr;
  }
  return E.num();
}

function stats(ns: number[], sample: boolean, variance: boolean): number | FErr {
  const k = ns.length;
  if (sample ? k < 2 : k < 1) return E.div0();
  const mean = ns.reduce((a, b) => a + b, 0) / k;
  const ss = ns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (sample ? k - 1 : k);
  return variance ? ss : Math.sqrt(ss);
}

function percentile(ns: number[], k: number): number | FErr {
  if (!ns.length || k < 0 || k > 1) return E.num();
  const s = [...ns].sort((a, b) => a - b);
  const pos = k * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));

function keyOf(v: V): string {
  return v === null ? "n:" : v instanceof FErr ? "e:" + v.code : typeof v === "string" ? "s:" + v.toLowerCase() : typeof v === "number" ? "d:" + v : "b:" + v;
}

/** Junta valores das referências (para SUBTOTAL/AGREGAR), ignorando linhas ocultas e subtotais aninhados. */
function collectCells(book: Book, nodes: Node[], ctx: Ctx, hidden: "none" | "filter" | "all", skipNested: boolean, skipErrors: boolean): V[] {
  const out: V[] = [];
  for (const nd of nodes) {
    if (nd.t === "ref" || nd.t === "range") {
      const tab = book.tabIndex(nd.sheet, ctx.tab);
      if (tab < 0) return [E.ref()];
      const a = nd.t === "ref" ? nd.ref : nd.a;
      const b = nd.t === "ref" ? nd.ref : nd.b;
      const r1 = Math.min(a.r, b.r);
      const r2 = Math.min(Math.max(a.r, b.r), Math.max(book.usedRows(tab) - 1, r1));
      const c1 = Math.min(a.c, b.c);
      const c2 = Math.max(a.c, b.c);
      const bt = book.tabs[tab];
      let hf: Set<number> | undefined;
      if (hidden !== "none" && bt.hiddenFilter) {
        if (typeof bt.hiddenFilter === "function") hf = bt.hiddenFilterCache ??= bt.hiddenFilter();
        else hf = bt.hiddenFilter;
      }
      for (let r = r1; r <= r2; r++) {
        if (hf?.has(r)) continue;
        if (hidden === "all" && bt.hiddenManual?.has(r)) continue;
        for (let c = c1; c <= c2; c++) {
          if (skipNested) {
            const f = bt.grid[r]?.[c]?.f;
            if (f && /\b(SUBTOTAL|AGGREGATE)\(/.test(f)) continue;
          }
          const v = book.get(tab, r, c);
          if (skipErrors && v instanceof FErr) continue;
          out.push(v);
        }
      }
    } else {
      for (const v of flatten(evalNode(book, nd, ctx))) if (!(skipErrors && v instanceof FErr)) out.push(v);
    }
  }
  return out;
}

function aggregateBy(code: number, vals: V[], k?: number): V {
  const err = vals.find((v) => v instanceof FErr);
  if (err) return err;
  const ns = vals.filter((v): v is number => typeof v === "number");
  switch (code) {
    case 1:
      return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : E.div0();
    case 2:
      return ns.length;
    case 3:
      return vals.filter((v) => v !== null && v !== "").length;
    case 4:
      return ns.length ? Math.max(...ns) : 0;
    case 5:
      return ns.length ? Math.min(...ns) : 0;
    case 6:
      return ns.length ? ns.reduce((a, b) => a * b, 1) : 0;
    case 7:
      return stats(ns, true, false);
    case 8:
      return stats(ns, false, false);
    case 9:
      return ns.reduce((a, b) => a + b, 0);
    case 10:
      return stats(ns, true, true);
    case 11:
      return stats(ns, false, true);
    case 12: {
      if (!ns.length) return E.num();
      const s = [...ns].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    case 13: {
      const cnt = new Map<number, number>();
      let best: number | null = null;
      let bc = 1;
      for (const x of ns) cnt.set(x, (cnt.get(x) ?? 0) + 1);
      for (const x of ns) {
        if ((cnt.get(x) ?? 0) > bc) {
          best = x;
          bc = cnt.get(x)!;
        }
      }
      return best ?? E.na();
    }
    case 14:
    case 15: {
      if (k === undefined || k < 1 || k > ns.length) return E.num();
      const s = [...ns].sort((a, b) => (code === 14 ? b - a : a - b));
      return s[Math.trunc(k) - 1];
    }
  }
  return E.value();
}

/** Formas especiais: precisam das referências (não só dos valores) ou controlam a avaliação. */
function callSpecial(book: Book, n: Extract<Node, { t: "call" }>, ctx: Ctx): A | undefined {
  const name = n.name;
  switch (name) {
    case "ARRAYFORMULA":
      return n.args[0] ? evalNode(book, n.args[0], { ...ctx, arr: true }) : E.value();
    case "SUBTOTAL":
    case "AGGREGATE": {
      const isAgg = name === "AGGREGATE";
      const code = toNum(scalar(evalNode(book, n.args[0] ?? { t: "empty" }, ctx)));
      if (code instanceof FErr) return code;
      const opt = isAgg ? toNum(scalar(evalNode(book, n.args[1] ?? { t: "empty" }, ctx))) : 0;
      if (opt instanceof FErr) return opt;
      let fn = Math.trunc(code);
      let hidden: "none" | "filter" | "all" = "none";
      if (!isAgg) {
        if (fn >= 101 && fn <= 111) {
          hidden = "all";
          fn -= 100;
        } else hidden = "filter";
        if (fn < 1 || fn > 11) return E.value();
      } else {
        if (fn < 1 || fn > 15) return E.value();
        if ([1, 3, 5, 7].includes(Math.trunc(opt))) hidden = "all";
      }
      const rest = n.args.slice(isAgg ? 2 : 1);
      if (!rest.length) return E.value();
      let kArg: number | undefined;
      let nodes = rest;
      if (isAgg && fn >= 14) {
        const kv = toNum(scalar(evalNode(book, rest[rest.length - 1], ctx)));
        if (kv instanceof FErr) return kv;
        kArg = kv;
        nodes = rest.slice(0, -1);
      }
      const vals = collectCells(book, nodes, ctx, hidden, !isAgg || fn <= 13, isAgg && [2, 3, 6, 7].includes(Math.trunc(opt)));
      return aggregateBy(fn, vals, kArg);
    }
    case "OFFSET": {
      const base = n.args[0];
      if (!base || (base.t !== "ref" && base.t !== "range")) return E.value();
      const tab = book.tabIndex(base.sheet, ctx.tab);
      if (tab < 0) return E.ref();
      const a = base.t === "ref" ? base.ref : base.a;
      const b = base.t === "ref" ? base.ref : base.b;
      const nv = (i: number, def: number): number | FErr => (!n.args[i] || n.args[i].t === "empty" ? def : toNum(scalar(evalNode(book, n.args[i], ctx))));
      const dr = nv(1, 0);
      const dc = nv(2, 0);
      const h = nv(3, Math.abs(b.r - a.r) + 1);
      const w = nv(4, Math.abs(b.c - a.c) + 1);
      for (const x of [dr, dc, h, w]) if (x instanceof FErr) return x;
      const r1 = Math.min(a.r, b.r) + Math.trunc(dr as number);
      const c1 = Math.min(a.c, b.c) + Math.trunc(dc as number);
      const hh = Math.trunc(h as number);
      const ww = Math.trunc(w as number);
      if (r1 < 0 || c1 < 0 || hh < 1 || ww < 1) return E.ref();
      return hh === 1 && ww === 1 ? book.get(tab, r1, c1) : book.range(tab, r1, c1, r1 + hh - 1, c1 + ww - 1);
    }
    case "INDIRECT": {
      const t = scalar(evalNode(book, n.args[0] ?? { t: "empty" }, ctx));
      if (t instanceof FErr) return t;
      let nd: Node;
      try {
        nd = parseFormula(toText(t));
      } catch {
        return E.ref();
      }
      if (nd.t !== "ref" && nd.t !== "range") return E.ref();
      return evalNode(book, nd, ctx);
    }
  }
  if (ctx.arr && ELEMENTWISE.has(name)) {
    const vals = n.args.map((a) => evalNode(book, a, ctx));
    const inner = { ...ctx, arr: false };
    if (!vals.some(isArr)) return callFn(book, { ...n, args: vals.map((v) => constNode(scalar(v))) }, inner);
    const arrs = vals.filter(isArr);
    const rows = Math.max(...arrs.map((x) => x.rows));
    const cols = Math.max(...arrs.map((x) => x.cols));
    const d: V[][] = [];
    for (let i = 0; i < rows; i++) {
      const row: V[] = [];
      for (let j = 0; j < cols; j++) {
        const args = vals.map((v) => (isArr(v) ? (v.d[v.rows === 1 ? 0 : i]?.[v.cols === 1 ? 0 : j] ?? null) : v));
        row.push(scalar(callFn(book, { ...n, args: args.map(constNode) }, inner)));
      }
      d.push(row);
    }
    return mkArr(d);
  }
  return undefined;
}

function callMore(book: Book, n: Extract<Node, { t: "call" }>, args: A[]): A {
  void book;
  const name = n.name;
  const argc = n.args.length;
  const has = (i: number) => !!n.args[i] && n.args[i].t !== "empty";
  const num = (i: number, def?: number): number | FErr => (!has(i) ? (def ?? E.value()) : toNum(scalar(args[i])));
  const str = (i: number, def = ""): string | FErr => {
    if (!has(i)) return def;
    const v = scalar(args[i]);
    return v instanceof FErr ? v : toText(v);
  };
  const nums2 = (...idx: number[]): number[] | FErr => {
    const out: number[] = [];
    for (const i of idx) {
      const x = num(i);
      if (x instanceof FErr) return x;
      out.push(x);
    }
    return out;
  };
  const simple = (f: (x: number) => number): A => {
    const x = num(0);
    if (x instanceof FErr) return x;
    const r = f(x);
    return Number.isFinite(r) ? r : E.num();
  };

  switch (name) {
    /* ---- matemática ---- */
    case "TRUNC": {
      const x = num(0);
      const d = num(1, 0);
      if (x instanceof FErr) return x;
      if (d instanceof FErr) return d;
      const f = Math.pow(10, Math.trunc(d));
      return Math.trunc(Number((x * f).toPrecision(15))) / f;
    }
    case "SIGN":
      return simple(Math.sign);
    case "RAND":
      return Math.random();
    case "RANDBETWEEN": {
      const v = nums2(0, 1);
      if (v instanceof FErr) return v;
      const lo = Math.ceil(v[0]);
      const hi = Math.floor(v[1]);
      return hi < lo ? E.num() : lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    case "MROUND": {
      const v = nums2(0, 1);
      if (v instanceof FErr) return v;
      if (v[1] === 0) return 0;
      if (v[0] * v[1] < 0) return E.num();
      return Math.round(v[0] / v[1]) * v[1];
    }
    case "SUMSQ": {
      const ns = numbers(args);
      return ns instanceof FErr ? ns : ns.reduce((a, b) => a + b * b, 0);
    }
    case "GCD":
    case "LCM": {
      const ns = numbers(args);
      if (ns instanceof FErr) return ns;
      if (!ns.length || ns.some((x) => x < 0)) return E.num();
      const ints = ns.map(Math.trunc);
      return ints.reduce((a, b) => (name === "GCD" ? gcd2(a, b) : a === 0 || b === 0 ? 0 : (a / gcd2(a, b)) * b));
    }
    case "FACT": {
      const x = num(0);
      if (x instanceof FErr) return x;
      const k = Math.trunc(x);
      if (k < 0 || k > 170) return E.num();
      let r = 1;
      for (let i = 2; i <= k; i++) r *= i;
      return r;
    }
    case "COMBIN": {
      const v = nums2(0, 1);
      if (v instanceof FErr) return v;
      const [a, b] = v.map(Math.trunc);
      if (a < 0 || b < 0 || b > a) return E.num();
      let r = 1;
      for (let i = 1; i <= Math.min(b, a - b); i++) r = (r * (a - i + 1)) / i;
      return Math.round(r);
    }
    case "LN":
      return simple((x) => (x > 0 ? Math.log(x) : NaN));
    case "LOG10":
      return simple((x) => (x > 0 ? Math.log10(x) : NaN));
    case "SIN":
      return simple(Math.sin);
    case "COS":
      return simple(Math.cos);
    case "TAN":
      return simple(Math.tan);
    case "ATAN":
      return simple(Math.atan);
    case "DEGREES":
      return simple((x) => (x * 180) / Math.PI);
    case "RADIANS":
      return simple((x) => (x * Math.PI) / 180);

    /* ---- estatística ---- */
    case "SMALL":
    case "LARGE": {
      const ns = numbers([args[0] ?? null]);
      const k = num(1);
      if (ns instanceof FErr) return ns;
      if (k instanceof FErr) return k;
      if (k < 1 || k > ns.length) return E.num();
      ns.sort((a, b) => (name === "SMALL" ? a - b : b - a));
      return ns[Math.trunc(k) - 1];
    }
    case "RANK": {
      const x = num(0);
      const ns = numbers([args[1] ?? null]);
      const ord = num(2, 0);
      if (x instanceof FErr) return x;
      if (ns instanceof FErr) return ns;
      if (ord instanceof FErr) return ord;
      if (!ns.includes(x)) return E.na();
      return 1 + ns.filter((y) => (ord === 0 ? y > x : y < x)).length;
    }
    case "PERCENTILE":
    case "QUARTILE": {
      const ns = numbers([args[0] ?? null]);
      const k = num(1);
      if (ns instanceof FErr) return ns;
      if (k instanceof FErr) return k;
      if (name === "QUARTILE") return Number.isInteger(k) && k >= 0 && k <= 4 ? percentile(ns, k / 4) : E.num();
      return percentile(ns, k);
    }
    case "PERCENTRANK": {
      const ns = numbers([args[0] ?? null]);
      const x = num(1);
      if (ns instanceof FErr) return ns;
      if (x instanceof FErr) return x;
      const s = [...ns].sort((a, b) => a - b);
      if (!s.length || x < s[0] || x > s[s.length - 1]) return E.na();
      if (s.length === 1) return 1;
      let i = 0;
      while (i < s.length - 2 && s[i + 1] <= x) i++;
      const frac = s[i + 1] === s[i] ? 0 : (x - s[i]) / (s[i + 1] - s[i]);
      return Math.floor(((i + frac) / (s.length - 1)) * 1000 + 1e-9) / 1000;
    }
    case "STDEV":
    case "STDEV.S":
    case "STDEV.P":
    case "VAR":
    case "VAR.S":
    case "VAR.P": {
      const ns = numbers(args);
      if (ns instanceof FErr) return ns;
      return stats(ns, !name.endsWith(".P"), name.startsWith("VAR"));
    }
    case "MODE": {
      const ns = numbers(args);
      if (ns instanceof FErr) return ns;
      return aggregateBy(13, ns);
    }
    case "COUNTUNIQUE": {
      const seen = new Set<string>();
      for (const a of args) for (const v of flatten(a)) if (v !== null && v !== "") seen.add(keyOf(v));
      return seen.size;
    }

    /* ---- lógica ---- */
    case "IFNA": {
      if (argc < 2) return E.value();
      const s = scalar(args[0]);
      return s instanceof FErr && s.code === "#N/A" ? args[1] : args[0];
    }
    case "XOR": {
      let k = 0;
      for (const a of args)
        for (const v of flatten(a)) {
          if (v === null) continue;
          const b = toBool(v);
          if (b instanceof FErr) return b;
          if (b) k++;
        }
      return k % 2 === 1;
    }
    case "SWITCH": {
      if (argc < 3) return E.value();
      const x = scalar(args[0]);
      if (x instanceof FErr) return x;
      let i = 1;
      for (; i + 1 < argc; i += 2) {
        const c = scalar(args[i]);
        if (c instanceof FErr) return c;
        if ((typeof c === typeof x && cmpValues(c, x) === 0) || (x === null && c === "")) return args[i + 1];
      }
      return i < argc ? args[i] : E.na();
    }
    case "CHOOSE": {
      const k = num(0);
      if (k instanceof FErr) return k;
      const i = Math.trunc(k);
      return i >= 1 && i < argc ? args[i] : E.value();
    }
    case "TRUE":
      return true;
    case "FALSE":
      return false;
    case "ISLOGICAL":
      return typeof scalar(args[0] ?? null) === "boolean";
    case "ISNA": {
      const s = scalar(args[0] ?? null);
      return s instanceof FErr && s.code === "#N/A";
    }
    case "ISERR": {
      const s = scalar(args[0] ?? null);
      return s instanceof FErr && s.code !== "#N/A";
    }
    case "ISEVEN":
    case "ISODD": {
      const x = num(0);
      if (x instanceof FErr) return x;
      const odd = Math.abs(Math.trunc(x)) % 2 === 1;
      return name === "ISODD" ? odd : !odd;
    }
    case "N": {
      const s = scalar(args[0] ?? null);
      if (s instanceof FErr) return s;
      return typeof s === "number" ? s : typeof s === "boolean" ? (s ? 1 : 0) : 0;
    }
    case "NA":
      return E.na();

    /* ---- texto ---- */
    case "FIND":
    case "SEARCH": {
      const needle = str(0);
      const hay = str(1);
      const st = num(2, 1);
      if (needle instanceof FErr) return needle;
      if (hay instanceof FErr) return hay;
      if (st instanceof FErr) return st;
      if (st < 1 || st > hay.length + 1) return E.value();
      let pos: number;
      if (name === "FIND") pos = hay.indexOf(needle, st - 1);
      else {
        const body = wildcardRe(needle).source.slice(1, -1);
        const m = new RegExp(body, "i").exec(hay.slice(st - 1));
        pos = m ? m.index + st - 1 : -1;
      }
      return pos < 0 ? E.value() : pos + 1;
    }
    case "REPLACE": {
      const s = str(0);
      const v = nums2(1, 2);
      const nw = str(3);
      if (s instanceof FErr) return s;
      if (v instanceof FErr) return v;
      if (nw instanceof FErr) return nw;
      if (v[0] < 1 || v[1] < 0) return E.value();
      return s.slice(0, v[0] - 1) + nw + s.slice(v[0] - 1 + v[1]);
    }
    case "EXACT": {
      const a = str(0);
      const b = str(1);
      if (a instanceof FErr) return a;
      if (b instanceof FErr) return b;
      return a === b;
    }
    case "CHAR": {
      const x = num(0);
      if (x instanceof FErr) return x;
      return x >= 1 && x <= 65535 ? String.fromCharCode(Math.trunc(x)) : E.value();
    }
    case "CODE": {
      const s = str(0);
      if (s instanceof FErr) return s;
      return s === "" ? E.value() : s.charCodeAt(0);
    }
    case "CLEAN": {
      const s = str(0);
      return s instanceof FErr ? s : s.replace(/[\u0000-\u001f]/g, "");
    }
    case "NUMBERVALUE": {
      const s = str(0);
      const dec = str(1, ",");
      const grp = str(2, ".");
      if (s instanceof FErr) return s;
      if (dec instanceof FErr) return dec;
      if (grp instanceof FErr) return grp;
      let t = s.replace(/\s/g, "");
      if (grp) t = t.split(grp).join("");
      if (dec && dec !== ".") t = t.split(dec).join(".");
      let pct = 0;
      while (t.endsWith("%")) {
        t = t.slice(0, -1);
        pct++;
      }
      if (t === "") return 0;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return E.value();
      return Number(t) / Math.pow(100, pct);
    }
    case "FIXED": {
      const x = num(0);
      const d = num(1, 2);
      const nc = has(2) ? toBool(scalar(args[2])) : false;
      if (x instanceof FErr) return x;
      if (d instanceof FErr) return d;
      if (nc instanceof FErr) return nc;
      const t = formatValue(x, `n:${Math.max(0, Math.trunc(d))}`);
      return nc ? t.replace(/\./g, "") : t;
    }
    case "DOLLAR": {
      const x = num(0);
      const d = num(1, 2);
      if (x instanceof FErr) return x;
      if (d instanceof FErr) return d;
      return formatValue(x, `brl:${Math.max(0, Math.trunc(d))}`);
    }
    case "TEXTBEFORE":
    case "TEXTAFTER": {
      const s = str(0);
      const dl = str(1);
      const k = num(2, 1);
      if (s instanceof FErr) return s;
      if (dl instanceof FErr) return dl;
      if (k instanceof FErr) return k;
      if (dl === "" || k === 0) return E.value();
      const idxs: number[] = [];
      for (let p = s.indexOf(dl); p >= 0; p = s.indexOf(dl, p + dl.length)) idxs.push(p);
      const kk = Math.trunc(k);
      const at = kk > 0 ? idxs[kk - 1] : idxs[idxs.length + kk];
      if (at === undefined) return E.na();
      return name === "TEXTBEFORE" ? s.slice(0, at) : s.slice(at + dl.length);
    }
    case "SPLIT": {
      const s = str(0);
      const dl = str(1);
      const each = has(2) ? toBool(scalar(args[2])) : true;
      if (s instanceof FErr) return s;
      if (dl instanceof FErr) return dl;
      if (each instanceof FErr) return each;
      let parts: string[];
      if (dl === "") parts = [s];
      else if (each) {
        const set = new Set(dl.split(""));
        parts = [];
        let cur = "";
        for (const ch of s) {
          if (set.has(ch)) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        parts.push(cur);
      } else parts = s.split(dl);
      parts = parts.filter((p) => p !== "");
      if (!parts.length) return "";
      return mkArr([parts.map((p) => (parseNumberText(p) ?? p) as V)]);
    }

    /* ---- data e hora ---- */
    case "DATEVALUE": {
      const s = str(0);
      if (s instanceof FErr) return s;
      const p = parseTyped(s);
      return typeof p.v === "number" && (p.fmt === "date" || p.fmt === "datetime") ? Math.floor(p.v) : E.value();
    }
    case "TIMEVALUE": {
      const s = str(0);
      if (s instanceof FErr) return s;
      const p = parseTyped(s);
      return typeof p.v === "number" && (p.fmt === "time" || p.fmt === "datetime") ? p.v - Math.floor(p.v) : E.value();
    }
    case "TIME": {
      const v = nums2(0, 1, 2);
      if (v instanceof FErr) return v;
      const sec = Math.trunc(v[0]) * 3600 + Math.trunc(v[1]) * 60 + Math.trunc(v[2]);
      if (sec < 0) return E.num();
      return (sec % 86400) / 86400;
    }
    case "HOUR":
    case "MINUTE":
    case "SECOND": {
      const x = num(0);
      if (x instanceof FErr) return x;
      const tot = Math.round((x - Math.floor(x)) * 86400) % 86400;
      return name === "HOUR" ? Math.floor(tot / 3600) : name === "MINUTE" ? Math.floor((tot % 3600) / 60) : tot % 60;
    }
    case "WEEKNUM": {
      const x = num(0);
      const t = num(1, 1);
      if (x instanceof FErr) return x;
      if (t instanceof FErr) return t;
      return weekNumOf(x, Math.trunc(t));
    }
    case "ISOWEEKNUM": {
      const x = num(0);
      return x instanceof FErr ? x : isoWeekOf(x);
    }
    case "DATEDIF": {
      const v = nums2(0, 1);
      const u = str(2);
      if (v instanceof FErr) return v;
      if (u instanceof FErr) return u;
      return datedif(v[0], v[1], u.toUpperCase());
    }
    case "NETWORKDAYS":
    case "NETWORKDAYS.INTL":
    case "WORKDAY":
    case "WORKDAY.INTL": {
      const intl = name.endsWith("INTL");
      const v = nums2(0, 1);
      if (v instanceof FErr) return v;
      const mask = weekendMask(intl && has(2) ? scalar(args[2]) : undefined);
      if (mask instanceof FErr) return mask;
      const hol = holidaysOf(intl ? args[3] : args[2]);
      if (hol instanceof FErr) return hol;
      return name.startsWith("NETWORKDAYS") ? networkdays(v[0], v[1], mask, hol) : workday(v[0], v[1], mask, hol);
    }
    case "YEARFRAC": {
      const v = nums2(0, 1);
      const b = num(2, 0);
      if (v instanceof FErr) return v;
      if (b instanceof FErr) return b;
      return yearfrac(v[0], v[1], Math.trunc(b));
    }

    /* ---- busca e referência ---- */
    case "LOOKUP": {
      if (argc < 2) return E.value();
      const key = scalar(args[0]);
      if (key instanceof FErr) return key;
      const look = args[1];
      let keys: V[];
      let res: V[];
      if (argc > 2) {
        keys = flatten(look);
        res = flatten(args[2]);
      } else if (isArr(look) && look.rows >= look.cols) {
        keys = look.d.map((r) => r[0]);
        res = look.d.map((r) => r[look.cols - 1]);
      } else if (isArr(look)) {
        keys = look.d[0];
        res = look.d[look.rows - 1];
      } else return E.na();
      let found = -1;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === null || typeof k !== typeof key) continue;
        if (cmpValues(k, key) <= 0) found = i;
        else break;
      }
      return found < 0 ? E.na() : (res[found] ?? E.na());
    }
    case "ADDRESS": {
      const v = nums2(0, 1);
      const ab = num(2, 1);
      if (v instanceof FErr) return v;
      if (ab instanceof FErr) return ab;
      if (v[0] < 1 || v[1] < 1) return E.value();
      const a = Math.trunc(ab);
      const sh = has(4) ? str(4) : "";
      if (sh instanceof FErr) return sh;
      const t = (a === 1 || a === 3 ? "$" : "") + colName(Math.trunc(v[1]) - 1) + (a === 1 || a === 2 ? "$" : "") + Math.trunc(v[0]);
      return sh ? `${/^[A-Za-z_][A-Za-z0-9_]*$/.test(sh) ? sh : `'${sh.replace(/'/g, "''")}'`}!${t}` : t;
    }
    case "ROWS": {
      const a0 = n.args[0];
      return isArr(args[0]) ? (a0?.t === "range" ? Math.abs(a0.b.r - a0.a.r) + 1 : args[0].rows) : 1;
    }
    case "COLUMNS":
      return isArr(args[0]) ? args[0].cols : 1;

    /* ---- financeiras ---- */
    case "PMT":
    case "FV":
    case "PV": {
      const v = nums2(0, 1, 2);
      const x4 = num(3, 0);
      const t = num(4, 0);
      if (v instanceof FErr) return v;
      if (x4 instanceof FErr) return x4;
      if (t instanceof FErr) return t;
      const [r, a, b] = v;
      const ty = t ? 1 : 0;
      let res: number;
      if (name === "PMT") {
        if (a === 0) return E.num();
        res = pmtCalc(r, a, b, x4, ty);
      } else if (name === "FV") res = fvCalc(r, a, b, x4, ty);
      else if (name === "PV") res = r === 0 ? -(x4 + b * a) : -(x4 + (b * (1 + r * ty) * (Math.pow(1 + r, a) - 1)) / r) / Math.pow(1 + r, a);
      else {
        res = NaN;
      }
      return Number.isFinite(res) ? res : E.num();
    }
    case "NPER": {
      const v = nums2(0, 1, 2);
      const fv = num(3, 0);
      const t = num(4, 0);
      if (v instanceof FErr) return v;
      if (fv instanceof FErr) return fv;
      if (t instanceof FErr) return t;
      const [r, pm, pv] = v;
      const ty = t ? 1 : 0;
      let res: number;
      if (r === 0) res = pm === 0 ? NaN : -(pv + fv) / pm;
      else {
        const up = pm * (1 + r * ty) - fv * r;
        const dn = pm * (1 + r * ty) + pv * r;
        res = up / dn > 0 && 1 + r > 0 ? Math.log(up / dn) / Math.log(1 + r) : NaN;
      }
      return Number.isFinite(res) ? res : E.num();
    }
    case "IPMT":
    case "PPMT": {
      const v = nums2(0, 1, 2, 3);
      const fv = num(4, 0);
      const t = num(5, 0);
      if (v instanceof FErr) return v;
      if (fv instanceof FErr) return fv;
      if (t instanceof FErr) return t;
      const [r, per, nper, pv] = v;
      const ty = t ? 1 : 0;
      if (per < 1 || per > nper) return E.num();
      const pm = pmtCalc(r, nper, pv, fv, ty);
      const ip = ty === 0 ? fvCalc(r, per - 1, pm, pv, 0) * r : per === 1 ? 0 : (fvCalc(r, per - 2, pm, pv, 1) - pm) * r;
      const res = name === "IPMT" ? ip : pm - ip;
      return Number.isFinite(res) ? res : E.num();
    }
    case "NPV": {
      const r = num(0);
      if (r instanceof FErr) return r;
      const ns = numbers(args.slice(1));
      if (ns instanceof FErr) return ns;
      return ns.reduce((s, v, i) => s + v / Math.pow(1 + r, i + 1), 0);
    }
    case "IRR": {
      const ns = numbers([args[0] ?? null]);
      const g = num(1, 0.1);
      if (ns instanceof FErr) return ns;
      if (g instanceof FErr) return g;
      return irrCalc(ns, g);
    }
    case "RATE": {
      const v = nums2(0, 1, 2);
      const fv = num(3, 0);
      const t = num(4, 0);
      const g = num(5, 0.1);
      if (v instanceof FErr) return v;
      if (fv instanceof FErr) return fv;
      if (t instanceof FErr) return t;
      if (g instanceof FErr) return g;
      return rateCalc(v[0], v[1], v[2], fv, t ? 1 : 0, g);
    }
    case "SLN": {
      const v = nums2(0, 1, 2);
      if (v instanceof FErr) return v;
      return v[2] === 0 ? E.div0() : (v[0] - v[1]) / v[2];
    }
    case "DB": {
      const v = nums2(0, 1, 2, 3);
      const mo = num(4, 12);
      if (v instanceof FErr) return v;
      if (mo instanceof FErr) return mo;
      const [cost, salv, life, per] = v;
      if (cost <= 0 || salv < 0 || life <= 0 || per < 1 || per > life + 1) return E.num();
      const rate = Math.round((1 - Math.pow(salv / cost, 1 / life)) * 1000) / 1000;
      let total = 0;
      let dep = 0;
      const upto = Math.ceil(per);
      for (let p = 1; p <= upto; p++) {
        if (p === 1) dep = (cost * rate * mo) / 12;
        else if (p === life + 1) dep = ((cost - total) * rate * (12 - mo)) / 12;
        else dep = (cost - total) * rate;
        if (p < upto) total += dep;
      }
      return dep;
    }
    case "EFFECT":
    case "NOMINAL": {
      const v = nums2(0, 1);
      if (v instanceof FErr) return v;
      const m = Math.trunc(v[1]);
      if (v[0] <= 0 || m < 1) return E.num();
      return name === "EFFECT" ? Math.pow(1 + v[0] / m, m) - 1 : m * (Math.pow(1 + v[0], 1 / m) - 1);
    }

    /* ---- matrizes ---- */
    case "TRANSPOSE": {
      const a = args[0];
      if (!isArr(a)) return a ?? E.value();
      return mkArr(Array.from({ length: a.cols }, (_, j) => a.d.map((row) => row[j] ?? null)));
    }
    case "UNIQUE": {
      const a = args[0];
      if (!isArr(a)) return a ?? E.value();
      const seen = new Set<string>();
      const rows: V[][] = [];
      for (const row of a.d) {
        const k = row.map(keyOf).join("|");
        if (!seen.has(k)) {
          seen.add(k);
          rows.push(row);
        }
      }
      return rows.length ? mkArr(rows) : E.na();
    }
    case "SORT": {
      const a = args[0];
      if (!isArr(a)) return a ?? E.value();
      const col = num(1, 1);
      const asc = has(2) ? toBool(scalar(args[2])) : true;
      if (col instanceof FErr) return col;
      if (asc instanceof FErr) return asc;
      const ci = Math.trunc(col) - 1;
      if (ci < 0 || ci >= a.cols) return E.value();
      const blank = (v: V) => v === null || v === "";
      const rows = a.d.map((r, i) => ({ r, i }));
      rows.sort((x, y) => {
        const kx = x.r[ci];
        const ky = y.r[ci];
        if (blank(kx) !== blank(ky)) return blank(kx) ? 1 : -1;
        return (asc ? 1 : -1) * cmpValues(kx, ky) || x.i - y.i;
      });
      return mkArr(rows.map((x) => x.r));
    }
    case "FILTER": {
      const a = args[0];
      const cond = args[1];
      if (!isArr(a) || cond === undefined) return E.value();
      const test = (v: V) => !(v instanceof FErr) && toBool(v) === true;
      let out: Arr;
      if (!isArr(cond)) out = test(cond) ? a : mkArr([]);
      else if (cond.cols === 1 && cond.rows === a.rows) out = mkArr(a.d.filter((_, i) => test(cond.d[i][0])));
      else if (cond.rows === 1 && cond.cols === a.cols) out = mkArr(a.d.map((row) => row.filter((_, j) => test(cond.d[0][j]))));
      else return E.value();
      if (!out.rows || !out.cols) return argc > 2 ? args[2] : E.na();
      return out;
    }
    case "SEQUENCE": {
      const rows = num(0);
      const cols = num(1, 1);
      const st = num(2, 1);
      const step = num(3, 1);
      if (rows instanceof FErr) return rows;
      if (cols instanceof FErr) return cols;
      if (st instanceof FErr) return st;
      if (step instanceof FErr) return step;
      const R = Math.trunc(rows);
      const C = Math.trunc(cols);
      if (R < 1 || C < 1 || R * C > 20000) return E.value();
      return mkArr(Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => st + (i * C + j) * step)));
    }
    case "MMULT": {
      const a = args[0];
      const b = args[1];
      if (!isArr(a) || !isArr(b) || a.cols !== b.rows) return E.value();
      const d: V[][] = [];
      for (let i = 0; i < a.rows; i++) {
        const row: V[] = [];
        for (let j = 0; j < b.cols; j++) {
          let s = 0;
          for (let k = 0; k < a.cols; k++) {
            const x = toNum(a.d[i][k]);
            const y = toNum(b.d[k][j]);
            if (x instanceof FErr) return x;
            if (y instanceof FErr) return y;
            s += x * y;
          }
          row.push(s);
        }
        d.push(row);
      }
      return mkArr(d);
    }
  }
  return E.name();
}

/* ================================ resumo ================================ */

/** Calcula o valor de uma célula isolada (usado pelo editor e pela exportação). */
export function evalCell(book: Book, tab: number, r: number, c: number): V {
  return book.get(tab, r, c);
}

export const isFormulaText = (s: string) => s.startsWith("=") && s.length > 1;

export type { CellValue };
