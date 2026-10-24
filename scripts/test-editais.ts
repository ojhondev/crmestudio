/**
 * Testes do módulo Editais: triagem e classificação (casos REAIS coletados do PNCP em 2026-10-24, positivos e negativos),
 * normalização dos dois formatos do PNCP, coleta com retry/dedupe/corte/retomada (fetch simulado), filtros da URL
 * e validação do token OIDC do GitHub Actions (com chaves de teste geradas na hora).
 *
 *   npm run test:editais            # sem banco e sem rede
 *   npm run test:editais:db         # + idempotência da gravação no banco (cria e apaga dados "QA-TEST")
 */
import crypto from "node:crypto";
import { triage, classifyKind, norm, maskNoise } from "../src/lib/editais/triage";
import { brIso, fromConsultaItem, fromSearchItem, stripPortalTag, titleOf, pncpUrl, getJson, DeadlineError, HttpError } from "../src/lib/editais/pncp";
import { runScan } from "../src/lib/editais/scan";
import { DEFAULT_FILTERS, daysLeft, deadlineText, effectiveSituation, filtersToQuery, parseFilters } from "../src/lib/editais/filters";
import { verifyGithubOidc, oidcConfig, type Jwk } from "../src/lib/editais/oidc";
import { SCORE_MIN_DEFAULT, type EditalInput } from "../src/lib/editais/types";

let fail = 0;
let total = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  total++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};
const ok = (v: unknown, m: string) => eq(!!v, true, m);

/* ------------------------------ triagem: positivos reais ------------------------------ */
// [objeto, tipo esperado]
const POSITIVES: [string, string][] = [
  ["Contratação de serviços técnicos especializados em arquitetura e engenharia, para a restauração da Igreja Nossa Senhora do Rosário, Distrito de Buenolândia - Cidade de Goiás/GO, patrimônio histórico", "projeto"],
  ["Contratação de empresa especializada para execução da 2ª etapa de obra de restauro do Bloco A do Prédio Histórico do Hospital Psiquiátrico São Pedro, localizado no município de Porto Alegre", "execucao"],
  ["CONTRATACAO DE EMPRESA ESPECIALIZADA PARA EXECUCAO DE OBRA DE RESTAURACAO DA IGREJA SAO BENEDITO", "execucao"],
  ["Contratação de empresa especializada em elaboração de projetos executivos para restauração do Solar do Airizes – BR 356 - Campos dos Goytacazes – RJ", "projeto"],
  ["Contratação integrada dos projetos básico e executivo, realização de testes e ensaios, e execução da obra de restauração dos brises soleils do Edifício Palácio Gustavo Capanema, localizado no Rio de Janeiro", "projeto_execucao"],
  ["O objeto do presente instrumento é a contratação de empresa especializada para elaboração de projetos básicos, executivos e execução da obra de restauração do Solar da Baronesa de São Bento, em São Luís/MA", "projeto_execucao"],
  ["Contratação de serviços de empresa especializada para elaboração de projeto arquitetônico de restauro para o edifício tombado chamado Casarão da Inspetoria, localizado na área do Sítio Histórico", "projeto"],
  ["Restauração e pintura dos vitrais da capela do cemitério São José.", "execucao"],
  ["CONTRATACAO DE EMPRESA ESPECIALIZADA EM CARPINTARIA DE RESTAURO PARA A CONFECCAO DE REPLICA DE JANELA HISTORICA DESTINADA AO PALACIO DO GOVERNO DO MUNICIPIO DE OLINDA PE", "execucao"],
  ["Serviço especializado de restauração de obras de arte com tratamento dos danos e aplicação de medidas de proteção", "execucao"],
  ["Execução de obras de reforma, conservação e restauro da Igreja Santo Antônio dos Eucaliptos e do Sanitário Público da Floresta Estadual Edmundo Navarro de Andrade - FEENA.", "execucao"],
  ["Contratação semi- integrada de empresa para elaboração de projetos executivos e execução da obra de Restauração da restauração da antiga Enfermaria Militar, em Jaguarão-RS.", "projeto_execucao"],
  ["Contratação de empresa especializada para a prestação de serviços técnicos de conservação e restauração de 04 (quatro) objetos históricos, constituídos por arcas em madeira revestidas em couro", "execucao"],
  ["Obra de Restauração do Museu de Arte da Pampulha  MAP", "execucao"],
  ["Recuperação de Monumentos Históricos e Obras de Arte", "execucao"],
  ["Contratação de empresa especializada para execução de obra de reforma, recuperação e restauração do prédio histórico da Antiga Prefeitura Municipal, localizado na Avenida Marechal Floriano", "execucao"],
  ["Seleção e contratação de empresa especializada em serviços de conservação móveis, imóveis e integrados; graduação em arquitetura e engenharia civil, o trabalho proposto abrange a realização de dois retábulos em madeira, contemplando o reaproveitamento de componentes antigos", "execucao"],
  ["Contratação de empresa para prestação de serviços de prospecções pictóricas na Igreja do Convento de Nossa Senhora do Carmo, na Praça Barão de Rio Branco, n° 16 – Centro – Santos/SP, incluindo material, equipamentos e mão de obra", "outro"],
  ["Execução de obras de restauração e adequações referentes à implantação do Museu da Cidade, localizada na Pça. Cel. Pedro Osório, Centro Histórico de Pelotas", "execucao"],
  ["Contratação de empresa para execução das obras de restauração do antigo Diamantina Tênis Clube/Praça de Esportes, no Município de Diamantina (MG).", "execucao"],
];
for (const [text, kind] of POSITIVES) {
  const t = triage(text);
  ok(t.relevant, `positivo relevante: ${text.slice(0, 70)}…`);
  ok(t.score >= SCORE_MIN_DEFAULT, `positivo com nota ≥ 50 (${t.score}): ${text.slice(0, 50)}`);
  if (kind !== "outro") eq(t.kind, kind, `tipo (${t.kindWhy}): ${text.slice(0, 70)}…`);
  ok(t.matched.length > 0, `guarda os termos que casaram: ${text.slice(0, 50)}`);
}

