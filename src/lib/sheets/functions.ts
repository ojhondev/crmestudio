/**
 * Tabela ÚNICA das funções de fórmula: nome em inglês (canônico, o do .xlsx), nome em português (Excel/Planilhas BR),
 * categoria, sintaxe e exemplo. O motor (formula.ts), o autocompletar, o diálogo "Inserir função", a ajuda e a
 * importação/exportação .xlsx leem todos desta lista. Sem dependências: roda no navegador e no servidor.
 */

export type FnCategory = "Matemática" | "Estatística" | "Lógica" | "Texto" | "Data e hora" | "Busca e referência" | "Financeira" | "Informação" | "Matriz";

export const FN_CATEGORIES: FnCategory[] = ["Matemática", "Estatística", "Lógica", "Texto", "Data e hora", "Busca e referência", "Financeira", "Informação", "Matriz"];

export type FnDef = {
  en: string;
  pt: string;
  cat: FnCategory;
  /** argumentos em português separados por ";" — entre [ ] são opcionais, "..." repete */
  args: string;
  desc: string;
  /** exemplo digitável (em português, sem o "="), usa A1:A10 etc. */
  ex: string;
  /** o que o exemplo devolve (para a ajuda), opcional */
  out?: string;
  /** o Excel exige o prefixo _xlfn. no arquivo .xlsx */
  xlfn?: boolean;
};

const M: FnCategory = "Matemática";
const S: FnCategory = "Estatística";
const L: FnCategory = "Lógica";
const T: FnCategory = "Texto";
const D: FnCategory = "Data e hora";
const B: FnCategory = "Busca e referência";
const F: FnCategory = "Financeira";
const I: FnCategory = "Informação";
const X: FnCategory = "Matriz";

const d = (en: string, pt: string, cat: FnCategory, args: string, desc: string, ex: string, out?: string, xlfn?: boolean): FnDef => ({ en, pt, cat, args, desc, ex, out, xlfn });

