/**
 * Triagem por regras (sem IA) dos editais: decide se o OBJETO de uma licitação é de RESTAURO de patrimônio
 * (projeto ou execução), dá uma nota de relevância (0–100), guarda os termos que casaram (auditoria) e
 * classifica o tipo (projeto × execução × projeto+execução × laudo/consultoria).
 *
 * Princípios (lições do Patrinu + dados reais do PNCP):
 *  1. PRECISÃO primeiro. "Restauração" sozinha é ambígua (dental, florestal, de vias…): só vale com contexto de patrimônio.
 *  2. Primeiro MASCARAMOS o ruído conhecido (restauração florestal/dental/de pavimento, "obras de arte especiais",
 *     tombamento patrimonial de bens móveis, energia solar…); só depois procuramos os termos de interesse.
 *  3. Termos fortes (restauro, conservação-restauração, técnicas como retábulo/douramento/pintura mural) bastam sozinhos;
 *     termos de contexto (patrimônio histórico, bem tombado, igreja, museu…) só valem junto de um termo de obra/projeto;
 *     "iphan/iepha" sozinhos NÃO contam (o órgão compra água, luz, veículo) — só reforçam um objeto que já parece de restauro.
 *  4. Palavras casam inteiras ("detalha" não contém "talha"; "Tombos" não é "tombo").
 *
 * Arquivo puro (sem servidor): usado pela API, pela varredura rápida e pelo script do GitHub Actions. Testado em scripts/test-editais.ts.
 */
import type { EditalKind } from "./types";

/** minúsculas, sem acento, só letras/números/espaço */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Rule = [label: string, re: RegExp];
const R = (label: string, re: string): Rule => [label, new RegExp(re)];

/* --------------------------------- ruído (máscara) --------------------------------- */

