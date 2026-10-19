/**
 * Motor de fórmulas próprio (sem dependências): leitor, impressor e avaliador.
 * - Fórmulas ficam guardadas na forma canônica en-US (nomes em inglês, "," separando argumentos, "." decimal),
 *   a mesma do arquivo .xlsx. Na barra de fórmulas aparecem em português (SOMA, ";" e vírgula decimal).
 * - Ao digitar, aceita nomes em português OU inglês e ";" OU ",".
 */
import { FErr, formatPattern, guessPatternDecimal, nowSerial, numToText, parseNumberText, roundTo, serialFromYMD, todaySerial, ymdFromSerial } from "./format";
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

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

/** [inglês, português] */
const NAMES: [string, string][] = [
  ["SUM", "SOMA"],
  ["AVERAGE", "MÉDIA"],
  ["MIN", "MÍNIMO"],
  ["MAX", "MÁXIMO"],
  ["COUNTA", "CONT.VALORES"],
  ["COUNT", "CONT.NÚM"],
  ["COUNTBLANK", "CONTAR.VAZIO"],
  ["IF", "SE"],
  ["IFERROR", "SEERRO"],
  ["SUMIF", "SOMASE"],
  ["SUMIFS", "SOMASES"],
  ["COUNTIF", "CONT.SE"],
  ["COUNTIFS", "CONT.SES"],
  ["AVERAGEIF", "MÉDIASE"],
  ["VLOOKUP", "PROCV"],
  ["HLOOKUP", "PROCH"],
  ["INDEX", "ÍNDICE"],
  ["MATCH", "CORRESP"],
  ["ROUND", "ARRED"],
  ["ROUNDUP", "ARREDONDAR.PARA.CIMA"],
  ["ROUNDDOWN", "ARREDONDAR.PARA.BAIXO"],
  ["TODAY", "HOJE"],
  ["NOW", "AGORA"],
  ["TEXT", "TEXTO"],
  ["CONCATENATE", "CONCATENAR"],
  ["CONCAT", "CONCAT"],
  ["TEXTJOIN", "UNIRTEXTO"],
  ["AND", "E"],
  ["OR", "OU"],
  ["NOT", "NÃO"],
  ["ABS", "ABS"],
  ["INT", "INT"],
  ["MOD", "MOD"],
  ["POWER", "POTÊNCIA"],
  ["SQRT", "RAIZ"],
  ["PRODUCT", "MULT"],
  ["MEDIAN", "MED"],
  ["LEN", "NÚM.CARACT"],
  ["UPPER", "MAIÚSCULA"],
  ["LOWER", "MINÚSCULA"],
  ["PROPER", "PRI.MAIÚSCULA"],
  ["TRIM", "ARRUMAR"],
  ["LEFT", "ESQUERDA"],
  ["RIGHT", "DIREITA"],
  ["MID", "EXT.TEXTO"],
  ["VALUE", "VALOR"],
  ["DATE", "DATA"],
  ["YEAR", "ANO"],
  ["MONTH", "MÊS"],
  ["DAY", "DIA"],
  ["ISBLANK", "ÉCÉL.VAZIA"],
  ["ISNUMBER", "ÉNÚM"],
  ["ISTEXT", "ÉTEXTO"],
  ["ISERROR", "ÉERRO"],
  ["ROW", "LIN"],
  ["COLUMN", "COL"],
  ["SUMPRODUCT", "SOMARPRODUTO"],
  ["XLOOKUP", "PROCX"],
  ["CEILING", "TETO"],
  ["FLOOR", "ARREDMULT.BAIXO"],
  ["MAXIFS", "MÁXIMOSES"],
  ["MINIFS", "MÍNIMOSES"],
  ["DAYS", "DIAS"],
  ["EDATE", "DATAM"],
  ["EOMONTH", "FIMMÊS"],
  ["WEEKDAY", "DIA.DA.SEMANA"],
  ["SUBSTITUTE", "SUBSTITUIR"],
  ["REPT", "REPT"],
  ["IFS", "SES"],
  ["LOG", "LOG"],
  ["EXP", "EXP"],
  ["PI", "PI"],
];

const EN_BY_ANY = new Map<string, string>();
const PT_BY_EN = new Map<string, string>();
for (const [en, pt] of NAMES) {
  EN_BY_ANY.set(norm(en), en);
  EN_BY_ANY.set(norm(pt), en);
  PT_BY_EN.set(en, pt);
}

export const FUNCTION_NAMES = NAMES;

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
      const m = /^#(DIV\/0!|REF!|NAME\?|VALUE!|N\/A|NUM!|NULL!|ERRO!|CIRC!)/i.exec(src.slice(i));
      if (!m) throw new FormulaSyntaxError("caractere #");
      out.push({ k: "err", v: m[0].toUpperCase() });
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
          const en = EN_BY_ANY.get(norm(t.v));
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

export type BookTab = { name: string; grid: Grid };

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

type Ctx = { tab: number; r: number; c: number };

export class Book {
  private cache = new Map<number, V>();
  private busy = new Set<number>();
  private usedRowsCache = new Map<number, number>();
  constructor(public tabs: BookTab[]) {}

  invalidate() {
    this.cache.clear();
    this.busy.clear();
    this.usedRowsCache.clear();
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
      this.usedRowsCache.set(tab, u);
    }
    return u;
  }

  get(tab: number, r: number, c: number): V {
    const cell = this.tabs[tab]?.grid[r]?.[c];
    if (!cell) return null;
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
      }
    } catch (e) {
      val = e instanceof RangeError ? E.erro() : E.value();
    }
    this.busy.delete(k);
    this.cache.set(k, val);
    return val;
  }

  range(tab: number, r1: number, c1: number, r2: number, c2: number): Arr {
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
      return formatPattern(x, f, guessPatternDecimal(f));
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
      return a === "" ? s : s.split(a).join(b);
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
  return E.name();
}

/* ================================ resumo ================================ */

/** Calcula o valor de uma célula isolada (usado pelo editor e pela exportação). */
export function evalCell(book: Book, tab: number, r: number, c: number): V {
  return book.get(tab, r, c);
}

export const isFormulaText = (s: string) => s.startsWith("=") && s.length > 1;

export type { CellValue };