/* ------------------------------ triagem: negativos reais ------------------------------ */
const NEGATIVES = [
  "CONTRATAÇÃO DE EMPRESA PARA PRESTAÇÃO DE SERVIÇOS CONTÍNUOS DE MANUTENÇÃO, CONSERVAÇÃO E RESTAURAÇÃO ASFÁLTICA DAS VIAS PÚBLICAS DO MUNICÍPIO DE ITAJAÍ, COM DEDICAÇÃO EXCLUSIVA DE MÃO DE OBRA",
  "Restauração de pavimento de via urbana em concreto betuminoso usinado a quente (CBUQ), área de 11.647,50 m², compreendendo: serviços preliminares; drenagem; base e sub-base",
  "Contratação de empresa para execução dos serviços de implantação, manutenção, monitoramento e consolidação da Restauração Ecológica da futura Área de Preservação Permanente (APP) do reservatório",
  "Registro de Preço para aquisição de materiais de consumo, insumos, materiais restauradores, instrumentais e equipamentos odontológicos, destinados ao abastecimento e à manutenção dos serviços de Saúde",
  "PRESTAÇÃO DE SERVIÇOS NA ÁREA DE SAÚDE tem por finalidade serviços na área de Odontologia:consultas, procedimentos odontológicos (restaurações, raspagens, exodontias, tratamento endodôntico)",
  "Contratação de serviços de apoio ao diagnóstico, compreendendo a realização de exames laboratoriais especializados, visando atender às demandas do Hospital da Restauração.",
  "Contratação de empresa especializada para prestação de serviços técnicos continuados de tecnologia da informação, compreendendo a administração e a sustentação técnica, restauração do backup",
  "Contratação Integrada de empresa especializada para elaboração dos projetos básico e executivo, bem como a execução dos serviços de duplicação e restauração da GO-462, compreendendo o trecho entre a Entr.",
  "Contratação de empresa especializada para a execução das obras de restauração na rodovia BR-155/PA, km 0,00 ao km 109,97 (Lote 01).",
  "CONTRATAÇÃO VIA SISTEMA CONTRATA MAIS BRASIL DE SERVIÇO DE PINTURA DECORATIVA E RESTAURAÇÃO DOS DOIS PAINÉIS LATERAIS DO VEÍCULO UTILIZADO COMO CARRO DO PAPAI NOEL E DAS ESTRUTURAS DECORATIVAS",
  "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A PRESTAÇÃO DE SERVIÇOS DE MONTAGEM, AMBIENTAÇÃO, MANUTENÇÃO, REFORMA, RESTAURAÇÃO E RECUPERAÇÃO DE PEÇAS E ESTRUTURAS DECORATIVAS NATALINAS",
  "Registro de Preços para a eventual contratação de empresa para prestação de serviços de chaveiro, compreendendo confecção e cópia de chaves, conserto e restauração de chaves comuns e codificadas",
  "Restauração da Escola Estadual São Joaquim - Conceição do Mato Dentro.",
  "Execução de restauração e adequação da escola municipal Hermelinda Martins no município de Taperoá/BA.",
  "Restauraçao do telhado do Prédio da SMASCTH",
  "Contratação de empresa especializada para a realização de serviço de troca de gás e manutenção de câmara de conservação de vacinas da ESF 05 RICARDO PINHEIRO, Modelo NI1760/400L, Série 24121448, Tombamento 56951.",
  "Contratação de empresa especializada para prestação de serviços de manutenção preventiva na Subestação de Entrada de Energia e na Subestação Transformadora do Prédio Sede da Defensoria Pública, localizadas na Rua Sete de Setembro nº 666, Centro Histórico, Porto Alegre/RS",
  "Contratação de empresa para fornecimento e instalação de usina de energia solar fotovoltaica no prédio da Prefeitura Municipal",
  "Aquisição de talha elétrica de 2 toneladas para a oficina da garagem municipal",
  "Contratação de empresa para execução de forro de gesso acartonado no prédio da Secretaria de Educação",
  "CONTRATAÇAÕ DE SHOW ARTISTICO PARA A FESTA DA IGREJA (NOSSA SENHOR APARECIDA).",
  "Contratação de apresentação artística do cantor José Orlando, com duração de 1h40min, a ser realizada em praça pública, em frente a Igreja Matriz, como parte da programação",
  "REGISTRO DE PREÇOS PARA A FUTURA E EVENTUAL CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA AQUISIÇÃO DE COMBUSTÍVEL VEICULAR PARA ATENDER AS NECESSIDADES DO MUNICÍPIO DE IGREJA NOVA/AL.",
  "CONSTRUÇÃO DE PRAÇA DA IGREJA DA LOCALIDADE DE LAMEIRÃO NO MUNICIPIO DE COREAÚ/CE, JUNTO A SECRETARIA DE INFRAESTRUTURA E DESENVOLVIMENTO URBANO",
  "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA AMPLIAÇÃO DA CAPELA MORTUÁRIA E CEMITÉRIO",
  "Contratação de empresa para fornecimento de 700 (setecentas) camisetas personalizadas, destinadas à identificação, divulgação e apoio às ações de preservação, educação e valorização do patrimônio cultural",
  "Contratação de empresa especializada para prestação de serviços de assessoria no critério ICMS Patrimônio Cultural, abrangendo os Quadros IA, IB, IIA, IIB, IIC, IIIA, IIIB e IIIC da Deliberação Normativa CONEP nº 01/2021, Portaria IEPHA nº 34/2024",
  "CONTRATAÇÃO DE SERVIÇOS ADVOCATÍCIOS ESPECIALIZADOS DE ASSESSORIA JURÍDICA TÉCNICA E SINGULAR, DESTINADOS À ATUAÇÃO EM DEMANDAS DE ALTA COMPLEXIDADE ENVOLVENDO AÇÕES CIVIS PÚBLICAS E PATRIMÔNIO HISTÓRICO",
  "Contratação de serviços de manutenção do Pergamum, sistema de gerenciamento integrado do acervo bibliográfico existente nas bibliotecas.",
  "Despesa visando aquisição de 1 un tinta esmalte ext. acet. b.s. int. rv2593 3 2lt renner, destinados a manutenção preventiva e corretiva do patrimônio histórico do município",
  "Contratação de empresa especializada para o fornecimento e instalação de materiais destinados à sinalização, identificação, valorização e preservação do patrimônio cultural do Município",
  "Tombamento patrimonial de bens móveis do almoxarifado e inventário patrimonial anual da Prefeitura",
  "Treinamento e capacitação profissional para servidores no curso Introdução à Arqueologia e patrimônio cultural",
  "Aquisição de materiais de consumo destinados às atividades de conservação e restauração de documentos arquivísticos sob guarda do Arquivo Nacional.",
  "Contratação de empresa para execução de obra de construção do muro perimetral da Capela Mortuária Municipal",
  "PRE QUALIFICAÇÃO PARA A CONSTRUÇÃO DE PRAÇA DA IGREJA DA LOCALIDADE DE CONCEIÇÃO NO MUNICIPIO DE COREAÚ/CE",
];
for (const text of NEGATIVES) {
  const t = triage(text);
  ok(!t.relevant, `negativo NÃO relevante (nota ${t.score}): ${text.slice(0, 80)}…`);
}