const SOLAR_WORDS = "energia|usina|usinas|painel|paineis|placa|placas|sistema|sistemas|iluminacao|aquecedor|aquecedores|aquecimento|geracao|luz|lampada|lampadas|poste|postes|carro|kit|kits";
const NOISE: RegExp[] = [
  // restauração que NÃO é de patrimônio
  /\brestaura(?:cao|coes|r)\b(?: \w+){0,2} (?:florestal|florestais|ecologica|ecologicas|ambiental|ambientais|de areas?|da vegetacao|de vegetacao|de ecossistemas?|de nascentes?|de pastagens?|de solos?|de matas?|de mata ciliar|de manguezais?|de corais|de habitat|de rios|de margens|de biomas?|de paisagens? florestais|de terras)\b/g,
  /\brestaura(?:cao|coes|r|doras?)\b(?: \w+){0,2} (?:dental|dentais|dentaria|dentarias|odontologic\w*|em resina|composta|direta|indireta|provisoria|de dentes|de amalgama)\b/g,
  /\b(?:material|materiais|cimento|resina|resinas|kit|kits|instrumental|instrumentais|ionomero\w*|amalgama|insumos?) (?:\w+ ){0,3}restaurador(?:a|es|as)?\b/g,
  /\bresinas? (?:composta|compostas|fotopolimerizavel\w*)\b/g,
  /\brestaura(?:cao|coes|r|o)\b(?: \w+){0,2} (?:de |do |da |dos |das )?(?:veiculos?|automoveis|carros?|motocicletas?|caminhoes|frota|maquinas?|pneus?|impressoras?|computadores?|equipamentos? de informatica|dados|backup|sistema operacional)\b/g,
  /\brestaura(?:cao|coes|r|o)\b(?: (?:asfaltica|funcional|rodoviaria|viaria|urbana))?(?: e (?:conservacao|manutencao|melhoramentos?|duplicacao|implantacao|recuperacao|adequacao))?(?: com melhoramentos)?(?: (?:de|do|da|dos|das|em|na|no|nas|nos))? ?(?:\w+ )?(?:vias|ruas?|avenidas?|rodovias?|rodoviario|rodoviarios|estradas?|pavimentos?|pavimentacao|asfalto|asfaltic\w*|trechos?|pistas?|acostamentos?|vicinais?|bueiros?|drenagem|taludes?|encostas?|sarjetas?|meio fio|ciclovias?|sinalizacao|malha)\b/g,
  /\bhospital da restauracao\b/g,
  /\bobras? de arte (?:especiais?|correntes?)\b/g,
  /\boaes?\b/g,
  /\bconservacao (?:de |das |nas )?(?:rodovias?|estradas?|vias|ruas?)\b/g,
  // "tombamento" administrativo de bens móveis (plaqueta de patrimônio) e inventário patrimonial
  /\btombamento (?:patrimonial|de bens(?: \w+)?|de materiais|de equipamentos|de moveis|de acervo patrimonial|de itens|de veiculos|dos bens)\b/g,
  /\b(?:plaquetas?|etiquetas?|identificacao) (?:de |do |para )?(?:tombamento|patrimonio|patrimonial)\b/g,
  /\b(?:inventario|controle|gestao|levantamento|avaliacao|reavaliacao|conciliacao|baixa) (?:\w+ )?patrimonial\b/g,
  /\bbens? (?:moveis|patrimoniais|permanentes) tombados?\b/g,
  /\btombamento (?:n|no|numero)? ?\d+\b/g,
  // endereço: "localizado na Rua X, nº 1, Centro Histórico" é lugar, não assunto
  /\blocalizad[oa]s?\b[^.;]{0,120}?\b(?:centro historico|sitio historico)\b/g,
  // solar fotovoltaico, matriz curricular/energética, talha elétrica, forro de gesso
  new RegExp(`\\b(?:${SOLAR_WORDS}) (?:\\w+ )?solar\\b`, "g"),
  /\bsolar (?:fotovoltaic\w*|termic\w*|on grid|off grid)\b/g,
  /\bmatriz (?:energetica|curricular|salarial|de risco|de riscos|de responsabilidade|de rastreabilidade|swot|tributaria|de custos|de precos|de dados)\b/g,
  /\b(?:talhas?) (?:eletricas?|manuais?|de corrente|hidraulicas?|de aco|pneumaticas?)\b/g,
  /\b(?:talha|talhas) (?:de )?(?:\d+|\w+ )?(?:ton|toneladas?|kg)\b/g,
  /\b(?:forro|forros) (?:de )?(?:pvc|gesso|isopor|mineral|modular|acustico|drywall)\b/g,
  /\bcapelas? (?:mortuarias?|velatorias?|ardentes?|funerarias?)\b/g,
  /\bmuseu de (?:ciencias|historia natural)\b/g,
  /\bteatro de (?:operacoes|bonecos|fantoches)\b/g,
  /\bforte (?:chuva|vento|calor|demanda|impacto|odor|trafego|concentracao)\b/g,
  /\bpalacio (?:de justica|da justica|do governo|do planalto)\b/g,
];

/** Aplica a máscara de ruído: o trecho some do texto analisado (vira " # "). */
export function maskNoise(t: string): { text: string; masked: string[] } {
  const masked: string[] = [];
  let out = t;
  for (const re of NOISE) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => {
      masked.push(m.trim());
      return " # ";
    });
  }
  return { text: out, masked };
}

/* ----------------------------- termos de interesse ----------------------------- */

/** Restauro explícito (substantivo): forte por si só. */
const RESTAURO: Rule[] = [
  R("restauro", "\\brestauros?\\b"),
  R("conservação-restauração", "\\bconservacao\\/? restaura(?:cao|coes|o)\\b"),
  R("conservação e restauro", "\\bconservacao e restauro\\b"),
  R("restauração (de patrimônio)", "\\brestaura(?:cao|coes) (?:de |do |da |dos |das )?(?:patrimonio|bens? (?:cultural|culturais|tombados?|integrados?|moveis)|obras? de arte|acervo|documentos?|livros?|mapas?|pinturas? (?:a oleo|sobre tela|murais?|artisticas?|historicas?|de cavalete)|esculturas?|retabulos?|imagens? sacras?|moveis historicos|mobiliario historico)\\b"),
];

