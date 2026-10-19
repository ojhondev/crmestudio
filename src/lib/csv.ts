/**
 * CSV/planilha do financeiro — sem dependências de servidor (roda no navegador e no servidor).
 * Lê arquivos de Excel (Brasil) e Google Sheets sem estragar acentos, datas ou valores.
 */

export type SheetRow = {
  /** id do lançamento (vazio = linha nova) */
  id?: string;
  /** vencimento, yyyy-mm-dd */
  due: string;
  kind: "receita" | "despesa";
  description: string;
  category: string;
  amountCents: number;
  /** data do pagamento/recebimento yyyy-mm-dd, ou "" se em aberto */
  paidAt: string;
  contact: string;
  deal: string;
  notes: string;
};

export type CsvFormat = "br" | "us";

export const MAX_IMPORT_ROWS = 2000;

/* ---------------- valores ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** "1.234,56" · "R$ 1234,5" · "1,234.56" · "1234.56" → centavos (sempre positivo). null se não for número. */
export function parseMoneyFlexible(input: unknown): number | null {
  let s = String(input ?? "").trim();
  if (!s) return null;
  s = s.replace(/R\$|\s/g, "").replace(/[()]/g, "").replace(/^[+-]/, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // os dois: o que vier por último é o decimal
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    // "12,5" / "12,50" = decimal; "1,234" ou "1,234,567" = milhar
    normalized = s.split(",").length > 2 || after === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    // "1.234" ou "1.234.567" = milhar (padrão BR); "12.5" = decimal
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  } else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const isNegativeText = (input: unknown) => /^\s*(\(|-|−)/.test(String(input ?? "")) || /^\s*R\$\s*-/.test(String(input ?? ""));

/** dd/mm/aaaa · dd-mm-aa · aaaa-mm-dd · aaaa/mm/dd · número serial do Excel → yyyy-mm-dd ("" se inválida) */
export function parseDateFlexible(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    [d, m, y] = [+r[1], +r[2], +r[3]];
    if (y < 100) y += 2000;
  } else if (/^\d{5}(\.\d+)?$/.test(s)) {
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
}

export const isoToBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

export function parseKind(input: unknown): "receita" | "despesa" | null {
  const s = String(input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (/^(r|receita|receitas|entrada|entradas|recebimento|recebimentos|credito|in|income|a receber)$/.test(s)) return "receita";
  if (/^(d|despesa|despesas|saida|saidas|pagamento|pagamentos|debito|out|expense|a pagar|custo)$/.test(s)) return "despesa";
  return null;
}

export const centsToText = (cents: number, format: CsvFormat = "br") => {
  const v = (Math.abs(cents) / 100).toFixed(2);
  return format === "br" ? v.replace(".", ",") : v;
};

/** Valor para exibir/editar na grade: "1.234,56" */
export const centsToBr = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------------- leitura de CSV ---------------- */

export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts: [string, number][] = [
    [";", (head.match(/;/g) || []).length],
    ["\t", (head.match(/\t/g) || []).length],
    [",", (head.match(/,/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/** Leitor RFC 4180: aspas, separador dentro de aspas, quebras de linha CRLF/LF. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

type Field = "id" | "due" | "kind" | "description" | "category" | "amount" | "paidAt" | "contact" | "deal" | "notes";
const ALIASES: Record<Field, string[]> = {
  id: ["id", "codigo", "idnaoaltere"],
  due: ["vencimento", "data", "date", "datavencimento", "datadevencimento", "due", "duedate", "venc"],
  kind: ["tipo", "natureza", "kind", "entradasaida", "receitadespesa"],
  description: ["descricao", "descricaodolancamento", "historico", "description", "lancamento", "nome"],
  category: ["categoria", "category", "classificacao"],
  amount: ["valor", "valorrs", "valorr", "amount", "total", "valordolancamento"],
  paidAt: ["pagoem", "datapagamento", "pagamento", "datadepagamento", "recebidoem", "datarecebimento", "paidat", "baixa", "databaixa"],
  contact: ["cliente", "fornecedor", "clientefornecedor", "contato", "pessoa"],
  deal: ["negocio", "projeto", "obra", "deal"],
  notes: ["observacoes", "observacao", "obs", "notas", "notes"],
};

export function mapHeader(header: string[]): Partial<Record<Field, number>> {
  const idx: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [field, names] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (idx[field] === undefined && names.includes(n)) idx[field] = i;
    }
  });
  return idx;
}

export type ImportIssue = { line: number; message: string };

/** Converte a tabela lida em linhas da planilha, com avisos por linha (linha 1 = cabeçalho). */
export function tableToRows(table: string[][]): { rows: SheetRow[]; issues: ImportIssue[]; fatal?: string } {
  if (table.length < 2) return { rows: [], issues: [], fatal: "O arquivo está vazio ou só tem o cabeçalho." };
  const idx = mapHeader(table[0]);
  const missing = (["due", "description", "amount"] as Field[]).filter((f) => idx[f] === undefined);
  if (missing.length) {
    const pt = { due: "Vencimento", description: "Descrição", amount: "Valor" } as Record<string, string>;
    return { rows: [], issues: [], fatal: `Não encontrei as colunas: ${missing.map((m) => pt[m]).join(", ")}. Use o modelo em branco como guia.` };
  }
  const rows: SheetRow[] = [];
  const issues: ImportIssue[] = [];
  const body = table.slice(1, MAX_IMPORT_ROWS + 1);
  if (table.length - 1 > MAX_IMPORT_ROWS) issues.push({ line: 0, message: `Só as primeiras ${MAX_IMPORT_ROWS} linhas foram lidas.` });
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (f: Field) => (idx[f] === undefined ? "" : (cells[idx[f]!] ?? "").trim().replace(/^'(?=[=+\-@])/, ""));
    const description = get("description");
    if (!description && !get("amount") && !get("due")) return; // linha em branco
    const due = parseDateFlexible(get("due"));
    const cents = parseMoneyFlexible(get("amount"));
    const kind = parseKind(get("kind")) ?? (cents !== null && isNegativeText(get("amount")) ? "despesa" : idx.kind === undefined ? "receita" : null);
    const rowIssues: string[] = [];
    if (!description) rowIssues.push("sem descrição");
    if (!due) rowIssues.push(`vencimento inválido (“${get("due")}”)`);
    if (cents === null || cents <= 0) rowIssues.push(`valor inválido (“${get("amount")}”)`);
    if (!kind) rowIssues.push(`tipo inválido (“${get("kind")}” — use Receita ou Despesa)`);
    const paidRaw = get("paidAt");
    const paidAt = parseDateFlexible(paidRaw);
    if (paidRaw && !paidAt) rowIssues.push(`data de pagamento inválida (“${paidRaw}”)`);
    if (rowIssues.length) {
      issues.push({ line, message: rowIssues.join("; ") });
      return;
    }
    rows.push({
      id: /^[0-9a-f-]{36}$/i.test(get("id")) ? get("id").toLowerCase() : undefined,
      due,
      kind: kind!,
      description,
      category: get("category"),
      amountCents: cents!,
      paidAt,
      contact: get("contact"),
      deal: get("deal"),
      notes: get("notes"),
    });
  });
  return { rows, issues };
}

/* ---------------- exportação ---------------- */

const HEADERS = ["ID (não altere)", "Vencimento", "Tipo", "Descrição", "Categoria", "Valor (R$)", "Pago em", "Cliente / fornecedor", "Negócio", "Observações"];

/** Células que começam com = + - @ viram fórmula no Excel/Sheets: protege com apóstrofo. */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function rowsToCsv(rows: SheetRow[], format: CsvFormat): string {
  const delim = format === "br" ? ";" : ",";
  const q = (s: string) => (new RegExp(`[${delim}"\\n\\r]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const date = (iso: string) => (!iso ? "" : format === "br" ? isoToBr(iso) : iso);
  const lines = [HEADERS.map(q).join(delim)];
  for (const r of rows) {
    lines.push(
      [
        r.id ?? "",
        date(r.due),
        r.kind === "receita" ? "Receita" : "Despesa",
        safe(r.description),
        safe(r.category),
        centsToText(r.amountCents, format),
        date(r.paidAt),
        safe(r.contact),
        safe(r.deal),
        safe(r.notes),
      ]
        .map(q)
        .join(delim),
    );
  }
  // BOM: faz o Excel reconhecer UTF-8 (acentos corretos)
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Colar da planilha (TSV do Excel/Sheets): devolve a matriz de células. */
export const parseClipboardTable = (text: string) => parseCsv(text, "\t");
