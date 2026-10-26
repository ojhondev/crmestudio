/**
 * Modelos que acompanham o sistema (a equipe edita depois em /editais/configuracao).
 * `offsetDays` = dias ÚTEIS antes da data limite do edital (D-2 = 2 dias úteis antes). Metas internas, não prazos legais.
 */
import type { MatrixItem, StepKey, TemplateItem } from "./types";

const t = (key: string, step: StepKey, title: string, offsetDays: number | null, role: TemplateItem["role"]): TemplateItem => ({ key, step, title, offsetDays, role });

export type BuiltinChecklist = { key: string; name: string; description: string; items: TemplateItem[] };
export type BuiltinMatrix = { key: string; name: string; description: string; items: MatrixItem[] };

const COMMON_START: TemplateItem[] = [
  t("ler_edital", "analisar", "Ler o edital e todos os anexos (termo de referência, minuta de contrato)", 9, "coordenacao"),
  t("go_nogo", "analisar", "Decidir se vamos participar (valor, prazo, atestados exigidos, risco)", 8, "coordenacao"),
  t("anotar_exigencias", "analisar", "Anotar as exigências de habilitação na matriz do dossiê", 8, "administrativo"),
];

const COMMON_END: TemplateItem[] = [
  t("revisao_cruzada", "revisao", "Revisão interna: outra pessoa confere cada exigência do edital", 2, "coordenacao"),
  t("assinaturas", "revisao", "Assinaturas do representante legal e do responsável técnico", 2, "coordenacao"),
  t("cadastro_portal", "envio", "Conferir login e cadastro no portal de envio (antes do dia)", 3, "administrativo"),
  t("protocolo", "envio", "Enviar / protocolar a proposta e guardar o comprovante", 1, "coordenacao"),
  t("acompanhar_sessao", "resultado", "Acompanhar a sessão e as mensagens do portal", 0, "coordenacao"),
  t("registrar_resultado", "resultado", "Registrar o resultado e o motivo no dossiê", null, "coordenacao"),
];