/** Técnicas e objetos típicos do restauro (fortes): retábulo, douramento, pintura mural… */
const TECH: Rule[] = [
  R("retábulo", "\\bretabulos?\\b"),
  R("douramento", "\\bdouramentos?\\b"),
  R("talha (barroca/dourada)", "\\btalhas? (?:dourada|douradas|em madeira|barroca|barrocas|entalhada|entalhadas|policromada|policromadas|decorativa|artistica)\\b"),
  R("policromia", "\\bpolicromi(?:a|as|ada|adas)\\b"),
  R("pintura mural", "\\bpinturas? murais?\\b"),
  R("forro pintado", "\\bforros? pintad[oa]s?\\b|\\bpinturas? de forros?\\b|\\bpinturas? (?:de cavalete|a oleo|sobre tela|sobre madeira|historicas?)\\b"),
  R("azulejaria", "\\bazulejos? (?:historic\\w*|antigos?|portugues\\w*|de epoca|decorados?)\\b"),
  R("prospecção pictórica", "\\bprospec(?:cao|coes) (?:pictoric\\w+|estratigrafic\\w+)\\b|\\bestratigrafi(?:a|as|ca|cas)\\b|\\bcamadas? pictoric\\w+\\b|\\bmapeamento de danos\\b|\\banalises? (?:laboratoriais? )?(?:de )?pigmentos?\\b"),
  R("reintegração cromática", "\\breintegracao cromatica\\b"),
  R("estuque", "\\bestuques?\\b"),
  R("cantaria", "\\bcantarias?\\b"),
  R("taipa/pau a pique", "\\btaipa de (?:pilao|mao|sebe)\\b|\\bpau a pique\\b|\\badobe\\b"),
  R("argamassa de cal", "\\bargamassas? de cal\\b"),
  R("vitral", "\\bvitrais?\\b"),
  R("arte sacra", "\\barte sacra\\b|\\bimaginaria\\b|\\bimagens? sacras?\\b|\\besculturas? sacras?\\b|\\bobras? de arte sacra\\b"),
  R("bens integrados", "\\bbens? (?:moveis e )?integrados?\\b"),
  R("conservação de artefatos históricos", "\bconservacao de (?:artefatos|colecoes|pecas|objetos|bens) (?:arqueologic\w+|historic\w+|museologic\w+|culturais)\b"),
  R("conservação preventiva (acervo)", "\\bconservacao preventiva\\b"),
  R("acervo museológico/histórico", "\\bacervos? (?:museologic\\w*|historic\\w*|sacro|artistic\\w*)\\b"),
  R("higienização de acervo", "\\bhigienizacao (?:e \\w+ )?de (?:acervo|documentos|livros|obras)\\b"),
];

/** Contexto forte de patrimônio: só vale junto de termo de obra/projeto. */
const CTX_STRONG: Rule[] = [
  R("patrimônio histórico/cultural", "\\bpatrimonio (?:historico|cultural|artistico|arquitetonico|edificado|material|imovel|mundial|da humanidade|nacional|historico e artistico|historico e cultural)\\b"),
  R("bem tombado", "\\btombad[oa]s?\\b|\\bbens? tombados?\\b|\\bimoveis? tombados?\\b|\\bedificac(?:ao|oes) tombad\\w+\\b|\\bpredios? tombados?\\b|\\bareas? tombadas?\\b|\\btombad[oa]s? (?:pelo|pela|pelos|pelas|em nivel|a nivel|no nivel) \\w+\\b|\\btombad[oa]s? (?:iphan|pelo iphan)\\b"),
  R("bem cultural", "\\bbens? culturais?\\b|\\bbens? de interesse (?:historico|cultural|arquitetonico)\\b"),
  R("sítio/centro histórico", "\\bsitios? historicos?\\b|\\bcentros? historicos?\\b|\\bnucleos? historicos?\\b|\\bcidade historica\\b|\\bcentro antigo\\b"),
  R("conjunto arquitetônico", "\\bconjuntos? (?:arquitetonic\\w+|historic\\w+|urbano|paisagistic\\w+)\\b|\\bcasario\\b|\\bcasaroes historicos\\b"),
  R("edificação histórica", "\\b(?:edificac(?:ao|oes)|edificios?|predios?|imoveis?|casas?|sobrados?|solares?|construc(?:ao|oes)|monumentos?|fachadas?) (?:historic\\w+|coloniais?|imperiais?|seculares?|centenari\\w+)\\b|\\bmonumentos? (?:historico|nacional|publico)\\b"),
  R("valor histórico", "\\b(?:valor|interesse|relevancia|importancia) (?:historic\\w+|arquitetonic\\w+|cultural|artistic\\w+)\\b"),
  R("tombamento", "\\btombamentos?\\b"),
];

