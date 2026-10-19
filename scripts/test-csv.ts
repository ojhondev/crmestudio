/**
 * Testes da biblioteca de CSV/planilha (src/lib/csv.ts). Sem banco, sem rede.
 *   npm run test:csv
 */
import { parseMoneyFlexible, parseDateFlexible, parseCsv, tableToRows, rowsToCsv, parseKind, type SheetRow } from "../src/lib/csv";

let fail = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};

// valores
for (const [i, e] of [
  ["1.234,56", 123456], ["R$ 1.234,56", 123456], ["1234,5", 123450], ["1234.56", 123456], ["1,234.56", 123456], ["12,50", 1250],
  ["1.234", 123400], ["1.234.567,89", 123456789], ["1,234", 123400], ["0,99", 99], ["abc", null], ["", null], ["(500,00)", 50000], ["-250,10", 25010],
] as [string, number | null][]) eq(parseMoneyFlexible(i), e, `valor "${i}"`);

// datas
for (const [i, e] of [
  ["05/10/2026", "2026-10-05"], ["5/10/26", "2026-10-05"], ["2026-10-05", "2026-10-05"], ["2026/10/05", "2026-10-05"], ["31/02/2026", ""],
  ["45000", "2023-03-15"], ["lixo", ""], ["", ""], ["05-10-2026", "2026-10-05"],
] as [string, string][]) eq(parseDateFlexible(i), e, `data "${i}"`);

// tipo
eq(parseKind("Receita"), "receita", "kind");
eq(parseKind("Saída"), "despesa", "kind saída");
eq(parseKind("???"), null, "kind inválido");

// CSV BR (ponto e vírgula, aspas, vírgula decimal, quebra de linha dentro de aspas)
const br = 'Vencimento;Tipo;Descrição;Categoria;Valor (R$);Pago em;Cliente / fornecedor;Negócio;Observações\r\n05/10/2026;Receita;"Sinal; restauro";Sinal / entrada;1.500,00;05/10/2026;Pe. Antônio;Forro;"linha1\nlinha2"\r\n10/10/2026;Despesa;Pigmentos;Materiais;320,5;;;;\r\n';
let t = parseCsv(br);
eq(t.length, 3, "linhas do CSV BR");
eq(t[1][2], "Sinal; restauro", "separador dentro de aspas");
eq(t[1][8], "linha1\nlinha2", "quebra dentro de aspas");
let r = tableToRows(t);
eq(r.issues, [], "sem avisos");
eq(r.rows.length, 2, "2 linhas válidas");
eq([r.rows[0].amountCents, r.rows[0].kind, r.rows[0].paidAt, r.rows[1].amountCents, r.rows[1].paidAt], [150000, "receita", "2026-10-05", 32050, ""], "valores lidos");

// CSV internacional (vírgula) sem coluna de tipo: usa o sinal do valor
const us = 'date,description,amount\n2026-10-05,Aluguel,"-1,200.00"\n2026-10-06,Projeto,"3,000.00"\n';
r = tableToRows(parseCsv(us));
eq(r.rows.map((x) => [x.kind, x.amountCents]), [["despesa", 120000], ["receita", 300000]], "CSV internacional");

// erros por linha + cabeçalho desconhecido
r = tableToRows(parseCsv("Vencimento;Descrição;Valor\n99/99/2026;X;10\n05/10/2026;;5\n05/10/2026;Ok;abc\n"));
eq(r.rows.length, 0, "todas inválidas");
eq(r.issues.length, 3, "3 avisos");
eq(!!tableToRows(parseCsv("a;b;c\n1;2;3")).fatal, true, "cabeçalho desconhecido");

// ida e volta: exportar → importar não muda nada (BR e US), com acentos, aspas, quebras e fórmulas
const rows: SheetRow[] = [
  { id: "11111111-1111-1111-1111-111111111111", due: "2026-10-05", kind: "receita", description: 'Sinal "especial"; restauro', category: "Sinal / entrada", amountCents: 150000, paidAt: "2026-10-05", contact: "Pe. Antônio", deal: "Forro — Itu", notes: "linha1\nlinha2" },
  { due: "2026-10-10", kind: "despesa", description: "=SOMA(A1)", category: "Materiais", amountCents: 32050, paidAt: "", contact: "", deal: "", notes: "" },
];
for (const f of ["br", "us"] as const) {
  const csv = rowsToCsv(rows, f);
  eq(csv.startsWith("﻿"), true, `BOM ${f}`);
  eq(csv.includes("'=SOMA(A1)"), true, `proteção de fórmula ${f}`);
  const back = tableToRows(parseCsv(csv));
  eq(back.issues, [], `ida e volta sem avisos ${f}`);
  eq(back.rows, rows, `ida e volta idêntica ${f}`);
}

console.log(fail ? `${fail} falha(s)` : "csv.ts: todos os testes passaram");
process.exit(fail ? 1 : 0);
