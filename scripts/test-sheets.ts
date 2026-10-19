/**
 * Testes do módulo Planilhas: motor de fórmulas, formatos, operações, importação (xlsx/xls/ods/csv) e ida-e-volta xlsx.
 * Sem banco, sem rede.   npm run test:sheets
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Book, adjustFormula, canonicalFormula, displayFormula, offsetFormula, type V } from "../src/lib/sheets/formula";
import { FErr, formatPattern, formatValue, parseTyped, serialFromYMD } from "../src/lib/sheets/format";
import { fillLine, parseTSV, shiftStructure, sortRange, toTSV } from "../src/lib/sheets/ops";
import { importFile, previewOf } from "../src/lib/sheets/import";
import { toCsv, toXlsx } from "../src/lib/sheets/export";
import { emptyTab, type Grid, type TabData } from "../src/lib/sheets/types";

let fail = 0;
let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  n++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};

const tabOf = (grid: Grid, name = "Aba1"): TabData => ({ ...emptyTab("t1", name), grid });
function calc(grid: Grid, formula: string, extra: TabData[] = []): V {
  const g: Grid = { ...grid, 99: { 0: { f: canonicalFormula(formula) ?? formula } } };
  const book = new Book([{ name: "Aba1", grid: g }, ...extra.map((t) => ({ name: t.name, grid: t.grid }))]);
  return book.get(0, 99, 0);
}
const show = (v: V) => (v instanceof FErr ? v.code : v);

const data: Grid = {
  0: { 0: { v: "Item" }, 1: { v: "Valor" }, 2: { v: "Tipo" } },
  1: { 0: { v: "Tinta" }, 1: { v: 10 }, 2: { v: "mat" } },
  2: { 0: { v: "Verniz" }, 1: { v: 20.5 }, 2: { v: "mat" } },
  3: { 0: { v: "Frete" }, 1: { v: 30 }, 2: { v: "serv" } },
  4: { 0: { v: "Pó" }, 1: { v: "x" }, 2: { v: "mat" } },
};

// ---- fórmulas: nomes PT e EN, separadores
eq(show(calc(data, "SUM(B2:B4)")), 60.5, "SUM en");
eq(show(calc(data, "SOMA(B2:B4)")), 60.5, "SOMA pt");
eq(show(calc(data, "SOMA(B2;B3;1,5)")), 32, "SOMA ; e vírgula decimal");
eq(show(calc(data, "MÉDIA(B2:B4)")), 60.5 / 3, "MÉDIA");
eq(show(calc(data, "AVERAGE(B2:B4)")), 60.5 / 3, "AVERAGE");
eq(show(calc(data, "MÍNIMO(B2:B4)")), 10, "MÍNIMO");
eq(show(calc(data, "MAX(B2:B4)")), 30, "MAX");
eq(show(calc(data, "CONT.VALORES(A1:A5)")), 5, "CONT.VALORES");
eq(show(calc(data, "COUNTA(B1:B5)")), 5, "COUNTA");
eq(show(calc(data, "CONT.NÚM(B1:B5)")), 3, "CONT.NÚM ignora texto");
eq(show(calc(data, "COUNT(B1:B5)")), 3, "COUNT");
eq(show(calc(data, 'SE(B2>5;"alto";"baixo")')), "alto", "SE");
eq(show(calc(data, 'IF(B2>50,"alto","baixo")')), "baixo", "IF");
eq(show(calc(data, "SE(B2>50;1)")), false, "SE sem senão");
eq(show(calc(data, 'SOMASE(C2:C5;"mat";B2:B5)')), 30.5, "SOMASE");
eq(show(calc(data, 'SUMIF(B2:B5;">15")')), 50.5, "SUMIF critério >");
eq(show(calc(data, 'CONT.SE(C2:C5;"mat")')), 3, "CONT.SE");
eq(show(calc(data, 'COUNTIF(C:C;"s*")')), 1, "COUNTIF coringa");
eq(show(calc(data, 'SOMASES(B2:B5;C2:C5;"mat";B2:B5;">=20")')), 20.5, "SOMASES");
eq(show(calc(data, 'PROCV("Verniz";A2:C5;2;FALSO)')), 20.5, "PROCV exato");
eq(show(calc(data, 'VLOOKUP("Nada";A2:C5;2;FALSE)')), "#N/A", "PROCV não achou");
eq(show(calc({ 0: { 0: { v: 0 }, 1: { v: "baixo" } }, 1: { 0: { v: 10 }, 1: { v: "médio" } }, 2: { 0: { v: 20 }, 1: { v: "alto" } } }, "PROCV(15;A1:B3;2)")), "médio", "PROCV aproximado");
eq(show(calc(data, "ARRED(3,14159;2)")), 3.14, "ARRED");
eq(show(calc(data, "ROUND(2.5,0)")), 3, "ROUND meio para longe de zero");
eq(show(calc(data, "ROUND(-2.5,0)")), -3, "ROUND negativo");
eq(show(calc(data, "ROUND(1.005,2)")), 1.01, "ROUND 1.005");
eq(show(calc(data, 'CONCATENAR(A2;" - ";C2)')), "Tinta - mat", "CONCATENAR");
eq(show(calc(data, 'A2&"/"&B2')), "Tinta/10", "&");
eq(show(calc(data, 'TEXTO(1234,5;"0,00")')), "1234,50", "TEXTO 0,00");
eq(show(calc(data, 'TEXTO(1234,5;"#.##0,00")')), "1.234,50", "TEXTO milhar");
eq(show(calc(data, 'TEXT(0.256,"0%")')), "26%", "TEXT %");
eq(show(calc(data, 'TEXT(DATE(2026,10,5),"dd/mm/yyyy")')), "05/10/2026", "TEXT data");
eq(show(calc(data, "DATA(2026;10;5)")), serialFromYMD(2026, 10, 5), "DATA");
eq(typeof show(calc(data, "HOJE()")), "number", "HOJE numérico");
eq(show(calc(data, "ANO(DATA(2026;10;5))")), 2026, "ANO");
eq(show(calc(data, "B2*2+B3/2")), 30.25, "precedência");
eq(show(calc(data, "-2^2")), 4, "unário antes da potência");
eq(show(calc(data, "2^3^2")), 64, "potência associa à esquerda (Excel)");
eq(show(calc(data, "50%")), 0.5, "porcentagem");
eq(show(calc(data, "B2/0")), "#DIV/0!", "div por zero");
eq(show(calc(data, "SOMA(B1:B5)")), 60.5, "SOMA ignora texto no intervalo");
eq(show(calc(data, "B5+1")), "#VALUE!", "texto em conta");
eq(show(calc(data, "FOO(1)")), "#NAME?", "função desconhecida");
eq(show(calc(data, "SEERRO(B2/0;0)")), 0, "SEERRO");
eq(show(calc(data, "E(1>0;2>1)")), true, "E");
eq(show(calc(data, "OU(1>5;2>1)")), true, "OU");
eq(show(calc(data, "$B$2+B$3")), 30.5, "referências $");
eq(show(calc(data, "SOMA(B:B)")), 60.5, "coluna inteira");
eq(show(calc(data, "SOMARPRODUTO(B2:B4;B2:B4)")), 100 + 420.25 + 900, "SOMARPRODUTO");
eq(show(calc(data, "ÍNDICE(A2:C5;2;1)")), "Verniz", "ÍNDICE");
eq(show(calc(data, 'CORRESP("Frete";A2:A5;0)')), 3, "CORRESP");
eq(show(calc(data, "PROCV(1;A1:C5;99;FALSO)")), "#REF!", "PROCV coluna fora");
eq(show(calc(data, "MAIÚSCULA(A2)&ESQUERDA(A3;3)")), "TINTAVer", "texto");
eq(show(calc(data, "VERDADEIRO")), true, "VERDADEIRO");

// ---- entre abas
const aba2 = tabOf({ 0: { 0: { v: 5 }, 1: { v: 7 } } }, "Custos obra");
eq(show(calc(data, "'Custos obra'!A1+Aba1!B2", [aba2])), 15, "referência entre abas");
eq(show(calc(data, "SOMA('Custos obra'!A1:B1)", [aba2])), 12, "intervalo entre abas");
eq(show(calc(data, "Inexistente!A1", [aba2])), "#REF!", "aba inexistente");

// ---- circular e cadeia longa
{
  const g: Grid = { 0: { 0: { f: "B1+1" }, 1: { f: "A1+1" } } };
  const b = new Book([{ name: "Aba1", grid: g }]);
  eq(show(b.get(0, 0, 0)), "#CIRC!", "referência circular");
  const chain: Grid = {};
  for (let i = 0; i < 6000; i++) chain[i] = { 0: i === 0 ? { v: 1 } : { f: `A${i}+1` } };
  const b2 = new Book([{ name: "Aba1", grid: chain }]);
  b2.warm(0);
  eq(show(b2.get(0, 5999, 0)), 6000, "cadeia de 6000 fórmulas");
}

// ---- canônico / exibição / ajuste de referências
eq(canonicalFormula("SOMA(A1:A3;B1)"), "SUM(A1:A3,B1)", "canônico");
eq(displayFormula("IF(A1>1,SUM(B1:B3),0.5)"), "SE(A1>1;SOMA(B1:B3);0,5)", "exibição pt");
eq(offsetFormula("A1+$B$2+C$3", 2, 1), "B3+$B$2+D$3", "offset relativo");
eq(adjustFormula("SUM(A1:A5)+B6", "Aba1", "Aba1", "row", 2, 1), "SUM(A1:A6)+B7", "inserir linha");
eq(adjustFormula("SUM(A1:A5)+B3", "Aba1", "Aba1", "row", 2, -1), "SUM(A1:A4)+#REF!", "excluir linha");
eq(adjustFormula("Aba1!C1", "Aba2", "Aba1", "col", 0, 1), "Aba1!D1", "inserir coluna afeta outra aba");
eq(adjustFormula("C1", "Aba2", "Aba1", "col", 0, 1), "C1", "outra aba não muda");

// ---- digitação
eq(parseTyped("1.234,56"), { v: 1234.56 }, "número BR");
eq(parseTyped("R$ 1.250,00"), { v: 1250, fmt: "brl:2" }, "moeda");
eq(parseTyped("12,5%"), { v: 0.125, fmt: "pct:1" }, "porcentagem");
eq(parseTyped("05/10/2026"), { v: serialFromYMD(2026, 10, 5), fmt: "date" }, "data");
eq(parseTyped("=SOMA(A1:A2)"), { formula: "SOMA(A1:A2)" }, "fórmula");
eq(parseTyped("'0123"), { v: "0123" }, "apóstrofo = texto");
eq(parseTyped("Olá"), { v: "Olá" }, "texto");
eq(parseTyped("verdadeiro"), { v: true }, "booleano");

// ---- formatos
eq(formatValue(1234.5, "brl:2"), "R$ 1.234,50", "fmt brl");
eq(formatValue(-1234.5, "n:2"), "-1.234,50", "fmt n");
eq(formatValue(0.1234, "pct:1"), "12,3%", "fmt pct");
eq(formatValue(serialFromYMD(2026, 10, 5), "date"), "05/10/2026", "fmt data");
eq(formatValue(true), "VERDADEIRO", "fmt bool");
eq(formatValue(1 / 3), "0,333333333333", "geral");
eq(formatValue(0.1 + 0.2), "0,3", "geral sem ruído");
eq(formatPattern(1234.5, "#,##0.00"), "1.234,50", "padrão Excel");
eq(formatPattern(0.5, "0.0%"), "50,0%", "padrão %");
eq(formatPattern(1234.5, '"R$" #,##0.00'), "R$ 1.234,50", "padrão moeda");
eq(formatPattern(serialFromYMD(2026, 1, 9), "d/m/yy"), "9/1/26", "padrão data curta");
eq(formatPattern(serialFromYMD(2026, 1, 9) + 0.5, "dd/mm/yyyy hh:mm"), "09/01/2026 12:00", "data e hora");

// ---- operações
{
  const t = tabOf({ 0: { 0: { v: 1 } }, 1: { 0: { v: 2 } }, 2: { 0: { f: "SUM(A1:A2)" }, 1: { f: "A3*2" } } });
  const ins = shiftStructure([t], 0, "row", 1, 1)[0];
  eq(ins.grid[3][0].f, "SUM(A1:A3)", "inserir linha reescreve SOMA");
  eq(ins.grid[3][1].f, "A4*2", "inserir linha move referência");
  eq(ins.rows, t.rows + 1, "inserir linha aumenta total");
  const del = shiftStructure([t], 0, "row", 0, -1)[0];
  eq(del.grid[1][0].f, "SUM(A1:A1)", "excluir linha encolhe intervalo");
  const col = shiftStructure([t], 0, "col", 0, 1)[0];
  eq(col.grid[2][1].f, "SUM(B1:B2)", "inserir coluna");
}
{
  const t = tabOf({ 0: { 0: { v: "b" } }, 1: { 0: { v: "a" } }, 2: { 0: { v: "c" } }, 3: { 0: { v: 5 } } });
  const book = new Book([{ name: "Aba1", grid: t.grid }]);
  const g = sortRange(t, { r1: 0, c1: 0, r2: 3, c2: 0 }, 0, true, (r, c) => book.get(0, r, c));
  eq([0, 1, 2, 3].map((r) => g[r][0].v), [5, "a", "b", "c"], "ordenar A-Z (números antes)");
  const g2 = sortRange(t, { r1: 0, c1: 0, r2: 3, c2: 0 }, 0, false, (r, c) => book.get(0, r, c));
  eq([0, 1, 2, 3].map((r) => g2[r][0].v), ["c", "b", "a", 5], "ordenar Z-A");
}
eq(fillLine([{ v: 1 }, { v: 2 }], 3, 1, "row").map((c) => c?.v), [3, 4, 5], "série linear");
eq(fillLine([{ v: "Item 1" }], 2, 1, "row").map((c) => c?.v), ["Item 2", "Item 3"], "texto + número");
eq(fillLine([{ v: 7 }], 2, 1, "row").map((c) => c?.v), [7, 7], "cópia simples");
eq(fillLine([{ f: "A1*2" }], 2, 1, "row").map((c) => c?.f), ["A2*2", "A3*2"], "fórmula relativa preenchida");
eq(fillLine([{ v: 1 }, { v: 2 }], 2, -1, "row").map((c) => c?.v), [0, -1], "série para trás");
eq(parseTSV('a\tb\n"x\ty"\t"he said ""hi"""\n'), [["a", "b"], ["x\ty", 'he said "hi"']], "TSV com aspas");
eq(toTSV([["a", "b\tc"]]), 'a\t"b\tc"', "TSV escreve aspas");

// ---- importação: CSV
async function main() {
  const csvBR = Buffer.from("Item;Valor;Data\r\nCafé;1.234,56;05/10/2026\r\nPão;0,5;06/10/2026\r\nCEP;01310100;\r\n", "latin1");
  const csv = await importFile(csvBR, "lista.csv");
  const t0 = csv.tabs[0];
  eq(csv.name, "lista", "nome do arquivo");
  eq(t0.grid[1][0].v, "Café", "CSV latin1 com acento");
  eq(t0.grid[1][1].v, 1234.56, "CSV número BR");
  eq(t0.grid[1][2].fmt, "date", "CSV data");
  eq(t0.grid[2][1].v, 0.5, "CSV decimal");
  const csvU = await importFile(Buffer.from("a,b\n1,2\n3.5,x\n", "utf8"), "x.csv");
  eq(csvU.tabs[0].grid[2][0].v, 3.5, "CSV internacional");
  const tsv = await importFile(Buffer.from("a\tb\n1\t2\n"), "x.tsv");
  eq(tsv.tabs[0].grid[1][1].v, 2, "TSV");

  // ---- XLSX gerado pelo exceljs (como viria do Excel)
  const wb = new ExcelJS.Workbook();
  const w1 = wb.addWorksheet("Materiais", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  w1.getCell("A1").value = "Item";
  w1.getCell("A1").font = { bold: true, color: { argb: "FFFF0000" } };
  w1.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  w1.getCell("B1").value = "Qtd";
  w1.getCell("C1").value = "Preço";
  w1.getCell("D1").value = "Total";
  w1.getCell("A2").value = "Tinta";
  w1.getCell("B2").value = 3;
  w1.getCell("C2").value = 12.5;
  w1.getCell("C2").numFmt = '"R$" #,##0.00';
  w1.getCell("D2").value = { formula: "B2*C2", result: 37.5 };
  w1.getCell("D2").numFmt = "R$ #,##0.00";
  w1.getCell("A3").value = "Prazo";
  w1.getCell("B3").value = new Date(Date.UTC(2026, 9, 5));
  w1.getCell("B3").numFmt = "dd/mm/yyyy";
  w1.getCell("C3").value = 0.25;
  w1.getCell("C3").numFmt = "0.0%";
  w1.getCell("A4").value = { formula: "SUM(D2:D3)", result: 37.5 };
  w1.getCell("A5").value = "Mesclado";
  w1.mergeCells("A5:C5");
  w1.getColumn(1).width = 22;
  w1.getRow(2).height = 30;
  const w2 = wb.addWorksheet("Resumo");
  w2.getCell("A1").value = { formula: "Materiais!D2*2", result: 75 };
  w2.getCell("A2").value = { formula: "SUM(Materiais!B2:B3)", result: 3 };
  wb.addWorksheet("Oculta", { state: "hidden" }).getCell("A1").value = "x";
  const xbuf = new Uint8Array(await wb.xlsx.writeBuffer());
  const x = await importFile(xbuf, "obra.xlsx");
  eq(x.tabs.map((t) => t.name), ["Materiais", "Resumo", "Oculta"], "abas preservadas");
  const m = x.tabs[0];
  eq(m.grid[0][0].s?.b, 1, "negrito");
  eq(m.grid[0][0].s?.c, "#ff0000", "cor do texto");
  eq(m.grid[0][0].s?.bg, "#ffff00", "preenchimento");
  eq(m.grid[1][2].fmt, "brl:2", "formato moeda");
  eq(m.grid[1][3].f, "B2*C2", "fórmula preservada");
  eq(m.grid[1][3].v, 37.5, "resultado em cache");
  eq(m.grid[2][1].v, serialFromYMD(2026, 10, 5), "data como serial");
  eq(m.grid[2][1].fmt, "date", "formato data");
  eq(m.grid[2][2].fmt, "pct:1", "formato porcentagem");
  eq(m.merges, [{ r1: 4, c1: 0, r2: 4, c2: 2 }], "mesclagem");
  eq(m.frozenRows + "," + m.frozenCols, "1,1", "congelamento");
  eq(m.colW[0], Math.round(22 * 7 + 5), "largura da coluna");
  eq(m.rowH[1], 40, "altura da linha");
  eq(x.tabs[1].grid[0][0].f, "Materiais!D2*2", "fórmula entre abas");
  eq(x.warnings.some((w) => w.includes("Oculta")), true, "aviso de aba oculta");
  const pv = previewOf(x);
  eq(pv.tabs[0].formulas, 2, "prévia conta fórmulas");

  // ---- ida e volta xlsx
  const out = await toXlsx("obra", x.tabs);
  const back = await importFile(new Uint8Array(out), "volta.xlsx");
  eq(back.tabs.map((t) => t.name), ["Materiais", "Resumo", "Oculta"], "ida-e-volta: abas");
  eq(back.tabs[0].grid[1][3].f, "B2*C2", "ida-e-volta: fórmula");
  eq(back.tabs[0].grid[1][3].v, 37.5, "ida-e-volta: valor calculado gravado");
  eq(back.tabs[0].grid[1][2].fmt, "brl:2", "ida-e-volta: moeda");
  eq(back.tabs[0].grid[2][1].fmt, "date", "ida-e-volta: data");
  eq(back.tabs[0].grid[2][1].v, serialFromYMD(2026, 10, 5), "ida-e-volta: valor da data");
  eq(back.tabs[0].grid[0][0].s?.b, 1, "ida-e-volta: negrito");
  eq(back.tabs[0].grid[0][0].s?.bg, "#ffff00", "ida-e-volta: preenchimento");
  eq(back.tabs[0].merges.length, 1, "ida-e-volta: mesclagem");
  eq(back.tabs[0].frozenRows, 1, "ida-e-volta: congelamento");
  eq(back.tabs[1].grid[0][0].f, "Materiais!D2*2", "ida-e-volta: fórmula entre abas");
  eq(back.tabs[1].grid[0][0].v, 75, "ida-e-volta: cálculo entre abas");

  // ---- CSV exportado
  const csvOut = toCsv(x.tabs[0], "br", x.tabs);
  eq(csvOut.startsWith("﻿Item;Qtd;Preço;Total"), true, "CSV BR cabeçalho");
  eq(csvOut.includes("Tinta;3;12,5;37,5"), true, "CSV BR números com vírgula");
  eq(csvOut.includes("05/10/2026"), true, "CSV BR data");
  const csvUs = toCsv(x.tabs[0], "us", x.tabs);
  eq(csvUs.includes("Tinta,3,12.5,37.5"), true, "CSV internacional");

  // ---- CSV não vira fórmula no Excel
  {
    const t = tabOf({ 0: { 0: { v: "=1+1" }, 1: { v: "+55 11" }, 2: { v: "-" }, 3: { v: "@x" }, 4: { v: "normal" } } });
    eq(toCsv(t, "br").trim().replace(/^﻿/, ""), "'=1+1;+55 11;-;'@x;normal", "CSV protege contra injeção de fórmula");
  }

  // ---- ODS gerado à mão
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.spreadsheet");
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x" xmlns:style="s" xmlns:fo="f" xmlns:number="n"><office:automatic-styles>
<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="3cm"/></style:style>
<style:style style:name="b1" style:family="table-cell"><style:text-properties fo:font-weight="bold" fo:color="#ff0000"/></style:style>
<number:percentage-style style:name="N11"><number:number number:decimal-places="1"/><number:text>%</number:text></number:percentage-style>
</office:automatic-styles><office:body><office:spreadsheet>
<table:table table:name="Orçamento"><table:table-column table:style-name="co1" table:number-columns-repeated="2"/>
<table:table-row><table:table-cell table:style-name="b1" office:value-type="string"><text:p>Item</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Valor</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>Gesso</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="12.5"><text:p>12,5</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="date" office:date-value="2026-10-05"><text:p>05/10/2026</text:p></table:table-cell><table:table-cell table:formula="of:=SUM([.B2:.B2])*2" office:value-type="float" office:value="25"><text:p>25</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>Junto</text:p></table:table-cell><table:covered-table-cell/></table:table-row>
</table:table><table:table table:name="Outra"><table:table-row><table:table-cell office:value-type="float" office:value="1"><text:p>1</text:p></table:table-cell><table:table-cell table:formula="of:=[$Orçamento.B2]+1" office:value-type="float" office:value="13.5"><text:p>13,5</text:p></table:table-cell></table:table-row></table:table>
</office:spreadsheet></office:body></office:document-content>`,
  );
  const ods = await importFile(await zip.generateAsync({ type: "uint8array" }), "planilha.ods");
  eq(ods.tabs.map((t) => t.name), ["Orçamento", "Outra"], "ODS abas");
  eq(ods.tabs[0].grid[0][0].s?.b, 1, "ODS negrito");
  eq(ods.tabs[0].grid[1][1].v, 12.5, "ODS número");
  eq(ods.tabs[0].grid[2][0].fmt, "date", "ODS data");
  eq(ods.tabs[0].grid[2][1].f, "SUM(B2:B2)*2", "ODS fórmula");
  eq(ods.tabs[0].colW[0], Math.round(3 * 37.8), "ODS largura");
  eq(ods.tabs[0].merges, [{ r1: 3, c1: 0, r2: 3, c2: 1 }], "ODS mesclagem");
  eq(ods.tabs[1].grid[0][1].f, "'Orçamento'!B2+1", "ODS fórmula entre abas");

  // ---- XLS (BIFF8) mínimo, montado aqui
  const xls = await importFile(buildXls(), "antigo.xls");
  eq(xls.tabs.map((t) => t.name), ["Dados"], "XLS aba");
  eq(xls.tabs[0].grid[0][0].v, "Olá", "XLS texto (SST)");
  eq(xls.tabs[0].grid[0][1].v, 42, "XLS número");
  eq(xls.tabs[0].grid[1][0].v, 1.25, "XLS RK");
  eq(xls.tabs[0].merges, [{ r1: 2, c1: 0, r2: 2, c2: 1 }], "XLS mesclagem");

  // ---- erros esperados
  let msg = "";
  try {
    await importFile(Buffer.from("lixo"), "x.docx");
  } catch (e) {
    msg = (e as Error).message;
  }
  eq(/não suportado/i.test(msg), true, "formato inválido");
  msg = "";
  try {
    await importFile(Buffer.from("lixo"), "x.xlsx");
  } catch (e) {
    msg = (e as Error).message;
  }
  eq(msg.length > 0, true, "xlsx corrompido dá erro amigável");

  console.log(fail ? `\n${fail} de ${n} testes falharam.` : `OK — ${n} verificações de planilhas passaram.`);
  process.exit(fail ? 1 : 0);
}

/* ---------- gerador mínimo de .xls (OLE2 + BIFF8) só para o teste ---------- */
function buildXls(): Uint8Array {
  const rec = (id: number, data: number[]) => [id & 255, id >> 8, data.length & 255, data.length >> 8, ...data];
  const u16 = (v: number) => [v & 255, (v >> 8) & 255];
  const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const f64 = (v: number) => [...new Uint8Array(new Float64Array([v]).buffer)];
  const str = (s: string) => [...u16(s.length), 0, ...[...s].map((c) => c.charCodeAt(0))];
  // SST: "Olá" em Latin-1 (flag 0) e "x"
  const sstData = [...u32(2), ...u32(2), ...str("Olá"), ...str("x")];
  const bof = (type: number) => rec(0x809, [...u16(0x600), ...u16(type), ...u16(0x1dbb), ...u16(0x07cc), ...u32(0), ...u32(0x600)]);
  const sheetName = [...Buffer.from("Dados", "latin1")];
  const bs = (offset: number) => rec(0x85, [...u32(offset), 0, 0, sheetName.length, 0, ...sheetName]);
  const globalsLen = bof(5).length + rec(0xfc, sstData).length + bs(0).length + rec(0x0a, []).length;
  const sheet = [
    ...bof(0x10),
    ...rec(0xfd, [...u16(0), ...u16(0), ...u16(0), ...u32(0)]), // A1 = SST[0]
    ...rec(0x203, [...u16(0), ...u16(1), ...u16(0), ...f64(42)]), // B1 = 42
    ...rec(0x27e, [...u16(1), ...u16(0), ...u16(0), ...u32((125 << 2) | 2 | 1)]), // A2 = RK inteiro 125 / 100
    ...rec(0xe5, [...u16(1), ...u16(2), ...u16(2), ...u16(0), ...u16(1)]), // mescla A3:B3
    ...rec(0x0a, []),
  ];
  const wbs = [...bof(5), ...rec(0xfc, sstData), ...bs(globalsLen), ...rec(0x0a, []), ...sheet];
  while (wbs.length < 4096) wbs.push(0);
  const secs = Math.ceil(wbs.length / 512);
  const out = new Uint8Array(512 * (2 + secs + 1));
  const dv = new DataView(out.buffer);
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  dv.setUint16(24, 0x3e, true);
  dv.setUint16(26, 3, true);
  dv.setUint16(28, 0xfffe, true);
  dv.setUint16(30, 9, true);
  dv.setUint16(32, 6, true);
  dv.setUint32(44, 1, true);
  dv.setUint32(48, 1, true);
  dv.setUint32(56, 4096, true);
  dv.setUint32(60, 0xfffffffe, true);
  dv.setUint32(68, 0xfffffffe, true);
  for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i === 0 ? 0 : 0xffffffff, true);
  // FAT no setor 0 (offset 512)
  const fat = new Uint32Array(128).fill(0xffffffff);
  fat[0] = 0xfffffffd;
  fat[1] = 0xfffffffe;
  for (let i = 0; i < secs; i++) fat[2 + i] = i === secs - 1 ? 0xfffffffe : 3 + i;
  new Uint8Array(out.buffer, 512, 512).set(new Uint8Array(fat.buffer));
  // diretório no setor 1
  const dirAt = 1024;
  const entry = (i: number, name: string, type: number, start: number, size: number, child = 0xffffffff) => {
    const o = dirAt + i * 128;
    for (let k = 0; k < name.length; k++) dv.setUint16(o + k * 2, name.charCodeAt(k), true);
    dv.setUint16(o + 64, (name.length + 1) * 2, true);
    out[o + 66] = type;
    out[o + 67] = 1;
    dv.setUint32(o + 68, 0xffffffff, true);
    dv.setUint32(o + 72, 0xffffffff, true);
    dv.setUint32(o + 76, child, true);
    dv.setUint32(o + 116, start, true);
    dv.setUint32(o + 120, size, true);
  };
  entry(0, "Root Entry", 5, 0xfffffffe, 0, 1);
  entry(1, "Workbook", 2, 2, wbs.length);
  new Uint8Array(out.buffer, 1536, wbs.length).set(wbs);
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