/** Tipos de edificação/bens de interesse (fracos): só contam junto de restauração/obra E de sinal de antiguidade/patrimônio. */
const SITE_WEAK: Rule[] = [
  R("igreja", "\\bigrejas?\\b|\\bigreja matriz\\b|\\bmatriz de (?:nossa senhora|sao|santo|santa|n s)\\b|\\bparoquias?\\b"),
  R("capela", "\\bcapelas?\\b"),
  R("catedral/basílica", "\\bcatedrais|\\bcatedral\\b|\\bbasilicas?\\b|\\bsantuarios?\\b|\\bse catedral\\b"),
  R("mosteiro/convento", "\\bmosteiros?\\b|\\bconventos?\\b|\\babadias?\\b"),
  R("casarão/sobrado/solar", "\\bcasaroes?\\b|\\bcasarao\\b|\\bsobrados?\\b|\\bsolar (?:do|da|dos|de|dom|dona|sao|santo)\\b"),
  R("palácio", "\\bpalacios?\\b|\\bpalacete\\b|\\bpaco (?:municipal|imperial|dos)\\b"),
  R("museu", "\\bmuseus?\\b|\\bpinacotecas?\\b"),
  R("teatro", "\\bteatros?\\b|\\bcine teatro\\b"),
  R("forte/fortaleza", "\\bfortalezas?\\b|\\bfortes? (?:de|do|da|dos|das) \\w+\\b|\\bfortim\\b"),
  R("casa de câmara e cadeia", "\\bcasa de camara e cadeia\\b|\\bpelourinho\\b|\\bchafariz\\b|\\bcoreto\\b|\\bruinas?\\b"),
  R("cemitério histórico", "\\bcemiterios? (?:historic\\w+|antigo|municipal)\\b"),
  R("estação/mercado histórico", "\\bestacao ferroviaria\\b|\\bantiga estacao\\b"),
  R("engenho/fazenda", "\\bengenho\\b|\\bfazenda (?:historica|colonial|antiga)\\b|\\bsenzala\\b"),
  R("monumento", "\\bmonumentos?\\b"),
];

/** Sinais de antiguidade/patrimônio (reforçam os termos fracos). */
const HIST_CUE: Rule[] = [
  R("histórico", "\\bhistoric(?:o|a|os|as)\\b"),
  R("colonial/barroco", "\\bcoloniais?\\b|\\bbarroc[oa]s?\\b|\\bimperial\\b|\\bimperiais\\b|\\bneoclassic\\w+|\\beclet(?:ico|ica)\\b|\\bart deco\\b"),
  R("secular/centenário", "\\bseculares?\\b|\\bcentenari[oa]s?\\b|\\bantig[oa]s?\\b|\\bsecul[oa]\\b"),
  R("patrimônio", "\\bpatrimonio\\b|\\bpatrimoniais?\\b"),
  R("tombado", "\\btombad[oa]s?\\b|\\btombamento\\b"),
  R("iphan/iepha", "\\biphan\\b|\\biepha\\b|\\bcondephaat\\b|\\binepac\\b|\\bcondepac\\b|\\bipac\\b|\\bcondephat\\b|\\bcondeph\\b|\\bdphan\\b"),
  R("cultural", "\\bcultural\\b|\\bculturais\\b"),
];