export const FUNCTIONS: FnDef[] = [
  /* ---------------- Matemática ---------------- */
  d("SUM", "SOMA", M, "número1; [número2; ...]", "Soma números e intervalos.", "SOMA(A1:A10)"),
  d("PRODUCT", "MULT", M, "número1; [número2; ...]", "Multiplica todos os números.", "MULT(A1:A5)"),
  d("SUMIF", "SOMASE", M, "intervalo; critério; [intervalo_soma]", "Soma só as células que atendem a um critério.", 'SOMASE(A1:A10;"Pintura";B1:B10)'),
  d("SUMIFS", "SOMASES", M, "intervalo_soma; intervalo_crit1; critério1; [...]", "Soma com vários critérios ao mesmo tempo.", 'SOMASES(C1:C10;A1:A10;"Pintura";B1:B10;">100")'),
  d("SUMPRODUCT", "SOMARPRODUTO", M, "matriz1; [matriz2; ...]", "Multiplica intervalos linha a linha e soma (ex.: quantidade x preço).", "SOMARPRODUTO(B2:B10;C2:C10)"),
  d("SUMSQ", "SOMAQUAD", M, "número1; [número2; ...]", "Soma dos quadrados.", "SOMAQUAD(A1:A5)"),
  d("ROUND", "ARRED", M, "número; casas", "Arredonda para o número de casas decimais.", "ARRED(A1*1,25;2)"),
  d("ROUNDUP", "ARREDONDAR.PARA.CIMA", M, "número; casas", "Arredonda sempre para cima (afastando do zero).", "ARREDONDAR.PARA.CIMA(3,141;2)", "3,15"),
  d("ROUNDDOWN", "ARREDONDAR.PARA.BAIXO", M, "número; casas", "Arredonda sempre para baixo (em direção ao zero).", "ARREDONDAR.PARA.BAIXO(3,149;2)", "3,14"),
  d("TRUNC", "TRUNCAR", M, "número; [casas]", "Corta as casas decimais sem arredondar.", "TRUNCAR(8,97)", "8"),
  d("INT", "INT", M, "número", "Arredonda para o inteiro imediatamente menor.", "INT(8,97)", "8"),
  d("MROUND", "MARRED", M, "número; múltiplo", "Arredonda para o múltiplo mais próximo.", "MARRED(17;5)", "15"),
  d("CEILING", "TETO", M, "número; [múltiplo]", "Arredonda para cima até o múltiplo.", "TETO(17;5)", "20"),
  d("FLOOR", "ARREDMULT.BAIXO", M, "número; [múltiplo]", "Arredonda para baixo até o múltiplo.", "ARREDMULT.BAIXO(17;5)", "15"),
  d("ABS", "ABS", M, "número", "Valor absoluto (sem sinal).", "ABS(-15)", "15"),
  d("SIGN", "SINAL", M, "número", "Devolve 1, 0 ou -1 conforme o sinal.", "SINAL(-8)", "-1"),
  d("MOD", "MOD", M, "número; divisor", "Resto da divisão.", "MOD(10;3)", "1"),
  d("POWER", "POTÊNCIA", M, "base; expoente", "Eleva a base ao expoente (o mesmo que ^).", "POTÊNCIA(2;10)", "1024"),
  d("SQRT", "RAIZ", M, "número", "Raiz quadrada.", "RAIZ(144)", "12"),
  d("EXP", "EXP", M, "expoente", "e elevado ao expoente.", "EXP(1)"),
  d("LN", "LN", M, "número", "Logaritmo natural.", "LN(10)"),
  d("LOG", "LOG", M, "número; [base]", "Logaritmo (base 10 se omitida).", "LOG(1000)", "3"),
  d("LOG10", "LOG10", M, "número", "Logaritmo na base 10.", "LOG10(100)", "2"),
  d("PI", "PI", M, "", "O número pi (3,14159...).", "PI()"),
  d("SIN", "SEN", M, "ângulo_em_radianos", "Seno.", "SEN(PI()/2)", "1"),
  d("COS", "COS", M, "ângulo_em_radianos", "Cosseno.", "COS(0)", "1"),
  d("TAN", "TAN", M, "ângulo_em_radianos", "Tangente.", "TAN(PI()/4)", "1"),
  d("ATAN", "ATAN", M, "número", "Arco tangente (em radianos).", "ATAN(1)"),
  d("DEGREES", "GRAUS", M, "radianos", "Converte radianos em graus.", "GRAUS(PI())", "180"),
  d("RADIANS", "RADIANOS", M, "graus", "Converte graus em radianos.", "RADIANOS(180)"),
  d("RAND", "ALEATÓRIO", M, "", "Número aleatório entre 0 e 1 (muda a cada recálculo).", "ALEATÓRIO()"),
  d("RANDBETWEEN", "ALEATÓRIOENTRE", M, "mínimo; máximo", "Inteiro aleatório entre dois valores.", "ALEATÓRIOENTRE(1;100)"),
  d("GCD", "MDC", M, "número1; [número2; ...]", "Máximo divisor comum.", "MDC(12;18)", "6"),
  d("LCM", "MMC", M, "número1; [número2; ...]", "Mínimo múltiplo comum.", "MMC(4;6)", "12"),
  d("FACT", "FATORIAL", M, "número", "Fatorial.", "FATORIAL(5)", "120"),
  d("COMBIN", "COMBIN", M, "total; escolhidos", "Quantidade de combinações.", "COMBIN(5;2)", "10"),
  d("SUBTOTAL", "SUBTOTAL", M, "função_núm; intervalo1; [intervalo2; ...]", "Subtotal que ignora linhas ocultas pelo filtro. Códigos: 1 média, 2 cont.núm, 3 cont.valores, 4 máx, 5 mín, 6 mult, 9 soma (101-111 ignoram também as ocultas à mão).", "SUBTOTAL(9;B2:B50)"),
  d("AGGREGATE", "AGREGAR", M, "função_núm; opções; intervalo1; [...]", "Como SUBTOTAL, mas pode ignorar erros (opções 6 ou 7). Códigos 1-9 e 12-14.", "AGREGAR(9;6;B2:B50)"),

  /* ---------------- Estatística ---------------- */
  d("AVERAGE", "MÉDIA", S, "número1; [número2; ...]", "Média aritmética (ignora texto e vazias).", "MÉDIA(A1:A10)"),
  d("AVERAGEIF", "MÉDIASE", S, "intervalo; critério; [intervalo_média]", "Média das células que atendem ao critério.", 'MÉDIASE(A1:A10;"Pintura";B1:B10)'),
  d("AVERAGEIFS", "MÉDIASES", S, "intervalo_média; intervalo_crit1; critério1; [...]", "Média com vários critérios.", 'MÉDIASES(C1:C10;A1:A10;"Pintura";B1:B10;">100")'),
  d("MEDIAN", "MED", S, "número1; [número2; ...]", "Mediana (valor do meio).", "MED(A1:A10)"),
  d("MODE", "MODO", S, "número1; [número2; ...]", "Valor que mais se repete.", "MODO(A1:A10)"),
  d("MIN", "MÍNIMO", S, "número1; [número2; ...]", "Menor valor.", "MÍNIMO(A1:A10)"),
  d("MAX", "MÁXIMO", S, "número1; [número2; ...]", "Maior valor.", "MÁXIMO(A1:A10)"),
  d("MINIFS", "MÍNIMOSES", S, "intervalo_mín; intervalo_crit1; critério1; [...]", "Menor valor entre as células que atendem aos critérios.", 'MÍNIMOSES(B1:B10;A1:A10;"Pintura")', undefined, true),
  d("MAXIFS", "MÁXIMOSES", S, "intervalo_máx; intervalo_crit1; critério1; [...]", "Maior valor entre as células que atendem aos critérios.", 'MÁXIMOSES(B1:B10;A1:A10;"Pintura")', undefined, true),
  d("SMALL", "MENOR", S, "intervalo; k", "O k-ésimo menor valor (1 = menor).", "MENOR(A1:A10;2)"),
  d("LARGE", "MAIOR", S, "intervalo; k", "O k-ésimo maior valor (1 = maior).", "MAIOR(A1:A10;3)"),
  d("RANK", "ORDEM", S, "valor; intervalo; [ordem]", "Posição do valor no intervalo (ordem 0 = do maior ao menor).", "ORDEM(B2;B$2:B$20)"),
  d("PERCENTILE", "PERCENTIL", S, "intervalo; k", "Percentil (k entre 0 e 1).", "PERCENTIL(A1:A10;0,9)"),
  d("QUARTILE", "QUARTIL", S, "intervalo; quarto", "Quartil (0 mín, 1, 2 mediana, 3, 4 máx).", "QUARTIL(A1:A10;1)"),
  d("PERCENTRANK", "ORDEM.PORCENTUAL", S, "intervalo; x", "Posição relativa (0 a 1) de x dentro do intervalo.", "ORDEM.PORCENTUAL(A1:A10;5)"),
  d("STDEV", "DESVPAD", S, "número1; [número2; ...]", "Desvio padrão da amostra.", "DESVPAD(A1:A10)"),
  d("STDEV.S", "DESVPAD.A", S, "número1; [número2; ...]", "Desvio padrão da amostra.", "DESVPAD.A(A1:A10)", undefined, true),
  d("STDEV.P", "DESVPAD.P", S, "número1; [número2; ...]", "Desvio padrão da população.", "DESVPAD.P(A1:A10)", undefined, true),
  d("VAR", "VAR", S, "número1; [número2; ...]", "Variância da amostra.", "VAR(A1:A10)"),
  d("VAR.S", "VAR.A", S, "número1; [número2; ...]", "Variância da amostra.", "VAR.A(A1:A10)", undefined, true),
  d("VAR.P", "VAR.P", S, "número1; [número2; ...]", "Variância da população.", "VAR.P(A1:A10)", undefined, true),
  d("COUNT", "CONT.NÚM", S, "valor1; [valor2; ...]", "Conta células com números.", "CONT.NÚM(A1:A10)"),
  d("COUNTA", "CONT.VALORES", S, "valor1; [valor2; ...]", "Conta células não vazias.", "CONT.VALORES(A1:A10)"),
  d("COUNTBLANK", "CONTAR.VAZIO", S, "intervalo", "Conta células vazias.", "CONTAR.VAZIO(A1:A10)"),
  d("COUNTIF", "CONT.SE", S, "intervalo; critério", "Conta as células que atendem a um critério.", 'CONT.SE(A1:A10;"Pago")'),
  d("COUNTIFS", "CONT.SES", S, "intervalo1; critério1; [...]", "Conta com vários critérios.", 'CONT.SES(A1:A10;"Pago";B1:B10;">100")'),
  d("COUNTUNIQUE", "CONT.ÚNICOS", S, "valor1; [valor2; ...]", "Conta valores diferentes (sem repetição).", "CONT.ÚNICOS(A1:A10)"),

  /* ---------------- Lógica ---------------- */
  d("IF", "SE", L, "teste; se_verdadeiro; [se_falso]", "Escolhe entre dois resultados conforme o teste.", 'SE(A1>10;"alto";"baixo")'),
  d("IFS", "SES", L, "teste1; valor1; [teste2; valor2; ...]", "Vários testes em sequência; devolve o do primeiro verdadeiro.", 'SES(A1>=9;"A";A1>=7;"B";VERDADEIRO;"C")', undefined, true),
  d("IFERROR", "SEERRO", L, "valor; se_erro", "Troca um erro por outro valor.", 'SEERRO(A1/B1;0)'),
  d("IFNA", "SENÃODISP", L, "valor; se_nd", "Troca só o erro #N/D por outro valor.", 'SENÃODISP(PROCV(A1;E:F;2;FALSO);"não achei")', undefined, true),
  d("AND", "E", L, "lógico1; [lógico2; ...]", "Verdadeiro se TODAS as condições forem verdadeiras.", "E(A1>0;B1>0)"),
  d("OR", "OU", L, "lógico1; [lógico2; ...]", "Verdadeiro se ALGUMA condição for verdadeira.", "OU(A1>0;B1>0)"),
  d("NOT", "NÃO", L, "lógico", "Inverte verdadeiro/falso.", "NÃO(A1>0)"),
  d("XOR", "OUEXCLUSIVO", L, "lógico1; [lógico2; ...]", "Verdadeiro se um número ímpar de condições for verdadeiro.", "OUEXCLUSIVO(A1>0;B1>0)", undefined, true),
  d("SWITCH", "PARÂMETRO", L, "expressão; valor1; resultado1; [...; padrão]", "Compara a expressão com uma lista de valores.", 'PARÂMETRO(A1;1;"Baixa";2;"Média";3;"Alta";"?")', undefined, true),
  d("CHOOSE", "ESCOLHER", L, "índice; valor1; [valor2; ...]", "Escolhe o valor pela posição.", 'ESCOLHER(2;"Baixa";"Média";"Alta")', "Média"),
  d("TRUE", "VERDADEIRO", L, "", "O valor lógico verdadeiro.", "VERDADEIRO()"),
  d("FALSE", "FALSO", L, "", "O valor lógico falso.", "FALSO()"),

  /* ---------------- Texto ---------------- */
  d("CONCATENATE", "CONCATENAR", T, "texto1; [texto2; ...]", "Junta textos (o mesmo que &).", 'CONCATENAR(A1;" - ";B1)'),
  d("CONCAT", "CONCAT", T, "texto1; [texto2; ...]", "Junta textos e intervalos.", "CONCAT(A1:C1)", undefined, true),
  d("TEXTJOIN", "UNIRTEXTO", T, "separador; ignorar_vazias; texto1; [...]", "Junta textos com separador.", 'UNIRTEXTO(", ";VERDADEIRO;A1:A10)', undefined, true),
  d("TEXT", "TEXTO", T, "valor; formato", 'Formata número/data como texto: "dd/mm/aaaa", "0,00", "R$ #.##0,00", "0%".', 'TEXTO(A1;"dd/mm/aaaa")'),
  d("VALUE", "VALOR", T, "texto", "Converte texto em número.", 'VALOR("1.234,50")', "1234,5"),
  d("NUMBERVALUE", "VALORNUMÉRICO", T, "texto; [sep_decimal]; [sep_milhar]", "Converte texto em número informando os separadores.", 'VALORNUMÉRICO("1.234,50";",";".")', "1234,5", true),
  d("FIXED", "DEF.NÚM.DEC", T, "número; [casas]; [sem_milhar]", "Número como texto com casas fixas.", "DEF.NÚM.DEC(1234,5;2)", "1.234,50"),
  d("DOLLAR", "MOEDA", T, "número; [casas]", "Número como texto em reais.", "MOEDA(1234,5)", "R$ 1.234,50"),
  d("LEN", "NÚM.CARACT", T, "texto", "Quantidade de caracteres.", "NÚM.CARACT(A1)"),
  d("UPPER", "MAIÚSCULA", T, "texto", "Tudo em maiúsculas.", "MAIÚSCULA(A1)"),
  d("LOWER", "MINÚSCULA", T, "texto", "Tudo em minúsculas.", "MINÚSCULA(A1)"),
  d("PROPER", "PRI.MAIÚSCULA", T, "texto", "Primeira letra de cada palavra em maiúscula.", "PRI.MAIÚSCULA(A1)"),
  d("TRIM", "ARRUMAR", T, "texto", "Remove espaços sobrando.", "ARRUMAR(A1)"),
  d("CLEAN", "TIRAR", T, "texto", "Remove caracteres não imprimíveis.", "TIRAR(A1)"),
  d("LEFT", "ESQUERDA", T, "texto; [núm_caract]", "Primeiros caracteres do texto.", "ESQUERDA(A1;3)"),
  d("RIGHT", "DIREITA", T, "texto; [núm_caract]", "Últimos caracteres do texto.", "DIREITA(A1;3)"),
  d("MID", "EXT.TEXTO", T, "texto; início; núm_caract", "Trecho do meio do texto.", "EXT.TEXTO(A1;2;3)"),
  d("FIND", "PROCURAR", T, "procurado; texto; [início]", "Posição de um texto dentro de outro (diferencia maiúsculas).", 'PROCURAR("-";A1)'),
  d("SEARCH", "LOCALIZAR", T, "procurado; texto; [início]", "Posição de um texto dentro de outro (aceita ? e *, ignora maiúsculas).", 'LOCALIZAR("obra";A1)'),
  d("SUBSTITUTE", "SUBSTITUIR", T, "texto; antigo; novo; [ocorrência]", "Troca um trecho por outro.", 'SUBSTITUIR(A1;"-";"/")'),
  d("REPLACE", "MUDAR", T, "texto; início; núm_caract; novo", "Troca caracteres por posição.", 'MUDAR(A1;1;3;"XYZ")'),
  d("REPT", "REPT", T, "texto; vezes", "Repete o texto.", 'REPT("*";5)', "*****"),
  d("EXACT", "EXATO", T, "texto1; texto2", "Verdadeiro se os textos forem idênticos (diferencia maiúsculas).", "EXATO(A1;B1)"),
  d("CHAR", "CARACT", T, "código", "Caractere de um código.", "CARACT(65)", "A"),
  d("CODE", "CÓDIGO", T, "texto", "Código do primeiro caractere.", 'CÓDIGO("A")', "65"),
  d("TEXTBEFORE", "TEXTOANTES", T, "texto; delimitador; [ocorrência]", "Parte do texto antes do delimitador.", 'TEXTOANTES("Rua A, 10";",")', "Rua A", true),
  d("TEXTAFTER", "TEXTODEPOIS", T, "texto; delimitador; [ocorrência]", "Parte do texto depois do delimitador.", 'TEXTODEPOIS("Rua A, 10";", ")', "10", true),
  d("SPLIT", "DIVIDIR", T, "texto; delimitador; [dividir_por_cada]", "Divide o texto em várias células na horizontal.", 'DIVIDIR("a;b;c";";")', undefined, false),

  /* ---------------- Data e hora ---------------- */
  d("TODAY", "HOJE", D, "", "Data de hoje (atualiza sozinha).", "HOJE()"),
  d("NOW", "AGORA", D, "", "Data e hora de agora.", "AGORA()"),
  d("DATE", "DATA", D, "ano; mês; dia", "Monta uma data.", "DATA(2026;11;2)"),
  d("DATEVALUE", "DATA.VALOR", D, "texto_data", "Converte texto em data.", 'DATA.VALOR("25/12/2026")'),
  d("TIME", "TEMPO", D, "hora; minuto; segundo", "Monta um horário.", "TEMPO(14;30;0)"),
  d("TIMEVALUE", "VALOR.TEMPO", D, "texto_hora", "Converte texto em horário.", 'VALOR.TEMPO("14:30")'),
  d("YEAR", "ANO", D, "data", "Ano da data.", "ANO(A1)"),
  d("MONTH", "MÊS", D, "data", "Mês da data (1-12).", "MÊS(A1)"),
  d("DAY", "DIA", D, "data", "Dia do mês.", "DIA(A1)"),
  d("HOUR", "HORA", D, "horário", "Hora (0-23).", "HORA(AGORA())"),
  d("MINUTE", "MINUTO", D, "horário", "Minuto (0-59).", "MINUTO(AGORA())"),
  d("SECOND", "SEGUNDO", D, "horário", "Segundo (0-59).", "SEGUNDO(AGORA())"),
  d("WEEKDAY", "DIA.DA.SEMANA", D, "data; [tipo]", "Dia da semana (tipo 1: domingo=1; 2: segunda=1).", "DIA.DA.SEMANA(A1;2)"),
  d("WEEKNUM", "NÚMSEMANA", D, "data; [tipo]", "Número da semana no ano.", "NÚMSEMANA(A1)"),
  d("ISOWEEKNUM", "NÚMSEMANAISO", D, "data", "Número da semana ISO.", "NÚMSEMANAISO(A1)", undefined, true),
  d("DAYS", "DIAS", D, "data_final; data_inicial", "Dias entre duas datas.", "DIAS(B1;A1)", undefined, true),
  d("DATEDIF", "DATADIF", D, "início; fim; unidade", 'Diferença entre datas em "D" dias, "M" meses, "Y" anos, "YM", "MD", "YD".', 'DATADIF(A1;HOJE();"Y")'),
  d("EDATE", "DATAM", D, "data; meses", "Data X meses depois (ou antes, se negativo).", "DATAM(A1;3)"),
  d("EOMONTH", "FIMMÊS", D, "data; meses", "Último dia do mês.", "FIMMÊS(A1;0)"),
  d("NETWORKDAYS", "DIATRABALHOTOTAL", D, "início; fim; [feriados]", "Dias úteis entre duas datas (seg-sex).", "DIATRABALHOTOTAL(A1;B1;E1:E10)"),
  d("NETWORKDAYS.INTL", "DIATRABALHOTOTAL.INTL", D, "início; fim; [fim_de_semana]; [feriados]", "Dias úteis com fim de semana configurável (1 sáb+dom, 2 dom+seg, 11 só dom...).", "DIATRABALHOTOTAL.INTL(A1;B1;11)"),
  d("WORKDAY", "DIATRABALHO", D, "início; dias; [feriados]", "Data após X dias úteis (prazo de obra).", "DIATRABALHO(A1;30;E1:E10)"),
  d("WORKDAY.INTL", "DIATRABALHO.INTL", D, "início; dias; [fim_de_semana]; [feriados]", "Dias úteis com fim de semana configurável.", "DIATRABALHO.INTL(A1;30;11)"),
  d("YEARFRAC", "FRAÇÃOANO", D, "início; fim; [base]", "Fração do ano entre duas datas.", "FRAÇÃOANO(A1;B1)"),

  /* ---------------- Busca e referência ---------------- */
  d("VLOOKUP", "PROCV", B, "procurado; tabela; col_índice; [aproximado]", "Procura na 1ª coluna e devolve outra coluna. Use FALSO para busca exata.", "PROCV(A2;E:G;3;FALSO)"),
  d("HLOOKUP", "PROCH", B, "procurado; tabela; lin_índice; [aproximado]", "Como PROCV, mas procura na 1ª linha.", "PROCH(A1;B1:H3;2;FALSO)"),
  d("XLOOKUP", "PROCX", B, "procurado; onde_procurar; retorno; [se_não_achar]", "Busca moderna: procura e devolve de outra coluna/linha.", 'PROCX(A2;E:E;G:G;"não achei")', undefined, true),
  d("LOOKUP", "PROC", B, "procurado; vetor_busca; [vetor_resultado]", "Busca aproximada em lista ordenada.", "PROC(A2;E1:E10;F1:F10)"),
  d("INDEX", "ÍNDICE", B, "intervalo; linha; [coluna]", "Valor numa posição do intervalo.", "ÍNDICE(E1:G10;3;2)"),
  d("MATCH", "CORRESP", B, "procurado; intervalo; [tipo]", "Posição do valor no intervalo (tipo 0 = exato).", "CORRESP(A2;E1:E10;0)"),
  d("OFFSET", "DESLOC", B, "referência; linhas; colunas; [altura]; [largura]", "Referência deslocada de outra.", "SOMA(DESLOC(A1;1;0;3;1))"),
  d("INDIRECT", "INDIRETO", B, "texto_ref", "Referência a partir de um texto.", 'INDIRETO("A"&B1)'),
  d("ADDRESS", "ENDEREÇO", B, "linha; coluna; [abs]", "Endereço da célula como texto.", "ENDEREÇO(2;3)", "$C$2"),
  d("ROW", "LIN", B, "[referência]", "Número da linha.", "LIN(A5)", "5"),
  d("COLUMN", "COL", B, "[referência]", "Número da coluna.", "COL(C1)", "3"),
  d("ROWS", "LINS", B, "intervalo", "Quantas linhas tem o intervalo.", "LINS(A1:A10)", "10"),
  d("COLUMNS", "COLS", B, "intervalo", "Quantas colunas tem o intervalo.", "COLS(A1:D1)", "4"),

  /* ---------------- Financeira ---------------- */
  d("PMT", "PGTO", F, "taxa; nper; vp; [vf]; [tipo]", "Valor da parcela de um financiamento (negativo = saída).", "PGTO(1%;12;-10000)"),
  d("PPMT", "PPGTO", F, "taxa; período; nper; vp; [vf]; [tipo]", "Parte da parcela que amortiza o principal.", "PPGTO(1%;1;12;-10000)"),
  d("IPMT", "IPGTO", F, "taxa; período; nper; vp; [vf]; [tipo]", "Parte da parcela que são juros.", "IPGTO(1%;1;12;-10000)"),
  d("FV", "VF", F, "taxa; nper; pgto; [vp]; [tipo]", "Valor futuro de aplicações regulares.", "VF(0,5%;12;-500)"),
  d("PV", "VP", F, "taxa; nper; pgto; [vf]; [tipo]", "Valor presente.", "VP(1%;12;-500)"),
  d("NPV", "VPL", F, "taxa; valor1; [valor2; ...]", "Valor presente líquido de fluxos futuros.", "VPL(10%;B2:B6)+B1"),
  d("IRR", "TIR", F, "valores; [estimativa]", "Taxa interna de retorno de um fluxo de caixa.", "TIR(B1:B6)"),
  d("RATE", "TAXA", F, "nper; pgto; vp; [vf]; [tipo]; [estimativa]", "Taxa de juros por período.", "TAXA(12;-900;10000)"),
  d("NPER", "NPER", F, "taxa; pgto; vp; [vf]; [tipo]", "Número de períodos.", "NPER(1%;-900;10000)"),
  d("SLN", "DPD", F, "custo; valor_residual; vida_útil", "Depreciação linear por período.", "DPD(10000;1000;5)"),
  d("DB", "BDD", F, "custo; residual; vida; período; [meses]", "Depreciação por saldo decrescente.", "BDD(10000;1000;5;1)"),
  d("EFFECT", "EFETIVA", F, "taxa_nominal; períodos_ano", "Taxa efetiva anual.", "EFETIVA(12%;12)"),
  d("NOMINAL", "NOMINAL", F, "taxa_efetiva; períodos_ano", "Taxa nominal anual.", "NOMINAL(12,68%;12)"),

  /* ---------------- Informação ---------------- */
  d("ISBLANK", "ÉCÉL.VAZIA", I, "valor", "Verdadeiro se a célula está vazia.", "ÉCÉL.VAZIA(A1)"),
  d("ISNUMBER", "ÉNÚM", I, "valor", "Verdadeiro se for número.", "ÉNÚM(A1)"),
  d("ISTEXT", "ÉTEXTO", I, "valor", "Verdadeiro se for texto.", "ÉTEXTO(A1)"),
  d("ISLOGICAL", "ÉLÓGICO", I, "valor", "Verdadeiro se for VERDADEIRO/FALSO.", "ÉLÓGICO(A1)"),
  d("ISERROR", "ÉERRO", I, "valor", "Verdadeiro se for qualquer erro.", "ÉERRO(A1)"),
  d("ISERR", "ÉERROS", I, "valor", "Verdadeiro se for erro, exceto #N/D.", "ÉERROS(A1)"),
  d("ISNA", "ÉNÃO.DISP", I, "valor", "Verdadeiro se for o erro #N/D.", "ÉNÃO.DISP(A1)"),
  d("ISEVEN", "ÉPAR", I, "número", "Verdadeiro se for par.", "ÉPAR(A1)"),
  d("ISODD", "ÉIMPAR", I, "número", "Verdadeiro se for ímpar.", "ÉIMPAR(A1)"),
  d("N", "N", I, "valor", "Converte em número (texto vira 0).", "N(A1)"),
  d("NA", "NÃO.DISP", I, "", "Devolve o erro #N/D de propósito.", "NÃO.DISP()"),

  /* ---------------- Matriz ---------------- */
  d("TRANSPOSE", "TRANSPOR", X, "intervalo", "Troca linhas por colunas.", "TRANSPOR(A1:C3)"),
  d("UNIQUE", "ÚNICO", X, "intervalo", "Lista sem repetições.", "ÚNICO(A2:A50)", undefined, true),
  d("SORT", "CLASSIFICAR", X, "intervalo; [coluna]; [crescente]", "Ordena o intervalo.", "CLASSIFICAR(A2:B50;2;FALSO)", undefined, true),
  d("FILTER", "FILTRAR", X, "intervalo; condição; [se_vazio]", "Mantém só as linhas que atendem à condição.", 'FILTRAR(A2:B50;B2:B50>100;"nada")', undefined, true),
  d("SEQUENCE", "SEQUÊNCIA", X, "linhas; [colunas]; [início]; [passo]", "Gera uma sequência de números.", "SEQUÊNCIA(5;1;1;1)", undefined, true),
  d("ARRAYFORMULA", "ARRAYFORMULA", X, "fórmula_matricial", "Aplica a fórmula a um intervalo inteiro de uma vez.", "ARRAYFORMULA(A2:A10*B2:B10)"),
  d("MMULT", "MATRIZ.MULT", X, "matriz1; matriz2", "Multiplicação de matrizes.", "MATRIZ.MULT(A1:B2;D1:E2)"),
];