/* “possíveis”: aparecem só com relevância mínima baixa (nota 35–49), nunca como relevantes */
const POSSIBLE = [
  "Contratação de empresa especializada para elaboração de projetos executivos dos sistemas cenotécnicos e disciplinas complementares do Theatro Municipal Capitólio, bem cultural tombado, incluindo o fornecimento de todos os documentos técnicos",
  "Contratação de empresa especializada para a execução da obra de Reforma do Santuário São Francisco de Assis, em Alagoinhas - Bahia",
  "Contratação de empresa especializada para execução de obras de Reforma e Revitalização das Igrejas Nossa Senhora Aparecida na Comunidade do Serrote, São José na Comunidade do Fumal",
  "Execução do Projeto “Reforma da Igreja da Comunidade São José”, da Mitra Angelopolitana – Paroquia São Sebastião de Alegria/RS.",
];
for (const text of POSSIBLE) {
  const t = triage(text);
  ok(!t.relevant && t.score >= 35 && t.score < 50, `possível (nota ${t.score}): ${text.slice(0, 60)}…`);
}

// máscara de ruído
eq(maskNoise(norm("restauração florestal e conservação de rodovias")).masked.length >= 1, true, "máscara pega restauração florestal");
eq(triage("").relevant, false, "texto vazio");
ok(triage("restauro de retábulo").score > triage("reforma de escola").score, "restauro > reforma comum");
// “iphan/iepha” sozinhos NÃO são termo forte (lição do Patrinu)
ok(!triage("Contratação de empresa para fornecimento de água mineral e energia para a sede do IPHAN em Ouro Preto").relevant, "IPHAN sozinho não basta");
ok(!triage("Aquisição de veículo para a Superintendência do IEPHA").relevant, "IEPHA sozinho não basta");
ok(triage("Obra de restauro da fachada da sede do IPHAN em Ouro Preto").relevant, "IPHAN + restauro vale");
// palavra inteira: “detalha” não contém “talha”; “Tombos” é município, não tombo
ok(!triage("A empresa detalha as exigências do edital de serviços gerais").relevant, "limite de palavra (detalha)");
ok(!triage("Prefeitura Municipal de Tombos - aquisição de uniformes").relevant, "município Tombos");

