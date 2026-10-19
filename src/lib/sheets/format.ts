/**
 * Números, datas e formatos de célula (pt-BR na tela; padrões do Excel na importação/exportação).
 * Sem dependências de servidor.
 */
import type { CellValue } from "./types";

export class FErr {
  constructor(public code: string) {}
  toString() {
    return this.code;
  }
}

/* ------------------------------- datas (serial do Excel) ------------------------------- */

const EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;

export function serialFromYMD(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);
}

export function ymdFromSerial(serial: number): { y: number; m: number; d: number; wd: number } {
  const dt = new Date(EPOCH + Math.floor(serial) * DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
}

export function todaySerial(): number {
  const n = new Date();
  return serialFromYMD(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export function nowSerial(): number {
  const n = new Date();
  return todaySerial() + (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400;
}

/** Date (UTC usado como "hora de parede", como o exceljs entrega) → serial. */
export const serialFromUTCDate = (d: Date) => (d.getTime() - EPOCH) / DAY;
/** Serial → Date com a hora de parede em UTC (formato esperado pelo exceljs). */
export const utcDateFromSerial = (serial: number) => new Date(EPOCH + Math.round(serial * DAY));

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_S = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const WEEKDAYS_S = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const p2 = (n: number) => String(n).padStart(2, "0");

/* ------------------------------- números ------------------------------- */

function group(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Arredonda "para longe do zero" como o Excel (evita 1.005 virar 1.00). */
export function roundTo(n: number, d: number): number {
  if (!Number.isFinite(n)) return n;
  const f = Math.pow(10, d);
  const x = Math.abs(n) * f;
  const r = Math.round(Number(x.toPrecision(15)));
  return (Math.sign(n) * r) / f;
}

function fixed(n: number, decimals: number): string {
  return roundTo(n, decimals).toFixed(decimals);
}

/** Número solto, sem formato: até 12 dígitos significativos, vírgula decimal. */
export function numToText(n: number): string {
  if (!Number.isFinite(n)) return "#NUM!";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) {
    return n.toExponential(5).replace(/\.?0+e/, "e").replace("e+", "E+").replace("e-", "E-").replace(".", ",");
  }
  let s = String(Number(n.toPrecision(12)));
  if (s.includes("e")) s = n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}

export function parseNumberText(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  let t: string | null = null;
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) t = s.replace(/\./g, "").replace(",", ".");
  else if (/^[+-]?\d*,\d+$/.test(s) || /^[+-]?\d+,?$/.test(s)) t = s.replace(",", ".");
  else if (/^[+-]?\d*\.\d+$/.test(s)) t = s;
  else if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) t = s;
  else if (/^[+-]?\d+,\d+[eE][+-]?\d+$/.test(s)) t = s.replace(",", ".");
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------- padrões estilo Excel ------------------------------- */

const DATE_TOKEN = /(?<![A-Za-z\\])(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P)(?![A-Za-z])/i;

/** O padrão é de data/hora? (ignora trechos entre aspas e colchetes) */
export function isDatePattern(p: string): boolean {
  const stripped = p.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  if (/[0#?]/.test(stripped)) return false;
  return DATE_TOKEN.test(stripped);
}

function formatDatePattern(serial: number, pattern: string): string {
  const { y, m, d, wd } = ymdFromSerial(serial);
  const frac = serial - Math.floor(serial);
  let secs = Math.round(frac * 86400);
  if (secs >= 86400) secs = 86399;
  const hh = Math.floor(secs / 3600);
  const mi = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  const ampm = /AM\/PM|A\/P/i.test(pattern);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const rest = pattern.slice(i);
    let mt: RegExpExecArray | null;
    if (rest[0] === '"') {
      const e = rest.indexOf('"', 1);
      out += rest.slice(1, e < 0 ? undefined : e);
      i += e < 0 ? rest.length : e + 1;
    } else if (rest[0] === "\\") {
      out += rest[1] ?? "";
      i += 2;
    } else if (rest[0] === "[") {
      const e = rest.indexOf("]");
      i += e < 0 ? rest.length : e + 1;
    } else if ((mt = /^(AM\/PM|A\/P)/i.exec(rest))) {
      out += hh < 12 ? (mt[1].length > 3 ? "AM" : "A") : mt[1].length > 3 ? "PM" : "P";
      i += mt[1].length;
    } else if ((mt = /^(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s)/i.exec(rest))) {
      const tk = mt[1].toLowerCase();
      // "m"/"mm" depois de hora ou antes de segundo = minutos
      const before = /h[^a-zA-Z]*$/i.test(pattern.slice(0, i));
      const after = /^m{1,2}[^a-zA-Z]*s/i.test(rest);
      const isMin = (tk === "m" || tk === "mm") && (before || after);
      if (isMin) out += tk === "mm" ? p2(mi) : String(mi);
      else if (tk === "yyyy") out += String(y);
      else if (tk === "yy") out += p2(y % 100);
      else if (tk === "mmmm") out += MONTHS[m - 1];
      else if (tk === "mmm") out += MONTHS_S[m - 1];
      else if (tk === "mm") out += p2(m);
      else if (tk === "m") out += String(m);
      else if (tk === "dddd") out += WEEKDAYS[wd];
      else if (tk === "ddd") out += WEEKDAYS_S[wd];
      else if (tk === "dd") out += p2(d);
      else if (tk === "d") out += String(d);
      else if (tk === "hh") out += p2(ampm ? h12 : hh);
      else if (tk === "h") out += String(ampm ? h12 : hh);
      else if (tk === "ss") out += p2(ss);
      else if (tk === "s") out += String(ss);
      i += mt[1].length;
    } else {
      out += rest[0];
      i++;
    }
  }
  return out;
}

function splitSections(p: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '"') q = !q;
    if (ch === ";" && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Aplica um padrão estilo Excel a um número.
 * `dec` = caractere decimal usado NO PADRÃO ("." nos arquivos do Excel; "," em TEXTO() em português).
 * A saída sempre sai com separadores brasileiros.
 */
export function formatPattern(value: number, pattern: string, dec: "." | "," = "."): string {
  let pat = pattern;
  const sections = splitSections(pat);
  if (sections.length > 1) {
    if (value < 0 && sections[1] !== undefined) {
      pat = sections[1];
      value = Math.abs(value);
    } else if (value === 0 && sections[2] !== undefined) pat = sections[2];
    else pat = sections[0];
  }
  if (/^general$/i.test(pat.trim()) || pat.trim() === "" || pat.trim() === "@") return numToText(value);
  if (isDatePattern(pat)) return formatDatePattern(value, pat);

  const thou = dec === "." ? "," : ".";
  let prefix = "";
  let suffix = "";
  let numPart = "";
  let phase: 0 | 1 | 2 = 0;
  let percent = false;
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    let lit: string | null = null;
    if (ch === '"') {
      const e = pat.indexOf('"', i + 1);
      lit = pat.slice(i + 1, e < 0 ? undefined : e);
      i = e < 0 ? pat.length : e;
    } else if (ch === "\\") {
      lit = pat[i + 1] ?? "";
      i++;
    } else if (ch === "[") {
      const e = pat.indexOf("]", i);
      const tag = pat.slice(i + 1, e < 0 ? undefined : e);
      const cur = /^\$([^-\]]*)/.exec(tag);
      lit = cur ? cur[1] : "";
      i = e < 0 ? pat.length : e;
    } else if (ch === "_" || ch === "*") {
      lit = ch === "_" ? " " : "";
      i++;
    } else if (ch === "%") {
      percent = true;
      lit = "%";
    }
    if (lit !== null) {
      if (phase === 0) prefix += lit;
      else {
        phase = 2;
        suffix += lit;
      }
    } else if ("0#?".includes(ch) || ((ch === dec || ch === thou) && phase !== 2)) {
      phase = 1;
      numPart += ch;
    } else if (phase === 0) prefix += ch;
    else {
      phase = 2;
      suffix += ch;
    }
  }
  let n = value;
  if (percent) n *= 100;
  const neg = n < 0 && roundTo(Math.abs(n), 12) !== 0;
  const decIdx = numPart.indexOf(dec);
  const intPat = decIdx < 0 ? numPart : numPart.slice(0, decIdx);
  const decPat = decIdx < 0 ? "" : numPart.slice(decIdx + 1).split(thou).join("");
  const grouping = intPat.includes(thou);
  const minInt = (intPat.match(/0/g) ?? []).length;
  const minDec = (decPat.match(/0/g) ?? []).length;
  const maxDec = decPat.length;
  const parts = fixed(Math.abs(n), maxDec).split(".");
  let ip = parts[0];
  let dp = parts[1] ?? "";
  if (maxDec > minDec) dp = dp.replace(/0+$/, "").padEnd(minDec, "0");
  if (ip === "0" && minInt === 0 && dp) ip = "";
  ip = ip.padStart(minInt, "0");
  if (grouping) ip = group(ip);
  if (!ip && !dp) ip = "0";
  return (neg ? "-" : "") + prefix + ip + (dp ? "," + dp : "") + suffix;
}

/** Em TEXTO("...") em português: decide se o ponto/vírgula do padrão é decimal. */
export function guessPatternDecimal(p: string): "." | "," {
  const stripped = p.replace(/"[^"]*"/g, "");
  const lc = stripped.lastIndexOf(",");
  const ld = stripped.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) return lc > ld ? "," : ".";
  if (ld >= 0) return /\.[0#?]{3}$/.test(stripped) && /#\.###|0\.000/.test(stripped) ? "," : ".";
  return ",";
}

/* ------------------------------- formato da célula ------------------------------- */

export const FORMATS: { key: string; label: string; example: string }[] = [
  { key: "", label: "Automático", example: "1234,5" },
  { key: "n:2", label: "Número", example: "1.234,50" },
  { key: "brl:2", label: "Moeda (R$)", example: "R$ 1.234,50" },
  { key: "pct:2", label: "Porcentagem", example: "12,50%" },
  { key: "date", label: "Data", example: "31/12/2026" },
  { key: "datetime", label: "Data e hora", example: "31/12/2026 14:30" },
  { key: "time", label: "Hora", example: "14:30:00" },
  { key: "text", label: "Texto simples", example: "abc" },
];

export function parseFmt(fmt?: string): { kind: string; d: number; pattern?: string } {
  if (!fmt) return { kind: "", d: 0 };
  const i = fmt.indexOf(":");
  if (i < 0) return { kind: fmt, d: 0 };
  const kind = fmt.slice(0, i);
  const rest = fmt.slice(i + 1);
  if (kind === "x") return { kind, d: 0, pattern: rest };
  return { kind, d: Math.max(0, Math.min(15, Number(rest) || 0)) };
}

export const makeFmt = (kind: string, d: number) => (kind === "n" || kind === "brl" || kind === "pct" ? `${kind}:${d}` : kind);

/** Texto exibido de uma célula. */
export function formatValue(v: CellValue | null | undefined | FErr, fmt?: string): string {
  if (v === null || v === undefined) return "";
  if (v instanceof FErr) return v.code;
  if (typeof v === "boolean") return v ? "VERDADEIRO" : "FALSO";
  if (typeof v === "string") return v;
  const { kind, d, pattern } = parseFmt(fmt);
  switch (kind) {
    case "n": {
      const f = fixed(Math.abs(v), d).split(".");
      return (v < 0 && roundTo(Math.abs(v), d) !== 0 ? "-" : "") + group(f[0]) + (d ? "," + f[1] : "");
    }
    case "brl": {
      const f = fixed(Math.abs(v), d).split(".");
      return (v < 0 && roundTo(Math.abs(v), d) !== 0 ? "-" : "") + "R$ " + group(f[0]) + (d ? "," + f[1] : "");
    }
    case "pct": {
      const [a, b] = fixed(Math.abs(v) * 100, d).split(".");
      return (v < 0 ? "-" : "") + a + (b ? "," + b : "") + "%";
    }
    case "date":
      return formatDatePattern(v, "dd/mm/yyyy");
    case "datetime":
      return formatDatePattern(v, "dd/mm/yyyy hh:mm");
    case "time":
      return formatDatePattern(v, "hh:mm:ss");
    case "x":
      return formatPattern(v, pattern ?? "General", ".");
    default:
      return numToText(v);
  }
}

/** Padrão do Excel equivalente ao formato interno (para exportar). */
export function fmtToExcel(fmt?: string): string | undefined {
  const { kind, d, pattern } = parseFmt(fmt);
  const dz = d ? "." + "0".repeat(d) : "";
  switch (kind) {
    case "n":
      return "#,##0" + dz;
    case "brl":
      return `"R$" #,##0${dz};-"R$" #,##0${dz}`;
    case "pct":
      return "0" + dz + "%";
    case "date":
      return "dd/mm/yyyy";
    case "datetime":
      return "dd/mm/yyyy hh:mm";
    case "time":
      return "hh:mm:ss";
    case "text":
      return "@";
    case "x":
      return pattern;
    default:
      return undefined;
  }
}

/** Padrão do Excel → formato interno (importação). */
export function excelToFmt(pat?: string | null): string | undefined {
  if (!pat || /^general$/i.test(pat)) return undefined;
  if (pat === "@") return "text";
  if (isDatePattern(pat)) {
    const p = pat.toLowerCase().replace(/\[[^\]]*\]/g, "");
    if (p === "dd/mm/yyyy" || p === "d/m/yyyy" || p === "dd/mm/yy" || p === "d/m/yy" || p === "mm-dd-yy") return "date";
    if (/^dd\/mm\/yyyy hh:mm$/.test(p)) return "datetime";
    if (/^hh?:mm:ss$/.test(p)) return "time";
    return "x:" + pat;
  }
  const first = splitSections(pat)[0];
  const decs = (/\.([0#?]+)/.exec(first.replace(/"[^"]*"/g, ""))?.[1] ?? "").length;
  const hasPct = first.includes("%");
  const hasCur = /R\$/.test(pat);
  const plain = first
    .replace(/\[[^\]]*\]/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/_.|\\./g, "")
    .replace(/\s/g, "");
  if (hasPct && /^[0#.,?%]+$/.test(plain)) return `pct:${decs}`;
  if (hasCur && /^[0#.,?-]+$/.test(plain)) return `brl:${decs}`;
  if (/^[0#.,?]+$/.test(plain) && plain.includes(",")) return `n:${decs}`;
  if (/^0(\.0+)?$/.test(plain)) return `x:${pat}`;
  return "x:" + pat;
}

/* ------------------------------- digitação ------------------------------- */

export type Parsed = { v?: CellValue; fmt?: string; formula?: string };

export function parseTyped(raw: string): Parsed {
  const s = raw.trim();
  if (s === "") return {};
  if (s.startsWith("'")) return { v: raw.replace(/^\s*'/, "") };
  if (s.startsWith("=") && s.length > 1) return { formula: s.slice(1) };
  const up = s.toUpperCase();
  if (up === "TRUE" || up === "VERDADEIRO") return { v: true };
  if (up === "FALSE" || up === "FALSO") return { v: false };
  const n = parseNumberText(s);
  if (n !== null) return { v: n };
  let m: RegExpExecArray | null;
  if ((m = /^(-?)\s*R\$\s*(-?)\s*([\d.,]+)$/.exec(s))) {
    const num = parseNumberText(m[3]);
    if (num !== null) {
      const dec = /,(\d+)$/.exec(m[3])?.[1].length ?? 0;
      return { v: (m[1] || m[2] ? -1 : 1) * num, fmt: `brl:${Math.max(2, dec)}` };
    }
  }
  if ((m = /^([+-]?[\d.,]+)\s*%$/.exec(s))) {
    const num = parseNumberText(m[1]);
    if (num !== null) return { v: num / 100, fmt: `pct:${/,(\d+)$/.exec(m[1])?.[1].length ?? 0}` };
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s))) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += y < 50 ? 2000 : 1900;
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const ser = serialFromYMD(y, mo, d);
      const back = ymdFromSerial(ser);
      if (back.m === mo && back.d === d) {
        if (m[4] !== undefined) return { v: ser + (Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6] ?? 0)) / 86400, fmt: "datetime" };
        return { v: ser, fmt: "date" };
      }
    }
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    const ser = serialFromYMD(Number(m[1]), Number(m[2]), Number(m[3]));
    if (ymdFromSerial(ser).m === Number(m[2])) return { v: ser, fmt: "date" };
  }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s))) {
    return { v: (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)) / 86400, fmt: "time" };
  }
  return { v: raw };
}