/** Nomes alternativos aceitos ao digitar (Planilhas Google em português, versões antigas do Excel). */
const ALIASES: [string, string][] = [
  ["ORDEM.EQV", "RANK"],
  ["RANK.EQ", "RANK"],
  ["CONT.ÚNICO", "COUNTUNIQUE"],
  ["CONT.UNICOS", "COUNTUNIQUE"],
  ["DESVPAD.S", "STDEV.S"],
  ["VAR.S", "VAR.S"],
  ["MODO.ÚNICO", "MODE"],
  ["MODE.SNGL", "MODE"],
  ["PERCENTIL.INC", "PERCENTILE"],
  ["PERCENTILE.INC", "PERCENTILE"],
  ["QUARTIL.INC", "QUARTILE"],
  ["QUARTILE.INC", "QUARTILE"],
  ["SWITCH", "SWITCH"],
  ["SOMARPRODUTO", "SUMPRODUCT"],
  ["TEXTOANTES", "TEXTBEFORE"],
  ["SEQUENCIA", "SEQUENCE"],
  ["ALEATORIO", "RAND"],
  ["ALEATORIOENTRE", "RANDBETWEEN"],
  ["DIATRABALHOTOTAL.INTL", "NETWORKDAYS.INTL"],
  ["ARRED.PARA.CIMA", "ROUNDUP"],
  ["ARRED.PARA.BAIXO", "ROUNDDOWN"],
  ["LOCALIZAR", "SEARCH"],
  ["PROCURAR", "FIND"],
  ["ARREDONDAR.PARA.CIMA", "ROUNDUP"],
  ["PROCURARB", "FIND"],
  ["MÉDIA.SE", "AVERAGEIF"],
  ["SOMA.SE", "SUMIF"],
  ["CONTAR.SE", "COUNTIF"],
  ["MÁX", "MAX"],
  ["MÍN", "MIN"],
  ["CONT.NUM", "COUNT"],
  ["DATADIF", "DATEDIF"],
  ["TEXTO.JUNTAR", "TEXTJOIN"],
  ["JUNTAR", "TEXTJOIN"],
  ["SENA", "IFNA"],
  ["TRUNCAR", "TRUNC"],
];

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

