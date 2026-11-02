/**
 * Testes das funções de fórmula (biblioteca completa), derramamento de matrizes, SUBTOTAL, referências,
 * alça de preenchimento e compatibilidade .xlsx. Chamado por scripts/test-sheets.ts.
 */
import JSZip from "jszip";
import { Book, canonicalFormula, displayFormula, offsetFormula, parseFormula, type V } from "../src/lib/sheets/formula";
import { FUNCTIONS, FUNCTION_NAMES, STUDIO_EXAMPLES, XLFN, fnArgs, searchFunctions } from "../src/lib/sheets/functions";
import { FErr, errLabel, formatValue, serialFromYMD } from "../src/lib/sheets/format";
import { fillLine } from "../src/lib/sheets/ops";
import { importFile } from "../src/lib/sheets/import";
import { toXlsx } from "../src/lib/sheets/export";
import { emptyTab, type Cell, type Grid, type TabData } from "../src/lib/sheets/types";
import { applySuggestion, closeParens, formulaContext, hintParts, insertFunctionAt, refSpans, suggest, toggleAbsolute } from "../src/lib/sheets/assist";
import { errInfo } from "../src/lib/sheets/errors";

type Eq = (a: unknown, b: unknown, m: string) => void;

const D = (y: number, m: number, d: number) => serialFromYMD(y, m, d);