/* ------------------------------ tipo: projeto × execução ------------------------------ */
eq(classifyKind(norm("elaboração de projeto executivo de restauração da igreja")).kind, "projeto", "tipo: projeto executivo");
eq(classifyKind(norm("execução de obra de restauro conforme projeto executivo anexo")).kind, "execucao", "tipo: obra “conforme projeto” é execução");
eq(classifyKind(norm("elaboração de projetos e execução das obras de restauro do teatro")).kind, "projeto_execucao", "tipo: projeto e execução");
eq(classifyKind(norm("contratação integrada de projeto e obra de restauração")).kind, "projeto_execucao", "tipo: contratação integrada");
eq(classifyKind(norm("laudo técnico e diagnóstico do estado de conservação do casario histórico")).kind, "laudo", "tipo: laudo/diagnóstico");
eq(classifyKind(norm("fornecimento de cadeiras")).kind, "outro", "tipo: outro");

/* -------------------------------- normalização -------------------------------- */
eq(brIso("2026-11-10T09:30:00"), "2026-11-10T12:30:00.000Z", "hora de Brasília → UTC");
eq(brIso("2026-11-10T09:30:00.123456"), "2026-11-10T12:30:00.000Z", "frações de segundo");
eq(brIso("2026-11-10T09:30:00Z"), "2026-11-10T09:30:00.000Z", "já com fuso");
eq(brIso(""), null, "data vazia");
eq(brIso("lixo"), null, "data inválida");
eq(stripPortalTag("[LICITANET] - Registro de preços"), "Registro de preços", "tira o rótulo do portal");
eq(stripPortalTag("[Portal de Compras Públicas] - Contratação"), "Contratação", "tira o rótulo do portal (2)");
eq(pncpUrl("10287373000149", "2026", "0059"), "https://pncp.gov.br/app/editais/10287373000149/2026/59", "link do PNCP");
eq(titleOf("“Contratação de empresa. Segunda frase que não entra”"), "Contratação de empresa.", "título = primeira frase");
ok(titleOf("a ".repeat(200)).length <= 151, "título limitado");
eq(titleOf("Contratação de empresa especializada para execução de obra de restauração da Igreja Matriz de Itu, patrimônio histórico."), "Execução de obra de restauração da Igreja Matriz de Itu, patrimônio histórico.", "título: tira a abertura padrão");
eq(titleOf("O objeto do presente instrumento é a contratação de empresa especializada para elaboração de projetos de restauro do Solar"), "Elaboração de projetos de restauro do Solar", "título: tira “O objeto do presente instrumento é…”");
eq(titleOf("Restauração e pintura dos vitrais da capela do cemitério São José."), "Restauração e pintura dos vitrais da capela do cemitério São José.", "título: objeto curto fica como está");