export const FN_BY_EN = new Map<string, FnDef>();
export const EN_BY_ANY = new Map<string, string>();
export const PT_BY_EN = new Map<string, string>();
for (const f of FUNCTIONS) {
  FN_BY_EN.set(f.en, f);
  EN_BY_ANY.set(norm(f.en), f.en);
  EN_BY_ANY.set(norm(f.pt), f.en);
  PT_BY_EN.set(f.en, f.pt);
}
for (const [a, en] of ALIASES) if (FN_BY_EN.has(en) && !EN_BY_ANY.has(norm(a))) EN_BY_ANY.set(norm(a), en);

/** Nomes só em português (sem equivalente igual em inglês): usá-los indica fórmula em português (vírgula decimal). */
export const PT_ONLY = new Set<string>();
{
  const ens = new Set(FUNCTIONS.map((f) => norm(f.en)));
  for (const f of FUNCTIONS) if (!ens.has(norm(f.pt))) PT_ONLY.add(norm(f.pt));
}

/** Compatibilidade: lista [inglês, português]. */
export const FUNCTION_NAMES: [string, string][] = FUNCTIONS.map((f) => [f.en, f.pt]);

/** Funções que o Excel só reconhece com o prefixo _xlfn. dentro do arquivo .xlsx. */
export const XLFN = new Set(FUNCTIONS.filter((f) => f.xlfn).map((f) => f.en));
for (const e of ["IFNA", "XOR", "SWITCH", "DAYS", "ISOWEEKNUM", "NUMBERVALUE", "CONCAT", "TEXTJOIN", "IFS", "MAXIFS", "MINIFS", "XLOOKUP", "TEXTBEFORE", "TEXTAFTER", "UNIQUE", "SORT", "FILTER", "SEQUENCE", "STDEV.S", "STDEV.P", "VAR.S", "VAR.P"]) XLFN.add(e);