export const BUILTIN_CHECKLISTS: BuiltinChecklist[] = [
  {
    key: "obra",
    name: "Obra / execução — pregão ou concorrência",
    description: "Contratação de obra de restauro pelo menor preço: foco em habilitação, planilha de preços e cronograma.",
    items: [
      ...COMMON_START,
      t("visita_tecnica", "analisar", "Agendar visita técnica ou emitir declaração de conhecimento do local", 7, "tecnico"),
      t("duvidas", "esclarecimentos", "Listar dúvidas sobre planilha, projeto e prazos", 6, "tecnico"),
      t("pedido_esclarecimento", "esclarecimentos", "Enviar pedido de esclarecimento ao órgão (conferir o prazo legal no edital)", 5, "coordenacao"),
      t("avaliar_impugnacao", "esclarecimentos", "Avaliar se cabe impugnação (exigência restritiva) e, se sim, protocolar", 5, "juridico"),
      t("certidoes", "habilitacao", "Emitir/renovar certidões (federal, FGTS, trabalhista, estadual, municipal)", 3, "administrativo"),
      t("docs_empresa", "habilitacao", "Reunir contrato social, balanço e demais documentos da empresa", 3, "administrativo"),
      t("atestados", "habilitacao", "Selecionar atestados e CATs que comprovam a capacidade técnica", 4, "tecnico"),
      t("declaracoes", "habilitacao", "Gerar e assinar as declarações padrão", 3, "administrativo"),
      t("plano_trabalho", "tecnica", "Plano de trabalho / metodologia, se o edital exigir", 3, "tecnico"),
      t("planilha_precos", "preco", "Montar a planilha de preços (composições e BDI)", 3, "orcamento"),
      t("cronograma", "preco", "Cronograma físico-financeiro", 3, "orcamento"),
      t("carta_proposta", "preco", "Carta-proposta com validade e prazo de execução", 2, "orcamento"),
      ...COMMON_END,
    ],
  },
  {
    key: "projeto",
    name: "Projeto / serviço técnico — técnica e preço",
    description: "Contratação de projeto, laudo ou consultoria avaliada por nota técnica e preço.",
    items: [
      ...COMMON_START,
      t("duvidas", "esclarecimentos", "Listar dúvidas sobre escopo, produtos entregáveis e critérios de pontuação", 6, "tecnico"),
      t("pedido_esclarecimento", "esclarecimentos", "Enviar pedido de esclarecimento ao órgão (conferir o prazo legal no edital)", 5, "coordenacao"),
      t("avaliar_impugnacao", "esclarecimentos", "Avaliar se cabe impugnação e, se sim, protocolar", 5, "juridico"),
      t("certidoes", "habilitacao", "Emitir/renovar certidões (federal, FGTS, trabalhista, estadual, municipal)", 3, "administrativo"),
      t("docs_empresa", "habilitacao", "Reunir contrato social e demais documentos da empresa", 3, "administrativo"),
      t("registros", "habilitacao", "Comprovar registro no CREA/CAU e vínculo da equipe técnica", 3, "tecnico"),
      t("declaracoes", "habilitacao", "Gerar e assinar as declarações padrão", 3, "administrativo"),
      t("atestados", "tecnica", "Selecionar atestados e projetos do portfólio que pontuam", 5, "tecnico"),
      t("metodologia", "tecnica", "Escrever metodologia e plano de trabalho", 4, "tecnico"),
      t("equipe", "tecnica", "Montar equipe-chave com currículos e registros profissionais", 4, "tecnico"),
      t("cronograma_tecnico", "tecnica", "Cronograma de entrega dos produtos", 3, "tecnico"),
      t("planilha_precos", "preco", "Montar a planilha de preços (horas técnicas, deslocamento, BDI)", 3, "orcamento"),
      t("carta_proposta", "preco", "Carta-proposta com validade e prazo de execução", 2, "orcamento"),
      ...COMMON_END,
    ],
  },
  {
    key: "dispensa",
    name: "Dispensa / menor valor",
    description: "Contratação direta de pequeno valor: poucas etapas, proposta enxuta e envio rápido.",
    items: [
      t("ler_edital", "analisar", "Ler o aviso/termo de referência e decidir se vamos participar", 3, "coordenacao"),
      t("pedido_esclarecimento", "esclarecimentos", "Tirar dúvidas com o órgão, se houver", 2, "coordenacao"),
      t("certidoes", "habilitacao", "Conferir certidões e documentos exigidos", 2, "administrativo"),
      t("declaracoes", "habilitacao", "Gerar e assinar as declarações padrão", 2, "administrativo"),
      t("planilha_precos", "preco", "Montar a proposta de preço", 1, "orcamento"),
      t("revisao_cruzada", "revisao", "Revisão interna rápida (valores, validade, assinatura)", 1, "coordenacao"),
      t("protocolo", "envio", "Enviar a proposta e guardar o comprovante", 0, "coordenacao"),
      t("registrar_resultado", "resultado", "Registrar o resultado e o motivo no dossiê", null, "coordenacao"),
    ],
  },
];

const m = (key: string, title: string, cofreType: MatrixItem["cofreType"]): MatrixItem => ({ key, title, cofreType });

const LEGAL: MatrixItem[] = [
  m("contrato_social", "Ato constitutivo / contrato social e alterações", "contrato_social"),
  m("cnpj", "Inscrição no CNPJ", "cnpj"),
  m("cert_federal", "Prova de regularidade federal (Receita/PGFN)", "certidao_federal"),
  m("cert_fgts", "Prova de regularidade com o FGTS", "certidao_fgts"),
  m("cert_trabalhista", "Certidão negativa de débitos trabalhistas (CNDT)", "certidao_trabalhista"),
  m("cert_estadual", "Prova de regularidade estadual", "certidao_estadual"),
  m("cert_municipal", "Prova de regularidade municipal", "certidao_municipal"),
];