export async function runFnTests(eq: Eq) {
  const grid: Grid = {};
  const put = (r: number, c: number, cell: Cell) => {
    (grid[r] ??= {})[c] = cell;
  };
  // A1:A10 números; B1:B5 categorias; C1:C5 valores
  [10, 20, 30, 40, 50, 50, 60, 70, 80, 90].forEach((v, i) => put(i, 0, { v }));
  ["Pintura", "Reboco", "Pintura", "Piso", "Pintura"].forEach((v, i) => put(i, 1, { v }));
  [100, 200, 300, 400, 500].forEach((v, i) => put(i, 2, { v }));
  put(0, 3, { v: D(2026, 1, 5) });
  // F: subtotais aninhados
  put(0, 5, { v: 10 });
  put(1, 5, { v: 20 });
  put(2, 5, { f: "SUBTOTAL(9,F1:F2)" });
  put(3, 5, { v: 100 });
  // H: erro no meio
  put(0, 7, { v: 1 });
  put(1, 7, { f: "1/0" });
  put(2, 7, { v: 3 });
  // I: fluxo
  put(0, 8, { v: -100 });
  put(1, 8, { v: 110 });
  // derramamento
  put(0, 9, { f: "UNIQUE(B1:B5)" });
  put(0, 10, { f: "SORT(C1:C5,1,FALSE)" });
  put(0, 11, { f: "SEQUENCE(3,2)" });
  put(0, 13, { f: "TRANSPOSE(C1:C3)" });
  put(5, 16, { f: "FILTER(C1:C5,C1:C5>250)" });
  put(5, 17, { f: 'SPLIT("a;b;c",";")' });
  put(8, 18, { f: "ARRAYFORMULA(C1:C5*2)" });
  put(8, 19, { f: 'ARRAYFORMULA(IF(C1:C5>250,"alto","baixo"))' });
  put(20, 22, { f: "SEQUENCE(3)" });
  put(21, 22, { v: 5 });

  const make = (f: string, bt: Partial<{ hiddenFilter: Set<number>; hiddenManual: Set<number> }> = {}) => {
    const g: Grid = { ...grid, 99: { 0: { f: canonicalFormula(f) ?? f } } };
    return new Book([{ name: "Aba1", grid: g, ...bt }, { name: "Aba 2", grid: { 0: { 0: { v: 7 } } } }]);
  };
  const calc = (f: string, bt?: Parameters<typeof make>[1]): V => make(f, bt).get(0, 99, 0);
  const show = (v: V) => (v instanceof FErr ? v.code : v);
  const near = (v: V, x: number, d = 4, m = "") => {
    const ok = typeof v === "number" && Math.abs(v - x) < Math.pow(10, -d);
    eq(ok ? x : show(v), x, `${m} ≈ ${x}`);
  };
  const t = (f: string, expected: unknown) => eq(show(calc(f)), expected, f);

  /* ---- registro: uma única tabela PT/EN ---- */
  eq(FUNCTION_NAMES.length, FUNCTIONS.length, "tabela única de funções");
  eq(FUNCTIONS.length >= 150, true, "pelo menos 150 funções");
  const en = new Set(FUNCTIONS.map((f) => f.en));
  eq(en.size, FUNCTIONS.length, "nomes EN únicos");
  eq(new Set(FUNCTIONS.map((f) => f.pt)).size, FUNCTIONS.length, "nomes PT únicos");
  for (const f of FUNCTIONS) {
    // toda função da tabela tem implementação (chamada sem argumentos nunca dá #NAME?)
    const v = calc(`${f.en}()`);
    eq(v instanceof FErr && v.code === "#NAME?", false, `implementada: ${f.en}`);
    // exemplo digitável e sem #NAME?
    const ex = calc(f.ex);
    eq(ex instanceof FErr && (ex.code === "#NAME?" || ex.code === "#ERRO!"), false, `exemplo de ${f.pt}: ${f.ex} → ${show(ex)}`);
    eq(canonicalFormula(f.ex) !== null, true, `exemplo parseia: ${f.ex}`);
    eq(displayFormula(canonicalFormula(f.ex)!).startsWith(f.pt) || f.ex.includes(f.pt), true, `volta ao português: ${f.pt}`);
  }
  for (const ex of STUDIO_EXAMPLES) eq(canonicalFormula(ex.formula) !== null, true, `exemplo do estúdio parseia: ${ex.title}`);
  eq(fnArgs(FUNCTIONS.find((f) => f.en === "SUM")!).map((a) => a.optional), [false, true], "argumentos de SOMA");
  eq(searchFunctions("soma")[0].pt, "SOMA", "busca por prefixo PT");
  eq(searchFunctions("sumif")[0].en, "SUMIF", "busca por nome EN");
  eq(searchFunctions("procv")[0].pt, "PROCV", "busca PROCV");

  /* ---- matemática ---- */
  t("TRUNCAR(8,97)", 8);
  t("TRUNC(-8,97)", -8);
  t("TRUNCAR(3,14159;2)", 3.14);
  t("SINAL(-5)", -1);
  t("MARRED(17;5)", 15);
  t("MARRED(-17;-5)", -15);
  eq(show(calc("MARRED(5;-2)")), "#NUM!", "MARRED sinais diferentes");
  t("SOMAQUAD(A1:A3)", 1400);
  t("MDC(12;18)", 6);
  t("MMC(4;6)", 12);
  t("FATORIAL(5)", 120);
  eq(show(calc("FATORIAL(-1)")), "#NUM!", "FATORIAL negativo");
  t("COMBIN(5;2)", 10);
  t("LN(1)", 0);
  t("LOG10(1000)", 3);
  t("COS(0)", 1);
  t("GRAUS(PI())", 180);
  t("ALEATÓRIOENTRE(5;5)", 5);
  t("E(ALEATÓRIO()>=0;ALEATÓRIO()<1)", true);
  eq(show(calc("LN(0)")), "#NUM!", "LN(0)");
  t("TETO(17;5)", 20);
  t("ARREDONDAR.PARA.CIMA(3,141;2)", 3.15);

  /* ---- estatística ---- */
  t("MENOR(A1:A10;2)", 20);
  t("MAIOR(A1:A10;1)", 90);
  eq(show(calc("MAIOR(A1:A10;11)")), "#NUM!", "MAIOR fora");
  t("ORDEM(50;A1:A10)", 5);
  t("ORDEM(50;A1:A10;1)", 5);
  t("PERCENTIL(A1:A10;0,5)", 50);
  t("QUARTIL(A1:A10;1)", 32.5);
  t("QUARTIL(A1:A10;0)", 10);
  near(calc("DESVPAD(C1:C5)"), 158.113883, 5, "DESVPAD");
  near(calc("DESVPAD.P(C1:C5)"), 141.42136, 4, "DESVPAD.P");
  t("VAR(C1:C5)", 25000);
  t("VAR.P(C1:C5)", 20000);
  eq(show(calc("DESVPAD(A1)")), "#DIV/0!", "DESVPAD com 1 valor");
  t("MODO(A1:A10)", 50);
  eq(show(calc("MODO(C1:C5)")), "#N/A", "MODO sem repetição");
  t("CONT.ÚNICOS(B1:B5)", 3);
  t("MÉDIASES(C1:C5;B1:B5;\"Pintura\")", 300);
  eq(show(calc('MÉDIASES(C1:C5;B1:B5;"Nada")')), "#DIV/0!", "MÉDIASES sem correspondência");
  t("AVERAGEIFS(C1:C5,B1:B5,\"Pintura\",C1:C5,\">100\")", 400);
  near(calc("ORDEM.PORCENTUAL(A1:A10;40)"), 0.333, 3, "ORDEM.PORCENTUAL");
  t("SUBTOTAL(9;C1:C5)", 1500);
  t("SUBTOTAL(1;C1:C5)", 300);
  t("SUBTOTAL(2;C1:C5)", 5);
  t("SUBTOTAL(4;C1:C5)", 500);
  t("SUBTOTAL(9;F1:F4)", 130); // ignora o SUBTOTAL aninhado em F3
  eq(show(calc("SUBTOTAL(9;C1:C5)", { hiddenFilter: new Set([1]) })), 1300, "SUBTOTAL ignora linha filtrada");
  eq(show(calc("SUBTOTAL(9;C1:C5)", { hiddenManual: new Set([0]) })), 1500, "SUBTOTAL 9 conta ocultas à mão");
  eq(show(calc("SUBTOTAL(109;C1:C5)", { hiddenManual: new Set([0]) })), 1400, "SUBTOTAL 109 ignora ocultas à mão");
  t("AGREGAR(9;6;H1:H3)", 4);
  eq(show(calc("SOMA(H1:H3)")), "#DIV/0!", "SOMA propaga erro");
  t("AGGREGATE(14;6;A1:A10;2)", 80);
  t("SOMA(H1:H1)", 1);

  /* ---- lógica ---- */
  t('SENÃODISP(NÃO.DISP();"x")', "x");
  eq(show(calc('SENÃODISP(1/0;"x")')), "#DIV/0!", "SENÃODISP só trata #N/D");
  t("OUEXCLUSIVO(VERDADEIRO;FALSO)", true);
  t("XOR(1;1)", false);
  t('PARÂMETRO(2;1;"a";2;"b";"z")', "b");
  t('PARÂMETRO(9;1;"a";"z")', "z");
  eq(show(calc('PARÂMETRO(9;1;"a")')), "#N/A", "PARÂMETRO sem padrão");
  t('ESCOLHER(2;"a";"b";"c")', "b");
  t("VERDADEIRO()", true);
  t("FALSO()", false);
  t("ÉPAR(4)", true);
  t("ÉIMPAR(4)", false);
  t('N("a")', 0);
  t("N(5)", 5);
  t("ÉNÃO.DISP(NÃO.DISP())", true);
  t("ÉERROS(1/0)", true);
  t("ÉERROS(NÃO.DISP())", false);
  t("ÉLÓGICO(1>0)", true);
  t('SES(A1>100;"a";A1>5;"b")', "b");
  t('SE(E(A1>5;A2>5);"ok";"não")', "ok");

  /* ---- texto ---- */
  t('PROCURAR("a";"banana")', 2);
  eq(show(calc('PROCURAR("A";"banana")')), "#VALUE!", "PROCURAR diferencia maiúsculas");
  t('LOCALIZAR("A";"banana")', 2);
  t('LOCALIZAR("*na";"banana")', 1);
  t('EXATO("a";"A")', false);
  t('MUDAR("abcdef";2;3;"X")', "aXef");
  t("CARACT(65)", "A");
  t('CÓDIGO("A")', 65);
  t('TIRAR(CARACT(7)&"x")', "x");
  t('VALORNUMÉRICO("1.234,50")', 1234.5);
  t('VALORNUMÉRICO("25%")', 0.25);
  t("DEF.NÚM.DEC(1234,5;2)", "1.234,50");
  t("DEF.NÚM.DEC(1234,5;1;VERDADEIRO)", "1234,5");
  t("MOEDA(1234,5)", "R$ 1.234,50");
  t('TEXTOANTES("a-b-c";"-")', "a");
  t('TEXTODEPOIS("a-b-c";"-";2)', "c");
  t('TEXTOANTES("a-b-c";"-";-1)', "a-b");
  eq(show(calc('TEXTOANTES("abc";"-")')), "#N/A", "TEXTOANTES sem delimitador");
  t('SUBSTITUIR("a-b-c";"-";"+";2)', "a-b+c");
  t('SUBSTITUIR("a-b-c";"-";"+")', "a+b+c");
  t('TEXTO(DATA(2026;11;2);"dd/mm/aaaa")', "02/11/2026");
  t('TEXTO(0,256;"0%")', "26%");
  t('TEXTO(1234,5;"#.##0,00")', "1.234,50");
  t('UNIRTEXTO("-";VERDADEIRO;"a";"";"b")', "a-b");

  /* ---- data e hora ---- */
  t('DATA.VALOR("25/12/2026")', D(2026, 12, 25));
  t('DATA.VALOR("2026-03-01")', D(2026, 3, 1));
  eq(show(calc('DATA.VALOR("abc")')), "#VALUE!", "DATA.VALOR inválida");
  t('VALOR.TEMPO("12:00")', 0.5);
  t("TEMPO(12;0;0)", 0.5);
  t("HORA(0,75)", 18);
  t("MINUTO(TEMPO(14;30;0))", 30);
  t("SEGUNDO(TEMPO(0;0;45))", 45);
  t('DATADIF(DATA(2020;1;15);DATA(2026;3;10);"Y")', 6);
  t('DATADIF(DATA(2020;1;15);DATA(2026;3;10);"M")', 73);
  t('DATADIF(DATA(2020;1;15);DATA(2026;3;10);"YM")', 1);
  t('DATADIF(DATA(2020;1;15);DATA(2026;3;10);"MD")', 23);
  t('DATADIF(DATA(2026;1;1);DATA(2026;1;31);"D")', 30);
  t('DATADIF(DATA(2025;6;1);DATA(2026;7;15);"YD")', 44);
  eq(show(calc('DATADIF(DATA(2026;3;10);DATA(2020;1;15);"Y")')), "#NUM!", "DATADIF fim antes do início");
  t("DIATRABALHOTOTAL(DATA(2026;1;5);DATA(2026;1;11))", 5);
  t("DIATRABALHOTOTAL(DATA(2026;1;5);DATA(2026;1;11);DATA(2026;1;7))", 4);
  t("DIATRABALHOTOTAL(DATA(2026;1;11);DATA(2026;1;5))", -5);
  t("DIATRABALHOTOTAL.INTL(DATA(2026;1;5);DATA(2026;1;11);11)", 6);
  t('DIATRABALHOTOTAL.INTL(DATA(2026;1;5);DATA(2026;1;11);"0000011")', 5);
  t("DIATRABALHO(DATA(2026;1;5);5)", D(2026, 1, 12));
  t("DIATRABALHO(DATA(2026;1;5);5;DATA(2026;1;7))", D(2026, 1, 13));
  t("DIATRABALHO(DATA(2026;1;12);-1)", D(2026, 1, 9));
  t("DIATRABALHO.INTL(DATA(2026;1;5);6;11)", D(2026, 1, 12));
  t("WORKDAY(DATA(2026;1;9);1)", D(2026, 1, 12));
  t("NÚMSEMANA(DATA(2026;1;1))", 1);
  t("NÚMSEMANA(DATA(2026;1;5);2)", 2);
  t("NÚMSEMANA(DATA(2026;1;4))", 2);
  t("NÚMSEMANAISO(DATA(2026;1;1))", 1);
  t("NÚMSEMANAISO(DATA(2025;12;29))", 1);
  t("NÚMSEMANAISO(DATA(2021;1;3))", 53);
  t("FRAÇÃOANO(DATA(2026;1;1);DATA(2026;7;1))", 0.5);
  t("FRAÇÃOANO(DATA(2026;1;1);DATA(2027;1;1);3)", 1);
  t("DIAS(DATA(2026;3;1);DATA(2026;2;1))", 28);
  t("DATAM(DATA(2026;1;31);1)", D(2026, 2, 28));
  t("FIMMÊS(DATA(2026;2;10);0)", D(2026, 2, 28));

  /* ---- busca e referência ---- */
  t("PROC(45;A1:A10)", 40);
  t("ENDEREÇO(2;3)", "$C$2");
  t("ENDEREÇO(2;3;4)", "C2");
  t('ENDEREÇO(1;1;1;VERDADEIRO;"Aba 2")', "'Aba 2'!$A$1");
  t("LINS(A1:A10)", 10);
  t("COLS(A1:C3)", 3);
  t("DESLOC(A1;2;0)", 30);
  t("SOMA(DESLOC(A1;0;0;3;1))", 60);
  t('INDIRETO("A"&2)', 20);
  t('SOMA(INDIRETO("A1:A3"))', 60);
  eq(show(calc('INDIRETO("xx yy")')), "#REF!", "INDIRETO inválido");
  t("'Aba 2'!A1*2", 14);
  t("SOMA('Aba 2'!A1:A3)", 7);
  eq(show(calc("Inexistente!A1")), "#REF!", "aba inexistente");
  t('PROCV("Piso";B1:C5;2;FALSO)', 400);
  t('ÍNDICE(C1:C5;CORRESP("Piso";B1:B5;0))', 400);
  t('PROCX("Piso";B1:B5;C1:C5)', 400);
  t('SEERRO(PROCV("Nada";B1:C5;2;FALSO);"não achei")', "não achei");
  t('SOMASE(B1:B5;"Pintura";C1:C5)', 900);
  t('CONT.SES(B1:B5;"Pintura";C1:C5;">100")', 2);
  t('MÁXIMOSES(C1:C5;B1:B5;"Pintura")', 500);

  /* ---- financeiras ---- */
  near(calc("PGTO(1%;12;-10000)"), 888.4879, 3, "PGTO");
  near(calc("PGTO(0;10;-1000)"), 100, 6, "PGTO sem juros");
  near(calc("IPGTO(1%;1;12;-10000)"), 100, 4, "IPGTO");
  near(calc("PPGTO(1%;1;12;-10000)"), 788.4879, 3, "PPGTO");
  near(calc("IPGTO(1%;3;12;-10000)") as number + (calc("PPGTO(1%;3;12;-10000)") as number), 888.4879, 3, "IPGTO+PPGTO=PGTO");
  near(calc("VF(0,5%;12;-500)"), 6167.78, 2, "VF");
  near(calc("VP(1%;12;-500)"), 5627.54, 2, "VP");
  near(calc("NPER(1%;-900;10000)"), 11.8377, 3, "NPER");
  near(calc("TAXA(12;-888,4879;10000)"), 0.01, 5, "TAXA");
  near(calc("VPL(10%;100;100;100)"), 248.685, 3, "VPL");
  near(calc("TIR(I1:I2)"), 0.1, 6, "TIR");
  t("DPD(10000;1000;5)", 1800);
  near(calc("EFETIVA(12%;12)"), 0.126825, 6, "EFETIVA");
  near(calc("NOMINAL(EFETIVA(12%;12);12)"), 0.12, 6, "NOMINAL");
  near(calc("BDD(1000000;100000;6;1;7)"), 186083.33, 2, "BDD período 1");
  near(calc("BDD(1000000;100000;6;2;7)"), 259639.42, 2, "BDD período 2");
  eq(show(calc("TIR(A1:A2)")), "#NUM!", "TIR sem sinais opostos");

  /* ---- matrizes derramadas ---- */
  const b = make("1");
  eq([b.get(0, 0, 9), b.get(0, 1, 9), b.get(0, 2, 9)], ["Pintura", "Reboco", "Piso"], "ÚNICO derrama para baixo");
  eq(b.get(0, 3, 9), null, "ÚNICO não passa do necessário");
  eq([0, 1, 2, 3, 4].map((i) => b.get(0, i, 10)), [500, 400, 300, 200, 100], "CLASSIFICAR decrescente");
  eq([b.get(0, 0, 11), b.get(0, 0, 12), b.get(0, 1, 11), b.get(0, 2, 12)], [1, 2, 3, 6], "SEQUÊNCIA 3x2");
  eq([b.get(0, 0, 13), b.get(0, 0, 14), b.get(0, 0, 15)], [100, 200, 300], "TRANSPOR");
  eq([5, 6, 7].map((i) => b.get(0, i, 16)), [300, 400, 500], "FILTRAR");
  eq([b.get(0, 5, 17), b.get(0, 5, 18), b.get(0, 5, 19)], ["a", "b", "c"], "DIVIDIR");
  eq([8, 9, 10, 11, 12].map((i) => b.get(0, i, 18)), [200, 400, 600, 800, 1000], "ARRAYFORMULA multiplica");
  eq([b.get(0, 8, 19), b.get(0, 10, 19)], ["baixo", "alto"], "ARRAYFORMULA com SE");
  eq(show(b.get(0, 20, 22)), "#REF!", "derramamento bloqueado por célula ocupada");
  eq(b.spills(0).length >= 7, true, "regiões derramadas listadas");
  eq(show(calc("CONT.VALORES(J1:J10)")), 3, "intervalo enxerga células derramadas");
  eq(show(calc("SOMA(K1:K5)")), 1500, "SOMA de intervalo derramado");
  eq(show(calc("SOMA(ÚNICO(C1:C5))")), 1500, "função de matriz dentro de agregação");
  eq(show(calc("CONT.ÚNICOS(B1:B5)")), 3, "CONT.ÚNICOS");
  eq(show(calc('MATRIZ.MULT(C1:C2;C1:C2)')), "#VALUE!", "MMULT dimensões incompatíveis");

  /* ---- ciclos e erros ---- */
  const cyc = new Book([{ name: "A", grid: { 0: { 0: { f: "A2" }, 1: { f: "B1" } }, 1: { 0: { f: "A1" } } } }]);
  eq(show(cyc.get(0, 0, 0)), "#CIRC!", "ciclo A1→A2→A1");
  eq(show(cyc.get(0, 0, 1)), "#CIRC!", "autorreferência");
  eq(errLabel("#NAME?"), "#NOME?", "rótulo PT #NOME?");
  eq(errLabel("#VALUE!"), "#VALOR!", "rótulo PT #VALOR!");
  eq(errLabel("#N/A"), "#N/D", "rótulo PT #N/D");
  eq(errLabel("#DIV/0!"), "#DIV/0!", "rótulo #DIV/0!");
  eq(formatValue(new FErr("#NAME?")), "#NOME?", "célula exibe #NOME?");
  eq(show(calc("SOMMA(A1:A3)")), "#NAME?", "função escrita errada → #NAME?");
  eq(show(calc("A1/0")), "#DIV/0!", "divisão por zero");
  eq(show(calc('"a"+1')), "#VALUE!", "texto em conta → #VALUE!");
  eq(show(calc("#NOME?")), "#NAME?", "digitar #NOME? vira #NAME?");
  eq(canonicalFormula("A1+")?.length, undefined, "fórmula incompleta é inválida");
  eq(canonicalFormula("SOMA(A1;B1"), null, "parêntese sem fechar é inválido");

  /* ---- referências relativas/absolutas, alça de preenchimento, copiar/colar ---- */
  eq(offsetFormula("A1*$B$1+C$2+$D3", 2, 1), "B3*$B$1+D$2+$D5", "relativas, absolutas e mistas");
  eq(offsetFormula("SUM(A1:A3)", 1, 0), "SUM(A2:A4)", "intervalo desce");
  eq(offsetFormula("SUM(A1:B2)", 0, 2), "SUM(C1:D2)", "intervalo vai à direita");
  eq(offsetFormula("SUM($A$1:A3)", 1, 0), "SUM($A$1:A4)", "intervalo com âncora");
  eq(offsetFormula("Aba2!A1+'Aba 2'!B2", 1, 1), "Aba2!B2+'Aba 2'!C3", "ajusta referência entre abas");
  eq(offsetFormula("A1", -1, 0), "#REF!", "sai da planilha → #REF!");
  eq(offsetFormula("SUM(A:A)", 0, 1), "SUM(B:B)", "coluna inteira");
  eq(offsetFormula("IF(A1>10,\"alto\",\"baixo\")", 2, 0), 'IF(A3>10,"alto","baixo")', "texto na fórmula não muda");
  const filled = fillLine([{ f: "A1*B1", v: 1 }], 3, 1, "row").map((c) => c?.f);
  eq(filled, ["A2*B2", "A3*B3", "A4*B4"], "alça: copia fórmula descendo");
  eq(fillLine([{ f: "A1+$B$1" }], 2, 1, "col").map((c) => c?.f), ["B1+$B$1", "C1+$B$1"], "alça: à direita com absoluta");
  eq(fillLine([{ f: "A3*2" }], 2, -1, "row").map((c) => c?.f), ["A2*2", "A1*2"], "alça: para cima");
  eq(fillLine([{ v: 10 }, { v: 20 }], 3, 1, "row").map((c) => c?.v), [30, 40, 50], "alça: padrão numérico");
  eq(fillLine([{ v: D(2026, 1, 1), fmt: "date" }, { v: D(2026, 1, 2), fmt: "date" }], 2, 1, "row").map((c) => c?.v), [D(2026, 1, 3), D(2026, 1, 4)], "alça: padrão de datas");

  /* ---- dependências e recálculo ---- */
  const g1: Grid = { 0: { 0: { v: 2 }, 1: { f: "A1*10" }, 2: { f: "B1+1" } } };
  eq(new Book([{ name: "A", grid: g1 }]).get(0, 0, 2), 21, "cadeia de dependências");
  const g2: Grid = { 0: { 0: { v: 5 }, 1: { f: "A1*10" }, 2: { f: "B1+1" } } };
  eq(new Book([{ name: "A", grid: g2 }]).get(0, 0, 2), 51, "recalcula ao mudar o precedente");
  const two = new Book([
    { name: "Resumo", grid: { 0: { 0: { f: "Dados!A1+Dados!A2" } } } },
    { name: "Dados", grid: { 0: { 0: { v: 3 } }, 1: { 0: { v: 4 } } } },
  ]);
  eq(two.get(0, 0, 0), 7, "fórmula entre abas");

  /* ---- compatibilidade .xlsx: _xlfn. ---- */
  eq(XLFN.has("IFS") && XLFN.has("XLOOKUP") && XLFN.has("STDEV.S") && XLFN.has("TEXTJOIN"), true, "lista _xlfn");
  const xt: TabData = {
    ...emptyTab("x1", "Calc"),
    grid: {
      0: { 0: { v: 5 }, 1: { v: 7 }, 2: { f: 'IFS(A1>1,"a",TRUE,"b")' }, 3: { f: "STDEV.S(A1:B1)" }, 4: { f: "SUM(A1:B1)" }, 5: { f: 'TEXTJOIN(",",TRUE,A1:B1)' } },
      1: { 0: { f: "AVERAGEIFS(A1:B1,A1:B1,\">0\")" }, 1: { f: "WORKDAY(DATE(2026,1,5),5)" }, 2: { f: 'XLOOKUP(5,A1:B1,A1:B1)' }, 3: { f: "PMT(1%,12,-1000)" } },
    },
  };
  const buf = await toXlsx("x", [xt]);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  eq(xml.includes("_xlfn.IFS("), true, "xlsx grava _xlfn.IFS");
  eq(xml.includes("_xlfn.STDEV.S("), true, "xlsx grava _xlfn.STDEV.S");
  eq(xml.includes("_xlfn.TEXTJOIN("), true, "xlsx grava _xlfn.TEXTJOIN");
  eq(xml.includes("_xlfn.XLOOKUP("), true, "xlsx grava _xlfn.XLOOKUP");
  eq(xml.includes("_xlfn.SUM") || xml.includes("_xlfn.PMT") || xml.includes("_xlfn.WORKDAY"), false, "xlsx não prefixa funções antigas");
  const back = await importFile(new Uint8Array(buf), "calc.xlsx");
  const bg = back.tabs[0].grid;
  eq(bg[0][2].f, 'IFS(A1>1,"a",TRUE,"b")', "importa sem prefixo: IFS");
  eq(bg[0][3].f, "STDEV.S(A1:B1)", "importa sem prefixo: STDEV.S");
  eq(bg[1][2].f, "XLOOKUP(5,A1:B1,A1:B1)", "importa sem prefixo: XLOOKUP");
  eq(displayFormula(bg[0][3].f!), "DESVPAD.A(A1:B1)", "fórmula importada aparece em português");
  eq(displayFormula(bg[1][0].f!), 'MÉDIASES(A1:B1;A1:B1;">0")', "AVERAGEIFS aparece como MÉDIASES");
  eq(canonicalFormula("_xlfn.IFS(A1>1,1,2)"), "IFS(A1>1,1,2)", "canônica remove _xlfn.");
  eq(canonicalFormula("_xlfn._xlws.FILTER(A1:A3,A1:A3>1)"), "FILTER(A1:A3,A1:A3>1)", "canônica remove _xlws.");
  eq(parseFormula("DATADIF(A1;B1;\"Y\")").t, "call", "DATADIF parseia");
  eq(canonicalFormula('DATADIF(A1;B1;"M")'), 'DATEDIF(A1,B1,"M")', "DATADIF → DATEDIF");
  eq(canonicalFormula("DIATRABALHOTOTAL.INTL(A1;B1;11)"), "NETWORKDAYS.INTL(A1,B1,11)", "nome com ponto");
  eq(canonicalFormula("ORDEM.EQV(A1;A:A)"), "RANK(A1,A:A)", "apelido ORDEM.EQV");

  /* ---- ajudas de digitação (autocompletar, dica, destaque, F4) ---- */
  let cx = formulaContext("=SO", 3);
  eq(cx.typing?.text, "SO", "autocompletar: trecho digitado");
  eq(suggest(cx)[0].pt, "SOMA", "autocompletar: SOMA primeiro");
  eq(suggest(cx).some((f) => f.pt === "SOMASE"), true, "autocompletar: SOMASE na lista");
  eq(formulaContext("=sum", 4).typing?.text, "sum", "autocompletar aceita nome em inglês");
  eq(suggest(formulaContext("=sum", 4))[0].en, "SUM", "autocompletar EN → SUM");
  eq(formulaContext("=A1+B2", 6).typing, null, "referência de célula não abre sugestões");
  eq(formulaContext("=2*3", 4).typing, null, "número não abre sugestões");
  eq(formulaContext('="so', 4).typing, null, "dentro de texto não abre sugestões");
  eq(formulaContext("abc", 3).typing, null, "texto comum não é fórmula");
  eq(formulaContext("=SOMA(A1:A3)", 12).typing, null, "depois de fechar não sugere");
  const ap = applySuggestion("=SO", cx, suggest(cx)[0]);
  eq(ap, { text: "=SOMA(", caret: 6 }, "aceitar sugestão insere SOMA(");
  const cx2 = formulaContext("=1+SE", 5);
  eq(applySuggestion("=1+SE", cx2, suggest(cx2)[0]).text.startsWith("=1+SE"), true, "aceitar no meio da fórmula");
  cx = formulaContext("=SE(A1>10;", 10);
  eq([cx.call?.def.pt, cx.call?.argIndex], ["SE", 1], "dica: segundo argumento do SE");
  cx = formulaContext('=SE(A1>10;"a;b";', 17);
  eq(cx.call?.argIndex, 2, "dica: ponto e vírgula dentro de texto não conta");
  cx = formulaContext("=SE(SOMA(A1:A3)>1;", 18);
  eq([cx.call?.def.pt, cx.call?.argIndex], ["SE", 1], "dica: função aninhada já fechada volta ao SE");
  cx = formulaContext("=SE(SOMA(A1;", 12);
  eq([cx.call?.def.pt, cx.call?.argIndex], ["SOMA", 1], "dica: função aninhada aberta");
  cx = formulaContext("=ARRED(3,14;", 12);
  eq(cx.call?.argIndex, 1, "dica: vírgula decimal não separa argumento");
  const hp = hintParts(FUNCTIONS.find((f) => f.en === "IF")!, 1);
  eq(hp.map((p) => p.current), [false, true, false], "dica: destaca o argumento atual");
  eq(hp[2].optional, true, "dica: argumento opcional");
  eq(insertFunctionAt("", 0, FUNCTIONS.find((f) => f.en === "SUM")!), { text: "=SOMA(", caret: 6 }, "fx em célula vazia");
  eq(insertFunctionAt("=1+", 3, FUNCTIONS.find((f) => f.en === "SUM")!).text, "=1+SOMA(", "fx no cursor de uma fórmula");
  eq(closeParens("=SOMA(A1:A3"), "=SOMA(A1:A3)", "fecha parêntese que falta");
  eq(closeParens("=SE(SOMA(A1;2"), "=SE(SOMA(A1;2))", "fecha dois parênteses");
  eq(closeParens('=A1&")"'), '=A1&")"', "parêntese dentro de texto não conta");
  eq(closeParens("texto("), "texto(", "não mexe em texto comum");
  eq(closeParens("=HOJE"), "=HOJE()", "função sem argumentos ganha ()");
  eq(closeParens("=VERDADEIRO"), "=VERDADEIRO", "VERDADEIRO sem parênteses continua valor");
  eq(closeParens("=SOMA"), "=SOMA", "função com argumentos não ganha ()");
  const sp = refSpans('=SOMA(A1:B2)+$C$3+Aba!D4+LOG10(5)+"E5"');
  eq(sp.map((s) => [s.r1, s.c1, s.r2, s.c2]), [[0, 0, 1, 1], [2, 2, 2, 2], [3, 3, 3, 3]], "referências destacadas (sem LOG10 e sem texto)");
  eq(sp[2].sheet, "Aba", "referência com aba");
  eq(new Set(sp.map((s) => s.color)).size, 3, "cores diferentes");
  eq(refSpans("=A1+A1").map((s) => s.color), [0, 0], "mesma referência, mesma cor");
  eq(toggleAbsolute("=A1+B2", 3)?.text, "=$A$1+B2", "F4: A1 → $A$1");
  eq(toggleAbsolute("=$A$1", 3)?.text, "=A$1", "F4: $A$1 → A$1");
  eq(toggleAbsolute("=A$1", 3)?.text, "=$A1", "F4: A$1 → $A1");
  eq(toggleAbsolute("=$A1", 3)?.text, "=A1", "F4: $A1 → A1");
  eq(toggleAbsolute("=SOMA(A1:B2)", 8)?.text, "=SOMA($A$1:$B$2)", "F4 em intervalo");
  eq(toggleAbsolute("=SOMA(5)", 3), null, "F4 fora de referência");
  eq(errInfo("#NOME?")?.title, "Nome não reconhecido", "explicação #NOME?");
  eq(errInfo("#DIV/0!")?.title, "Divisão por zero", "explicação #DIV/0!");
  eq(errInfo("#N/D")?.title, "Valor não encontrado", "explicação #N/D");
  eq(errInfo("#VALOR!")?.title, "Tipo de valor errado", "explicação #VALOR!");
  eq(errInfo("#REF!")?.title, "Referência inválida", "explicação #REF!");

  // aviso de uso: o motor tem funções suficientes
  return FUNCTIONS.length;
}