const NOW = Date.parse("2026-10-24T15:00:00Z");
const searchRaw = {
  numero_controle_pncp: "10287373000149-1-000059/2026",
  item_url: "/compras/10287373000149/2026/59",
  description: "[LICITANET] - Restauração da Igreja Matriz de Itu",
  orgao_cnpj: "10287373000149",
  orgao_nome: "MUNICIPIO DE ITU",
  unidade_nome: "Secretaria de Cultura",
  esfera_id: "M",
  uf: "SP",
  municipio_nome: "Itu",
  codigo_ibge: "3523909",
  modalidade_licitacao_id: "4",
  modalidade_licitacao_nome: "Concorrência - Eletrônica",
  situacao_nome: "Divulgada no PNCP",
  cancelado: false,
  data_publicacao_pncp: "2026-10-20T10:00:00.5",
  data_inicio_vigencia: "2026-10-21T09:00",
  data_fim_vigencia: "2026-11-10T09:30",
  valor_total_estimado: 584511.92,
  link_sistema_origem: "https://portal.exemplo/edital/1",
};
const s1 = fromSearchItem(searchRaw, NOW)!;
eq(s1.externalId, "10287373000149-1-000059/2026", "busca: id");
eq(s1.object, "Restauração da Igreja Matriz de Itu", "busca: objeto sem rótulo");
eq([s1.esfera, s1.uf, s1.city, s1.modalidadeId, s1.situation, s1.valueCents], ["municipal", "SP", "Itu", 4, "aberto", 58451192], "busca: campos");
eq(s1.closeAt, "2026-11-10T12:30:00.000Z", "busca: fim das propostas");
eq(s1.url, "https://pncp.gov.br/app/editais/10287373000149/2026/59", "busca: url PNCP");
eq(s1.unit, "Secretaria de Cultura", "busca: unidade");
eq(fromSearchItem({ ...searchRaw, data_fim_vigencia: "2026-10-01T09:30" }, NOW)!.situation, "encerrado", "busca: prazo vencido = encerrado");
eq(fromSearchItem({ ...searchRaw, situacao_nome: "Suspensa" }, NOW)!.situation, "suspenso", "busca: suspenso");
eq(fromSearchItem({ ...searchRaw, cancelado: true }, NOW)!.situation, "cancelado", "busca: cancelado");
eq(fromSearchItem({ ...searchRaw, numero_controle_pncp: "" }, NOW), null, "busca: sem id é descartado");
eq(fromSearchItem({ ...searchRaw, description: "curto" }, NOW), null, "busca: objeto curto é descartado");

const consultaRaw = {
  numeroControlePNCP: "08761140000194-1-000040/2025",
  anoCompra: 2025,
  sequencialCompra: 40,
  objetoCompra: "Obras de restauro do Palacete",
  orgaoEntidade: { cnpj: "08761140000194", razaoSocial: "SECRETARIA DE ESTADO DA ADMINISTRACAO", esferaId: "E" },
  unidadeOrgao: { ufSigla: "PB", municipioNome: "João Pessoa", codigoIbge: "2507507", nomeUnidade: "SECRETARIA DE ESTADO DA ADMINISTRACAO" },
  modalidadeId: 6,
  modalidadeNome: "Pregão - Eletrônico",
  situacaoCompraNome: "Divulgada no PNCP",
  dataAberturaProposta: "2026-10-23T08:00:00",
  dataEncerramentoProposta: "2026-11-09T23:59:59",
  dataPublicacaoPncp: "2025-03-13T14:10:37",
  valorTotalEstimado: 9732643.43,
  linkSistemaOrigem: "https://www.centraldecompras.pb.gov.br/x",
};
const c1 = fromConsultaItem(consultaRaw, NOW)!;
eq([c1.esfera, c1.uf, c1.unit, c1.source, c1.url], ["estadual", "PB", null, "pncp-consulta", "https://pncp.gov.br/app/editais/08761140000194/2025/40"], "consulta: campos");
eq(c1.valueCents, 973264343, "consulta: valor em centavos");

/* ---------------------- coleta com fetch simulado (retry, dedupe, corte, retomada) ---------------------- */
type Call = { q: string; status: string; page: string };
const realFetch = globalThis.fetch;
function stubSearch(handler: (c: Call, n: number) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  let n = 0;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    const c: Call = { q: u.searchParams.get("q") ?? "", status: u.searchParams.get("status") ?? "", page: u.searchParams.get("pagina") ?? "" };
    calls.push(c);
    const r = handler(c, ++n);
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : "", { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }) as typeof fetch;
  return calls;
}
const item = (id: number, text: string, pub = "2026-10-23T10:00:00") => ({ ...searchRaw, numero_controle_pncp: `1000000000000${id}-1-00000${id}/2026`, item_url: `/compras/1000000000000${id}/2026/${id}`, description: text, data_publicacao_pncp: pub, data_fim_vigencia: "2027-01-10T09:30" });