export const BUILTIN_MATRICES: BuiltinMatrix[] = [
  {
    key: "obra",
    name: "Habilitação — obra de restauro",
    description: "Exigências mais comuns em obras: jurídica, fiscal, econômica e técnica (equipe e atestados).",
    items: [
      ...LEGAL,
      m("cert_falencia", "Certidão negativa de falência / recuperação judicial", "certidao_falencia"),
      m("balanco", "Balanço patrimonial do último exercício", "balanco"),
      m("registro_conselho", "Registro da empresa e do responsável técnico no CREA/CAU", "registro_conselho"),
      m("atestado_obra", "Atestado de capacidade técnica de obra similar (restauro)", "atestado_tecnico"),
      m("cat", "CAT / acervo técnico do responsável técnico", "cat_art_rrt"),
      m("registro_iphan", "Cadastro ou autorização do órgão de patrimônio (IPHAN/estadual), se exigido", "registro_iphan"),
      m("visita", "Declaração ou atestado de visita técnica", "declaracao"),
      m("decl_menor", "Declaração: não emprega menor (art. 7º, XXXIII, CF)", "declaracao"),
      m("decl_impeditivo", "Declaração de inexistência de fato impeditivo", "declaracao"),
      m("decl_independente", "Declaração de elaboração independente de proposta", "declaracao"),
      m("decl_mepp", "Declaração de ME/EPP, se aplicável", "declaracao"),
      m("garantia", "Garantia da proposta, se exigida", "seguro_garantia"),
    ],
  },
  {
    key: "projeto",
    name: "Habilitação — projeto / serviço técnico",
    description: "Exigências comuns em projetos, laudos e consultorias: habilitação jurídica e fiscal, registro profissional e acervo.",
    items: [
      ...LEGAL,
      m("registro_conselho", "Registro da empresa e dos profissionais no CREA/CAU", "registro_conselho"),
      m("atestado_projeto", "Atestado de capacidade técnica de projeto/laudo similar", "atestado_tecnico"),
      m("cat", "CAT / RRT / ART dos profissionais da equipe-chave", "cat_art_rrt"),
      m("decl_menor", "Declaração: não emprega menor (art. 7º, XXXIII, CF)", "declaracao"),
      m("decl_impeditivo", "Declaração de inexistência de fato impeditivo", "declaracao"),
      m("decl_independente", "Declaração de elaboração independente de proposta", "declaracao"),
      m("decl_equipe", "Declaração de disponibilidade da equipe técnica", "declaracao"),
    ],
  },
  {
    key: "dispensa",
    name: "Habilitação — dispensa / menor valor",
    description: "Lista enxuta para contratações diretas.",
    items: [
      m("cnpj", "Inscrição no CNPJ", "cnpj"),
      m("cert_federal", "Prova de regularidade federal (Receita/PGFN)", "certidao_federal"),
      m("cert_fgts", "Prova de regularidade com o FGTS", "certidao_fgts"),
      m("cert_trabalhista", "Certidão negativa de débitos trabalhistas (CNDT)", "certidao_trabalhista"),
      m("decl_menor", "Declaração: não emprega menor (art. 7º, XXXIII, CF)", "declaracao"),
      m("decl_impeditivo", "Declaração de inexistência de fato impeditivo", "declaracao"),
    ],
  },
];

/** Modelo de checklist sugerido para o tipo do edital (a configuração pode mudar). */
export function suggestTemplateKey(kind: string, modalidade?: string | null, valueCents?: number | null): string {
  const mod = (modalidade ?? "").toLowerCase();
  if (/dispensa|inexigibilidade|cota[cç][aã]o|convite|credenciamento/.test(mod) || (valueCents != null && valueCents > 0 && valueCents < 5_000_000 && kind === "outro")) return "dispensa";
  if (kind === "projeto" || kind === "laudo") return "projeto";
  return "obra";
}