/** Busca por prefixo/trecho (nome PT ou EN) para o autocompletar. */
export function searchFunctions(q: string, limit = 12): FnDef[] {
  const n = norm(q.trim());
  if (!n) return FUNCTIONS.slice(0, limit);
  const starts: FnDef[] = [];
  const has: FnDef[] = [];
  for (const f of FUNCTIONS) {
    const p = norm(f.pt);
    const e = norm(f.en);
    if (p.startsWith(n) || e.startsWith(n)) starts.push(f);
    else if (p.includes(n) || e.includes(n) || norm(f.desc).includes(n)) has.push(f);
  }
  return [...starts, ...has].slice(0, limit);
}

/** Lista de argumentos de uma função (texto de sintaxe) separada, com marcação de opcional/repetível. */
export function fnArgs(f: FnDef): { name: string; optional: boolean; repeat: boolean }[] {
  const out: { name: string; optional: boolean; repeat: boolean }[] = [];
  if (!f.args.trim()) return out;
  for (const a of f.args.split(";")) {
    const raw = a.trim();
    if (raw === "..." || raw === "...]" || raw === "[...]") {
      if (out.length) out[out.length - 1].repeat = true;
      continue;
    }
    out.push({ name: raw.replace(/[[\]]/g, "").replace(/\.\.\.$/, "").trim() || raw, optional: raw.startsWith("["), repeat: raw.endsWith("...") || raw.endsWith("...]") });
  }
  return out;
}