/** frases "obra de restauro de patrimônio" (reforço) */
const HERITAGE_WORK: Rule[] = [
  R("intervenção em bem histórico", "\\b(?:revitalizacao|requalificacao|restauracao|recuperacao|reforma|conservacao|intervenc(?:ao|oes)|reabilitacao|adequacao|manutencao|preservacao)\\b(?: \\w+){0,4} (?:centro historico|sitio historico|bens? tombados?|imoveis? tombados?|patrimonio (?:historico|cultural|edificado|arquitetonico)|conjunto arquitetonico|bens? culturais?|casario|monumento historico)\\b"),
  R("restauração da igreja/prédio histórico", "\\brestaura(?:cao|coes)\\b(?: \\w+){0,6} (?:igreja|capela|matriz|catedral|basilica|santuario|convento|mosteiro|museu|teatro|palacio|casarao|solar|sobrado|forte|fortaleza|monumento|chafariz|coreto|pelourinho|estacao|cemiterio|fachada historica)\\b"),
];

/** Ação de obra e de projeto. */
const OBRA = /\b(?:obras?|reformas?|recuperacao|recuperar|revitalizacao|requalificacao|restaura(?:cao|coes|r)|restauros?|conservacao|manutencao|adequacao|intervenc(?:ao|oes)|reparos?|reabilitacao|reconstrucao|ampliacao|empreitada|execucao|servicos de engenharia|mao de obra|pintura|cobertura|telhado|estabilizacao|consolidacao|escoramento)\b/;
/** projeto/estudo que de fato prepara uma intervenção (consultoria e assessoria genéricas NÃO entram no portão de precisão) */
const PROJ_GATE = /\b(?:projetos?|levantamentos?|diagnosticos?|laudos?|prospec(?:cao|coes)|anteprojeto|estudo preliminar|sondagens?)\b/;
const PROJ = /\b(?:projetos?|levantamentos?|diagnosticos?|laudos?|estudos?|inventarios?|prospec(?:cao|coes)|consultoria|assessoria|fiscalizacao|gerenciamento|supervisao|cadastro|plano de|pareceres?|caderno de encargos|memorial|orcamento|anteprojeto|estudo preliminar|mapeamento|sondagens?)\b/;

/* ------------------------------- avaliação --------------------------------- */

export type Triage = {
  /** relevante o bastante para listar (nota ≥ 50 e passou pelo portão de precisão) */
  relevant: boolean;
  /** 0–100 */
  score: number;
  /** termos que casaram (auditoria) */
  matched: string[];
  /** trechos de ruído descartados antes da análise */
  masked: string[];
  kind: EditalKind;
  /** por que o tipo foi esse */
  kindWhy: string;
};

const hits = (rules: Rule[], t: string) => rules.filter(([, re]) => re.test(t)).map(([l]) => l);

