/**
 * Ajudas de digitação de fórmulas (sem dependências de React): contexto da função sob o cursor, autocompletar,
 * referências destacadas e alternância de $ (F4). Funciona sobre o texto digitado (português ou inglês).
 */
import { EN_BY_ANY, FN_BY_EN, fnArgs, searchFunctions, norm, type FnDef } from "./functions";
import { colIndex } from "./types";

export type FormulaContext = {
  /** nome de função sendo digitado (ainda sem "("), com a faixa [start, end) no texto */
  typing: { start: number; end: number; text: string } | null;
  /** função cujos parênteses envolvem o cursor, com o índice do argumento atual */
  call: { def: FnDef; name: string; argIndex: number; start: number } | null;
};

const isIdStart = (ch: string) => /[A-Za-zÀ-ÿ_]/.test(ch);
const isIdChar = (ch: string) => /[A-Za-zÀ-ÿ0-9_.]/.test(ch);
const OPEN_BEFORE = "=(;,+-*/^&<>:%";

/** Analisa o texto até o cursor. */
export function formulaContext(text: string, caret: number): FormulaContext {
  const none: FormulaContext = { typing: null, call: null };
  if (!text.startsWith("=")) return none;
  const upto = text.slice(0, caret);
  const stack: { name: string; argIndex: number; start: number }[] = [];
  let inStr = false;
  for (let i = 1; i < upto.length; i++) {
    const ch = upto[i];
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "(") {
      let j = i;
      while (j > 0 && isIdChar(upto[j - 1])) j--;
      const name = upto.slice(j, i);
      stack.push({ name: name && isIdStart(name[0]) ? name : "", argIndex: 0, start: j });
    } else if (ch === ")") stack.pop();
    else if (ch === ";" && stack.length) stack[stack.length - 1].argIndex++;
    else if (ch === "," && stack.length) {
      const decimal = /\d/.test(upto[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "");
      if (!decimal) stack[stack.length - 1].argIndex++;
    }
  }
  if (inStr) return none;
  let call: FormulaContext["call"] = null;
  for (let k = stack.length - 1; k >= 0; k--) {
    const f = stack[k];
    if (!f.name) continue;
    const en = EN_BY_ANY.get(norm(f.name));
    const def = en ? FN_BY_EN.get(en) : undefined;
    if (def) {
      call = { def, name: f.name, argIndex: f.argIndex, start: f.start };
      break;
    }
  }
  let typing: FormulaContext["typing"] = null;
  const m = /([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)$/.exec(upto);
  if (m && text[caret] !== "(") {
    const start = upto.length - m[1].length;
    const before = upto.slice(0, start).trimEnd();
    const prev = before[before.length - 1];
    if (prev && OPEN_BEFORE.includes(prev) && !/^\$?[A-Za-z]{1,3}\$?\d+$/.test(m[1]) && !/^(\d)/.test(m[1])) {
      typing = { start, end: upto.length, text: m[1] };
    }
  }
  return { typing, call };
}

/** Fecha parênteses que faltam no fim (como o Excel): "=SOMA(A1:A3" vira "=SOMA(A1:A3)". */
export function closeParens(text: string): string {
  if (!text.startsWith("=")) return text;
  // =HOJE (função sem argumentos, sem parênteses) vira =HOJE()
  const bare = /^=\s*([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)\s*$/.exec(text);
  if (bare) {
    const en = EN_BY_ANY.get(norm(bare[1]));
    const def = en ? FN_BY_EN.get(en) : undefined;
    if (def && def.args === "" && !/^(TRUE|FALSE|VERDADEIRO|FALSO)$/i.test(bare[1])) return `=${bare[1]}()`;
  }
  let depth = 0;
  let inStr = false;
  for (const ch of text) {
    if (ch === '"') inStr = !inStr;
    else if (!inStr) {
      if (ch === "(") depth++;
      else if (ch === ")" && depth > 0) depth--;
    }
  }
  return inStr || depth <= 0 ? text : text + ")".repeat(depth);
}

/** Sugestões de autocompletar para o que está sendo digitado. */
export function suggest(ctx: FormulaContext, limit = 8): FnDef[] {
  if (!ctx.typing) return [];
  const q = ctx.typing.text;
  const found = searchFunctions(q, limit * 3).filter((f) => norm(f.pt).startsWith(norm(q)) || norm(f.en).startsWith(norm(q)));
  // se nada começa com o texto, mostra os que contêm
  const list = found.length ? found : searchFunctions(q, limit);
  // se o texto já é exatamente o nome de uma função (ex.: "SOMA") e é a única, ainda mostra para sugerir "("
  return list.slice(0, limit);
}

/** Aceita a sugestão: troca o trecho digitado pelo nome em português seguido de "(". */
export function applySuggestion(text: string, ctx: FormulaContext, def: FnDef): { text: string; caret: number } {
  const t = ctx.typing;
  if (!t) return { text, caret: text.length };
  const rest = text.slice(t.end);
  const hasParen = rest.startsWith("(");
  const ins = def.pt + (hasParen ? "" : "(");
  const out = text.slice(0, t.start) + ins + rest;
  return { text: out, caret: t.start + def.pt.length + 1 };
}

/** Insere uma função (botão fx): em fórmula em edição, no cursor; senão, começa "=NOME(". */
export function insertFunctionAt(text: string, caret: number, def: FnDef): { text: string; caret: number } {
  const ctx = formulaContext(text, caret);
  if (text.startsWith("=") && ctx.typing) return applySuggestion(text, ctx, def);
  if (text.startsWith("=")) {
    const needsOp = /[A-Za-z0-9)"%]\s*$/.test(text.slice(1, caret));
    const ins = (needsOp ? "" : "") + def.pt + "(";
    return { text: text.slice(0, caret) + ins + text.slice(caret), caret: caret + ins.length };
  }
  return { text: `=${def.pt}(`, caret: def.pt.length + 2 };
}

/* ----------------------------- referências no texto ----------------------------- */

export type RefSpan = {
  start: number;
  end: number;
  sheet?: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** índice de cor (mesma referência → mesma cor) */
  color: number;
};

export const REF_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#65a30d"];

const REF_RE = /(?:'((?:[^']|'')+)'!|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?/y;