async function scanTests() {
  // 1) retry: 429 depois 200
  let calls = stubSearch((c, n) => (n === 1 ? { status: 429, headers: { "retry-after": "1" } } : { status: 200, body: { items: [], total: 0 } }));
  const r = await getJson("https://pncp.gov.br/api/search/?q=x", { retries: 3 });
  eq(r, { items: [], total: 0 }, "retry: 429 → 200 devolve o corpo");
  eq(calls.length, 2, "retry: fez 2 chamadas");

  // 2) deadline estoura durante o backoff
  stubSearch(() => ({ status: 503 }));
  let threw = false;
  try {
    await getJson("https://pncp.gov.br/api/search/?q=x", { retries: 5, deadline: Date.now() + 2500 });
  } catch (e) {
    threw = e instanceof DeadlineError;
  }
  ok(threw, "deadline: lança DeadlineError em vez de ficar tentando");

  // 2b) 429 persistente → HttpError (não é “sem dados”: a coleta pára e pode ser retomada)
  stubSearch(() => ({ status: 429 }));
  let httpErr: unknown = null;
  try {
    await getJson("https://pncp.gov.br/api/search/?q=x", { retries: 1 });
  } catch (e) {
    httpErr = e;
  }
  ok(httpErr instanceof HttpError && (httpErr as HttpError).status === 429, "429 persistente lança HttpError");
  // 404 = sem dados
  stubSearch(() => ({ status: 404 }));
  eq(await getJson("https://pncp.gov.br/api/search/?q=x", { retries: 0 }), null, "404 devolve null");

  // 3) varredura: dedupe entre consultas, corte por data, triagem e sink
  const good = item(1, "Contratação de empresa para restauração da Igreja Matriz de Itu, patrimônio histórico");
  const noise = item(2, "Aquisição de materiais odontológicos para restauração dentária");
  const old = item(3, "Obra de restauro do Teatro Municipal", "2026-01-02T10:00:00");
  calls = stubSearch((c) => ({ status: 200, body: { total: 3, items: c.status === "" ? [good, noise, old] : [good, noise] } }));
  const got: string[] = [];
  const res = await runScan({ mode: "rapida", days: 14, sources: ["busca"], throttleMs: 0, sink: async (items) => void got.push(...items.map((i) => i.externalId)) });
  ok(res.completed, "varredura rápida completa");
  eq(got.length, 1, "dedupe: o mesmo edital achado em várias consultas entra uma vez");
  ok(!got.some((id) => id.includes("00000002")), "ruído (odontológico) não vai ao sink");
  ok(!got.some((id) => id.includes("00000003")), "publicado antes da janela não vai ao sink");
  ok(res.stats.relevant === 1 && (res.stats.scanned ?? 0) > 1, "estatísticas da varredura");

  // 4) retomada: começa da consulta indicada pelo cursor
  calls = stubSearch(() => ({ status: 200, body: { total: 0, items: [] } }));
  await runScan({ mode: "rapida", days: 14, sources: ["busca"], throttleMs: 0, cursor: { phase: "busca", step: 10 }, sink: async () => {} });
  const qs = [...new Set(calls.map((c) => c.q))];
  eq(qs, ["conservação restauro", "monumento"], "retomada: só as consultas do passo 10 em diante");

  // 4b) consulta oficial: falha na página 2 → varredura parcial com cursor exato (não pula a modalidade)
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    const page = Number(u.searchParams.get("pagina"));
    if (page === 1) return new Response(JSON.stringify({ data: [{ numeroControlePNCP: "11111111000111-1-000001/2026", objetoCompra: "Obra de restauração da Igreja Matriz de Itu, patrimônio histórico", orgaoEntidade: { cnpj: "11111111000111", razaoSocial: "Município de Itu", esferaId: "M" }, unidadeOrgao: { ufSigla: "SP", municipioNome: "Itu" }, anoCompra: 2026, sequencialCompra: 1, dataEncerramentoProposta: "2027-01-10T09:30:00" }], totalPaginas: 3 }), { status: 200 });
    return new Response("", { status: 503 });
  }) as typeof fetch;
  const partial: string[] = [];
  const part = await runScan({ mode: "completa", days: 14, sources: ["consulta"], throttleMs: 0, retries: 0, sink: async (items) => void partial.push(...items.map((i) => i.externalId)) });
  ok(!part.completed, "consulta: falha no meio não conclui");
  eq(part.cursor, { phase: "consulta", step: 0, page: 2 }, "consulta: cursor aponta a página que falhou");
  eq(partial.length, 1, "consulta: o que veio antes da falha foi entregue");

  // 5) deadline: devolve cursor para retomar
  stubSearch(() => ({ status: 500 }));
  const cut = await runScan({ mode: "rapida", days: 14, sources: ["busca"], throttleMs: 0, deadline: Date.now() + 2000, sink: async () => {} });
  ok(!cut.completed && !!cut.cursor, "sem tempo: não conclui e devolve o ponto de retomada");

  globalThis.fetch = realFetch;
}