/** Tipo do objeto: projeto, execução, ambos, laudo/consultoria. Opera no texto normalizado (já sem ruído). */
export function classifyKind(t: string): { kind: EditalKind; why: string } {
  // "conforme o projeto…" é insumo da obra, não objeto de projeto
  const x = t
    .replace(/\b(?:conforme|de acordo com|segundo|nos termos d[oa]s?|constante d[oa]s?|conforme previsto n[oa]s?|em conformidade com|baseado n[oa]s?|a partir d[oa]s?) (?:o |a |os |as )?(?:\w+ ){0,3}(?:projetos?|laudos?|memorial|planilha|levantamentos?|diagnosticos?)\b/g, " ")
    .replace(/\bprojetos? (?:basico|executivo|completo)? ?(?:e|ou)? ?(?:planilhas?|memorial|anexos?|fornecidos?|aprovad\w+)\b/g, " ");

  const proj =
    /\b(?:elaboracao|elaborar|desenvolvimento|desenvolver|confeccao|execucao|contratacao|prestacao)(?: de| dos| das| do| da)?(?: \w+){0,5} (?:projetos?|estudos? preliminares?|anteprojetos?)\b/.test(x) ||
    /\bprojetos? (?:executivo|basico|de restauro|de restauracao|de arquitetura|arquitetonico|de conservacao|de intervencao|complementares|de engenharia|de reforma|de revitalizacao|de requalificacao|de recuperacao)\b/.test(x) ||
    /\bservicos? tecnicos? (?:especializados? )?(?:de|em) (?:arquitetura|engenharia|projetos?)\b/.test(x) ||
    /\bprojetos? e (?:estudos|levantamento|diagnostico)\b/.test(x);
  const exec =
    /\b(?:execucao|realizacao|execucao dos servicos|execucao das obras|execucao da obra)(?: de| dos| das| do| da)?(?: \w+){0,4} (?:obras?|servicos? de (?:restaura\w*|reforma|recuperacao|conservacao|engenharia)|reforma|restaura(?:cao|coes)|restauros?|recuperacao|revitalizacao|requalificacao|conservacao|intervenc\w+)\b/.test(x) ||
    /\b(?:obras?|servicos?) de (?:restaura(?:cao|coes)|restauro|reforma|recuperacao|conservacao|revitalizacao|requalificacao|engenharia)\b/.test(x) ||
    /\b(?:reforma|restauracao|restauro|recuperacao|revitalizacao|requalificacao)\b/.test(x) ||
    /\bmao de obra\b|\bempreitada\b|\bfornecimento de materiais? e mao de obra\b/.test(x);
  const laudo = /\b(?:laudos?|diagnosticos?|pareceres?|inventarios?|levantamentos? (?:cadastral|planialtimetrico|fotogrametrico|arquitetonico)|prospec\w+|sondagens?|consultoria|assessoria tecnica|fiscalizacao|gerenciamento|supervisao|estudos? de viabilidade|mapeamento|plano de (?:conservacao|manejo|manutencao)|catalogacao|higienizacao)\b/.test(x);
  const both = /\bprojetos? (?:e|\/|com) (?:a )?(?:execucao|obras?|reforma|restaura\w+)\b|\b(?:elaboracao|desenvolvimento) de projetos? e (?:execucao|realizacao)\b|\bprojeto e obra\b|\bprojeto executivo e (?:execucao|obra|reforma)\b|\bcontratacao integrada\b|\bcontratacao semi ?integrada\b|\bprojeto basico e executivo e (?:execucao|obras?)\b|\bprojetos? .{0,80} e (?:execucao|realizacao) (?:d[ao]s? )?(?:obras?|servicos)\b|\b(?:projetos?|elaboracao) .{0,60}\b(?:e|com) (?:a )?execucao d[ao]s? (?:obras?|servicos?|restauro|restauracao)\b/.test(x);

  if (both || (proj && exec && /\b(?:execucao d[ao]s? (?:obras?|servicos?)|execucao de obras?)\b/.test(x))) return { kind: "projeto_execucao", why: "projeto e execução no mesmo objeto" };
  if (proj && !exec) return { kind: "projeto", why: "elaboração de projeto" };
  if (proj && exec) {
    // os dois aparecem: o verbo principal manda (o que vem primeiro no objeto)
    const ip = x.search(/\b(?:projetos?|elaboracao|estudos? preliminar)/);
    const ie = x.search(/\b(?:obras?|execucao|reforma|restaura\w+|recuperacao)/);
    return ie >= 0 && ip >= 0 && ie < ip ? { kind: "execucao", why: "obra (projeto citado depois)" } : { kind: "projeto", why: "projeto citado primeiro" };
  }
  if (exec && !laudo) return { kind: "execucao", why: "obra / serviços de restauro" };
  if (laudo && !exec) return { kind: "laudo", why: "laudo, diagnóstico, levantamento ou consultoria" };
  if (exec && laudo) return { kind: "execucao", why: "obra (com laudo/levantamento acessório)" };
  return { kind: "outro", why: "não identificado" };
}