/** Todas as referências de célula/intervalo do texto da fórmula (fora de textos entre aspas). */
export function refSpans(text: string): RefSpan[] {
  const out: RefSpan[] = [];
  if (!text.startsWith("=")) return out;
  const colors = new Map<string, number>();
  let inStr = false;
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    const prev = text[i - 1];
    if (!(isIdStart(ch) || ch === "$" || ch === "'")) continue;
    if (i > 1 && (isIdChar(prev) || prev === "$")) continue;
    REF_RE.lastIndex = i;
    const m = REF_RE.exec(text);
    if (!m) continue;
    const end = i + m[0].length;
    const next = text[end] ?? "";
    if (isIdChar(next) && next !== ".") continue; // parte de um nome maior (ex.: LOG10x)
    if (next === "(" || next === ".") continue; // função, ex.: LOG10(
    const c1 = colIndex(m[4]);
    const r1 = Number(m[6]) - 1;
    const c2 = m[8] ? colIndex(m[8]) : c1;
    const r2 = m[10] ? Number(m[10]) - 1 : r1;
    const key = `${m[1] ?? m[2] ?? ""}|${Math.min(c1, c2)},${Math.min(r1, r2)}:${Math.max(c1, c2)},${Math.max(r1, r2)}`;
    if (!colors.has(key)) colors.set(key, colors.size % REF_COLORS.length);
    out.push({
      start: i,
      end,
      sheet: (m[1] ?? m[2])?.replace(/''/g, "'"),
      r1: Math.min(r1, r2),
      c1: Math.min(c1, c2),
      r2: Math.max(r1, r2),
      c2: Math.max(c1, c2),
      color: colors.get(key)!,
    });
    i = end - 1;
  }
  return out;
}

/** F4: alterna $ na referência sob o cursor (A1 → $A$1 → A$1 → $A1 → A1). */
export function toggleAbsolute(text: string, caret: number): { text: string; caret: number } | null {
  const spans = refSpans(text);
  const sp = spans.find((s) => caret >= s.start && caret <= s.end);
  if (!sp) return null;
  const raw = text.slice(sp.start, sp.end);
  const bang = raw.lastIndexOf("!");
  const prefix = bang >= 0 ? raw.slice(0, bang + 1) : "";
  const body = bang >= 0 ? raw.slice(bang + 1) : raw;
  const parts = body.split(":");
  const first = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(parts[0]);
  if (!first) return null;
  const ca = first[1] === "$";
  const ra = first[3] === "$";
  // próximo estado do ciclo
  const next = ca && ra ? { ca: false, ra: true } : !ca && ra ? { ca: true, ra: false } : ca && !ra ? { ca: false, ra: false } : { ca: true, ra: true };
  const fix = (p: string) => {
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(p);
    return m ? `${next.ca ? "$" : ""}${m[2].toUpperCase()}${next.ra ? "$" : ""}${m[4]}` : p;
  };
  const rebuilt = prefix + parts.map(fix).join(":");
  return { text: text.slice(0, sp.start) + rebuilt + text.slice(sp.end), caret: sp.start + rebuilt.length };
}

/** Texto da dica de argumentos: partes para renderizar com o argumento atual em destaque. */
export function hintParts(def: FnDef, argIndex: number): { name: string; optional: boolean; current: boolean }[] {
  const args = fnArgs(def);
  const last = args.length - 1;
  return args.map((a, i) => ({
    name: a.name + (a.repeat ? "; ..." : ""),
    optional: a.optional,
    current: i === argIndex || (i === last && a.repeat && argIndex > last),
  }));
}