/* ---------------------------------- filtros da URL ---------------------------------- */
eq(parseFilters(new URLSearchParams("")), DEFAULT_FILTERS, "filtros: padrão");
const pf = parseFilters(new URLSearchParams("tipo=projeto,execucao,lixo&uf=sp,MG,XX&vmin=100000&prazo=7&triagem=ativos&rel=70&ordem=valor&situacao=todos&pagina=3"));
eq([pf.tipos, pf.ufs, pf.vmin, pf.prazo, pf.triagem, pf.rel, pf.sort, pf.situacao, pf.page], [["projeto", "execucao"], ["SP", "MG"], 100000, 7, "ativos", 70, "valor", "todos", 3], "filtros: leitura e saneamento");
eq(filtersToQuery(DEFAULT_FILTERS), "", "filtros: padrão não polui a URL");
eq(parseFilters(new URLSearchParams(filtersToQuery(pf))), pf, "filtros: ida e volta pela URL");
eq(parseFilters(new URLSearchParams("rel=999&prazo=5&ordem=x&triagem=x")).rel, 50, "filtros: relevância inválida volta ao padrão");
const T0 = Date.parse("2026-10-24T15:00:00Z");
eq(daysLeft("2026-10-31T15:00:00Z", T0), 7, "dias restantes");
eq(daysLeft("2026-10-24T23:00:00Z", T0), 0, "encerra hoje");
eq(daysLeft("2026-10-20T15:00:00Z", T0), -4, "já passou");
eq(daysLeft(null, T0), null, "sem prazo");
eq(deadlineText(1), "Encerra amanhã", "texto do prazo");
eq(effectiveSituation({ situation: "aberto", closeAt: "2026-10-01T00:00:00Z" }, T0), "encerrado", "aberto vencido = encerrado");
eq(effectiveSituation({ situation: "suspenso", closeAt: "2026-10-01T00:00:00Z" }, T0), "suspenso", "suspenso continua suspenso");

/* ----------------------------- OIDC do GitHub Actions ----------------------------- */
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as object), kid: "k1", alg: "RS256", use: "sig" } as Jwk;
const getKey = async (kid: string) => (kid === "k1" ? jwk : null);
const cfg = oidcConfig({});
const nowS = Math.floor(Date.now() / 1000);
const goodClaims = {
  iss: "https://token.actions.githubusercontent.com",
  aud: "https://crm.estudiorestaura.com.br",
  repository: "ojhondev/crmestudio",
  repository_owner: "ojhondev",
  ref: "refs/heads/main",
  event_name: "schedule",
  job_workflow_ref: "ojhondev/crmestudio/.github/workflows/editais.yml@refs/heads/main",
  iat: nowS - 10,
  nbf: nowS - 10,
  exp: nowS + 300,
};
const sign = (claims: object, key = privateKey, header: object = { alg: "RS256", kid: "k1", typ: "JWT" }) => {
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  return `${data}.${b64u(crypto.sign("RSA-SHA256", Buffer.from(data), key))}`;
};
async function oidcTests() {
  const v = (t: string | null) => verifyGithubOidc(t, cfg, { getKey });
  eq((await v(sign(goodClaims))).ok, true, "OIDC: token válido");
  eq((await v(sign({ ...goodClaims, event_name: "workflow_dispatch" }))).ok, true, "OIDC: disparo manual aceito");
  const bad = async (patch: object, why: string) => {
    const r = await v(sign({ ...goodClaims, ...patch }));
    eq(r.ok, false, `OIDC recusa: ${why}`);
  };
  await bad({ aud: "https://outro.exemplo" }, "audiência errada");
  await bad({ repository: "outro/repo" }, "outro repositório");
  await bad({ repository_owner: "outro" }, "outro dono");
  await bad({ ref: "refs/heads/dev" }, "outro branch");
  await bad({ ref: "refs/pull/1/merge" }, "pull request");
  await bad({ event_name: "pull_request" }, "evento pull_request");
  await bad({ event_name: "push" }, "evento push");
  await bad({ job_workflow_ref: "ojhondev/crmestudio/.github/workflows/outro.yml@refs/heads/main" }, "outro arquivo de workflow");
  await bad({ job_workflow_ref: "ojhondev/crmestudio/.github/workflows/editais.yml@refs/heads/dev" }, "workflow de outro branch");
  await bad({ iss: "https://evil.example" }, "emissor errado");
  await bad({ exp: nowS - 600, iat: nowS - 900 }, "expirado");
  await bad({ iat: nowS - 4000, exp: nowS + 300 }, "emitido há tempo demais");
  await bad({ nbf: nowS + 3000 }, "ainda não válido");
  eq((await v(sign(goodClaims, other.privateKey))).ok, false, "OIDC recusa: assinatura de outra chave");
  eq((await v(sign(goodClaims, privateKey, { alg: "RS256", kid: "desconhecida" }))).ok, false, "OIDC recusa: kid desconhecido");
  eq((await v(sign(goodClaims, privateKey, { alg: "none", kid: "k1" }))).ok, false, "OIDC recusa: alg none");
  eq((await v(sign(goodClaims, privateKey, { alg: "HS256", kid: "k1" }))).ok, false, "OIDC recusa: HS256");
  eq((await v(null)).ok, false, "OIDC recusa: sem token");
  eq((await v("a.b")).ok, false, "OIDC recusa: malformado");
  const tampered = sign(goodClaims).split(".");
  tampered[1] = b64u(JSON.stringify({ ...goodClaims, repository: "outro/repo" }));
  eq((await v(tampered.join("."))).ok, false, "OIDC recusa: payload adulterado");
  // configuração por variável de ambiente
  const c2 = oidcConfig({ EDITAIS_GITHUB_REPO: "a/b", EDITAIS_OIDC_AUDIENCE: "https://x" });
  eq([c2.repository, c2.audience], ["a/b", "https://x"], "OIDC: configurável por variável");
}