/** Quanto do começo do objeto é "o objeto de verdade" (o resto costuma ser lista de itens, locais e cláusulas). */
const HEAD = 300;

/** Compra de bens (material, tinta, fármaco…) não é obra nem projeto. */
const GOODS = /\b(?:aquisicao|aquisicoes|compra|compras|registro de precos|fornecimento de (?:materiais?|insumos?|equipamentos?|produtos?|pecas?|tintas?)|despesa visando aquisicao|locacao)\b/;
const SERVICE = /\b(?:obras?|execucao|servicos? (?:de|tecnicos?|especializados?)|empresa especializada|mao de obra|elaboracao|contratacao de (?:empresa|pessoa juridica|profissional|artista|restaurador)|prestacao de servicos?)\b/;
/** Assuntos vizinhos que mencionam "patrimônio/cultural" sem ser restauro. */
const OFFTOPIC = /\b(?:sinalizacao|iluminacao|tributaria|plano diretor|educacao patrimonial|graffiti|grafite|oficinas?|treinamento|capacitacao|curso|show|shows|apresentacao artistica|musical|orquestra|evento|eventos|festival|palestra|software|licenca|seguro|vigilancia|limpeza|alimenticios?|merenda|combustivel|medicamentos?|odontologic\w*|hospitalar|uniformes?|passagens?|hospedagem|buffet|icms|advocaticios?|juridic[ao]s?|relatorio anual|camisetas?|souvenirs?|brindes?|banners?|folders?|impressos?|hidraulic\w*|eletric[ao]s?|ar condicionado|deteccao de incendio|alarme|elevadores?|pergamum|gerenciamento integrado|bibliografic\w*|manutencao (?:preventiva|corretiva)|subestacao|subestacoes|gerador(?:es)?|vacinas?|camara fria|nobreak|no break)\b/;