/** Sintaxe exibida: SOMA(número1; [número2; ...]) */
export const fnSyntax = (f: FnDef) => `${f.pt}(${f.args})`;

/** Exemplos práticos do estúdio de restauro: título, descrição, células de exemplo e fórmula. */
export const STUDIO_EXAMPLES: { title: string; desc: string; formula: string; note?: string }[] = [
  { title: "Total de um item de orçamento", desc: "Quantidade x preço unitário, arredondado em centavos.", formula: "ARRED(B2*C2;2)", note: "B = quantidade, C = preço unitário" },
  { title: "Orçamento com BDI", desc: "Custo direto somado ao BDI (ex.: 25% na célula F1).", formula: "SOMA(D2:D40)*(1+F1)", note: "D = totais dos itens; F1 = 25%" },
  { title: "Valor do BDI", desc: "Quanto o BDI representa em reais.", formula: "SOMA(D2:D40)*F1" },
  { title: "Total por categoria", desc: "Soma só os itens de uma categoria (A = categoria).", formula: 'SOMASE(A2:A40;"Pintura";D2:D40)' },
  { title: "Total por categoria da célula", desc: "Usa o texto de outra célula como critério — copie para baixo numa lista de categorias.", formula: "SOMASE($A$2:$A$40;F2;$D$2:$D$40)" },
  { title: "Saldo da obra", desc: "Orçamento menos o já gasto.", formula: "B1-SOMA(C2:C40)" },
  { title: "Percentual executado", desc: "Quanto do orçamento já foi gasto (formate a célula como %).", formula: "SEERRO(SOMA(C2:C40)/B1;0)" },
  { title: "Dias para o vencimento", desc: "Quantos dias faltam (negativo = atrasado) para a data em B2.", formula: "B2-HOJE()" },
  { title: "Situação do pagamento", desc: "Marca vencido, vence em breve ou em dia.", formula: 'SE(B2<HOJE();"Vencido";SE(B2-HOJE()<=7;"Vence em breve";"Em dia"))' },
  { title: "Prazo em dias úteis", desc: "Data final contando só dias úteis, com feriados em H2:H12.", formula: "DIATRABALHO(B2;C2;H2:H12)" },
  { title: "Dias úteis entre duas datas", desc: "Quantos dias úteis há entre início e fim.", formula: "DIATRABALHOTOTAL(B2;C2;H2:H12)" },
  { title: "Preço do material por código", desc: "Busca o preço do material do código A2 na tabela de preços (F:H).", formula: "PROCV(A2;F:H;3;FALSO)" },
  { title: "Preço do material (sem erro)", desc: "Igual, mas mostra um aviso se o código não existir.", formula: 'SEERRO(PROCV(A2;F:H;3;FALSO);"Não cadastrado")' },
  { title: "Busca moderna com PROCX", desc: "Procura em uma coluna e devolve de outra, sem contar posição.", formula: 'PROCX(A2;F:F;H:H;"não achei")' },
  { title: "Estoque de material", desc: "Entradas menos saídas de um material (A = material).", formula: 'SOMASE(A:A;F2;B:B)-SOMASE(A:A;F2;C:C)' },
  { title: "Alerta de estoque baixo", desc: "Avisa quando o saldo ficou abaixo do mínimo.", formula: 'SE(D2<E2;"Repor";"OK")' },
  { title: "Quantidade de itens por status", desc: "Conta quantas linhas estão com o status desejado.", formula: 'CONT.SE(E2:E40;"Concluído")' },
  { title: "Média de preço por fornecedor", desc: "Média dos preços de um fornecedor.", formula: 'MÉDIASE(A2:A40;"Fornecedor X";D2:D40)' },
  { title: "Parcela de um financiamento", desc: "Valor mensal de 12 parcelas de R$ 10.000 a 1% ao mês.", formula: "PGTO(1%;12;-10000)" },
  { title: "Texto montado", desc: "Junta nome da obra e cliente.", formula: 'A2&" - "&B2' },
  { title: "Idade de uma data", desc: "Anos completos desde a data em A2.", formula: 'DATADIF(A2;HOJE();"Y")' },
  { title: "Maior valor entre os itens de uma categoria", desc: "Maior custo de uma categoria.", formula: 'MÁXIMOSES(D2:D40;A2:A40;"Pintura")' },
];