/* --------------------- gravação no banco: idempotência (opcional) --------------------- */
async function dbTests() {
  await import("./_server-only.cjs");
  const ing = await import("../src/lib/editais/ingest");
  const { db, schema } = await import("../src/lib/db");
  const { like, eq: deq } = await import("drizzle-orm");
  const mk = (n: number, close: string, extra: Partial<EditalInput> = {}): EditalInput => ({
    ...(fromSearchItem({ ...searchRaw, numero_controle_pncp: `QA-TEST-${n}`, item_url: `/compras/10287373000149/2026/${n}`, description: `Obra de restauração da Igreja Matriz QA ${n}, patrimônio histórico`, data_fim_vigencia: close }, Date.now())!),
    ...extra,
  });
  const cleanup = async () => void (await db.delete(schema.editais).where(like(schema.editais.externalId, "QA-TEST-%")));
  await cleanup();
  try {
    const batch = [mk(1, "2027-03-10T09:00"), mk(2, "2027-03-11T09:00")];
    const a = await ing.ingestBatch(batch, null, { notify: false });
    eq([a.created, a.updated], [2, 0], "banco: 1ª gravação cria 2");
    const b = await ing.ingestBatch(batch, null, { notify: false });
    eq([b.created, b.updated], [0, 2], "banco: repetir não duplica (idempotente)");
    const rows = await db.select().from(schema.editais).where(like(schema.editais.externalId, "QA-TEST-%"));
    eq(rows.length, 2, "banco: 2 linhas");
    ok(rows.every((r) => r.score >= 50 && r.matched.length > 0), "banco: nota e termos gravados pelo servidor");
    // prazo mudou no portal → histórico “portal”
    const c = await ing.ingestBatch([mk(1, "2027-03-20T09:00")], null, { notify: false });
    eq(c.updated, 1, "banco: atualização do prazo");
    const ev = await db.select().from(schema.editalEvents).where(deq(schema.editalEvents.editalId, rows.find((r) => r.externalId === "QA-TEST-1")!.id));
    ok(ev.some((e) => e.type === "portal" && /Prazo de propostas alterado/.test(e.body)), "banco: mudança de prazo vira evento no histórico");
    // triagem da equipe sobrevive à nova varredura
    await db.update(schema.editais).set({ triage: "interessante", notes: "ligar para o órgão" }).where(deq(schema.editais.externalId, "QA-TEST-2"));
    await ing.ingestBatch(batch, null, { notify: false });
    const [r2] = await db.select().from(schema.editais).where(deq(schema.editais.externalId, "QA-TEST-2"));
    eq([r2.triage, r2.notes], ["interessante", "ligar para o órgão"], "banco: nova varredura não apaga a triagem nem as notas");
    // ruído não entra
    const d = await ing.ingestBatch([mk(3, "2027-03-10T09:00", { object: "Aquisição de materiais odontológicos para restauração dentária" })], null, { notify: false });
    eq([d.created, d.filtered], [0, 1], "banco: ruído é filtrado no servidor mesmo que o coletor mande");
  } finally {
    await cleanup();
  }
}

async function main() {
  await scanTests();
  await oidcTests();
  if (process.argv.includes("--db")) await dbTests();
  console.log(fail ? `\n${fail} de ${total} verificações falharam` : `Todas as ${total} verificações passaram`);
  process.exit(fail ? 1 : 0);
}
main();