/** Avalia o texto do edital (objeto + complementos). `orgHint` = nome do órgão/unidade (reforço fraco). */
export function triage(object: string, orgHint = ""): Triage {
  const normalized = norm(object);
  if (!normalized) return { relevant: false, score: 0, matched: [], masked: [], kind: "outro", kindWhy: "sem texto" };
  const { text: t, masked } = maskNoise(normalized);
  const head = t.slice(0, HEAD);

  // sinais no começo do objeto (peso cheio) e no texto todo (peso reduzido: o assunto principal costuma vir primeiro)
  const sig = (s: string) => ({
    restauro: hits(RESTAURO, s),
    restauracao: /\brestaura(?:cao|coes|r|ndo)\b/.test(s),
    tech: hits(TECH, s),
    ctxStrong: hits(CTX_STRONG, s),
    site: hits(SITE_WEAK, s),
    cue: hits(HIST_CUE, s),
    hw: hits(HERITAGE_WORK, s),
    obra: OBRA.test(s),
    proj: PROJ_GATE.test(s),
    projAny: PROJ.test(s),
  });
  const H = sig(head);
  const F = sig(t);
  const org = norm(orgHint);
  const orgCue = /\b(?:iphan|iepha|patrimonio|condephaat|inepac|instituto do patrimonio|fundacao cultural|fundacao nacional de arte|secretaria de cultura|ministerio da cultura|memoria)\b/.test(org);

  const matched = [
    ...new Set([
      ...F.restauro,
      ...(F.restauracao && !F.restauro.length ? ["restauração"] : []),
      ...F.tech,
      ...F.hw,
      ...F.ctxStrong,
      ...F.site,
      ...F.cue.filter((c) => c !== "histórico" || F.ctxStrong.length || F.site.length),
    ]),
  ];

  const hardCue = (c: string[]) => c.some((x) => ["histórico", "colonial/barroco", "secular/centenário", "tombado", "iphan/iepha"].includes(x));
  const hardCtxH = H.ctxStrong.length > 0 || H.tech.length > 0 || H.hw.length > 0 || H.site.length > 0 || hardCue(H.cue);
  const hardCtxF = F.ctxStrong.length > 0 || F.tech.length > 0 || F.hw.length > 0 || F.site.length > 0 || hardCue(F.cue);

  let score = 0;
  // restauro explícito
  if (H.restauro.length) score += 60 + Math.min(10, (H.restauro.length - 1) * 5);
  else if (F.restauro.length) score += 50;
  else if (H.restauracao) score += hardCtxH ? 55 : 15; // "restauração" sem contexto de patrimônio quase nunca é restauro
  else if (F.restauracao) score += hardCtxF ? 32 : 8;
  // técnicas de restauro
  if (H.tech.length) score += Math.min(60, 40 + (H.tech.length - 1) * 10);
  else if (F.tech.length) score += 28;
  // contexto de patrimônio
  if (H.ctxStrong.length) score += Math.min(50, 30 + (H.ctxStrong.length - 1) * 10);
  else if (F.ctxStrong.length) score += 12;
  if (H.hw.length) score += 20;
  else if (F.hw.length) score += 8;
  if (H.site.length) score += Math.min(22, 12 + (H.site.length - 1) * 5);
  else if (F.site.length) score += 5;
  if (H.cue.length && (H.restauro.length || H.restauracao || H.ctxStrong.length || H.site.length || H.tech.length)) score += Math.min(10, H.cue.length * 4);
  if ((H.obra || H.proj) && (H.ctxStrong.length || H.tech.length || H.site.length || H.restauro.length || H.restauracao)) score += 10;
  if (orgCue && score >= 20) score += 6;

  // obra direta em templo (reforma/pintura/cobertura da igreja…): pode não ser restauro, mas é do ramo → "possível"
  const cw = head.match(/\b(?:reforma|revitalizacao|recuperacao|conservacao|pintura|cobertura|telhado|restauracao|restauro|obras?|ampliacao)((?: \w+){0,5}) (?:da|do|de|na|no|nas|nos|das|dos) (?:igrejas?|capelas?|matriz|catedral|basilica|santuario|convento|mosteiro)s?\b/);
  const churchWork = !!cw && !/\b(?:praca|largo|adro|entorno|show|festa|barraca|banheiros?|cozinha|salao|quadra|estacionamento|iluminacao|sonorizacao|calcada|calcadao|construcao|implantacao|muro|nova|novo)\b/.test(cw[1]);
  if (churchWork) {
    score = Math.max(score, 40);
    matched.push("obra em igreja/capela");
  }

  // não é obra/projeto: compra de bens ou assunto vizinho
  const goods = GOODS.test(head) && !SERVICE.test(head);
  if (goods) score -= 40;
  if (OFFTOPIC.test(head) && !H.restauro.length && !H.restauracao) score -= 35;
  score = Math.max(0, Math.min(100, score));

  // portão de precisão: o ASSUNTO PRINCIPAL (começo do objeto) precisa ser restauro/patrimônio
  const gate =
    H.restauro.length > 0 ||
    H.tech.length > 0 ||
    (H.restauracao && hardCtxH) ||
    H.hw.length > 0 ||
    churchWork ||
    (H.ctxStrong.length > 0 && (H.obra || H.proj)) ||
    (H.site.length > 0 && (H.obra || H.proj) && hardCue(H.cue)) ||
    (F.restauro.length > 0 && F.restauro.some((r) => r !== "restauração (de patrimônio)") && !goods && score >= 50);
  const relevant = gate && score >= 50 && !goods;

  const { kind, why } = relevant || (gate && score >= 35) ? classifyKind(t) : { kind: "outro" as EditalKind, why: "fora do escopo" };
  return { relevant, score: gate ? score : Math.min(score, 34), matched, masked, kind, kindWhy: why };
}
