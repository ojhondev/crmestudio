/**
 * Tipos e rótulos da esteira de proposta (sem dependências de servidor: usado no navegador, no servidor e nos testes).
 */

/* ------------------------------------ etapas ------------------------------------ */

export type StepKey = "analisar" | "esclarecimentos" | "habilitacao" | "tecnica" | "preco" | "revisao" | "envio" | "resultado";

export const STEPS: { key: StepKey; label: string; short: string; hint: string; /** dias úteis antes da data limite (prazo padrão da etapa) */ offset: number | null }[] = [
  { key: "analisar", label: "Analisar o edital", short: "Analisar", hint: "Ler edital e anexos, decidir se vale participar (go / no-go).", offset: 9 },
  { key: "esclarecimentos", label: "Esclarecimentos e impugnação", short: "Esclarecimentos", hint: "Tirar dúvidas e, se preciso, impugnar. Há prazo legal antes da sessão: confira no edital.", offset: 5 },
  { key: "habilitacao", label: "Habilitação", short: "Habilitação", hint: "Reunir certidões, atestados e declarações exigidos (veja a matriz).", offset: 3 },
  { key: "tecnica", label: "Proposta técnica", short: "Técnica", hint: "Metodologia, equipe, cronograma e atestados. Nem todo edital exige.", offset: 3 },
  { key: "preco", label: "Proposta de preço", short: "Preço", hint: "Planilha de preços, BDI e carta-proposta.", offset: 2 },
  { key: "revisao", label: "Revisão interna", short: "Revisão", hint: "Segunda pessoa confere tudo contra o edital, item por item.", offset: 2 },
  { key: "envio", label: "Envio / protocolo", short: "Envio", hint: "Subir no portal ou protocolar. Faça um dia antes, sem sufoco.", offset: 1 },
  { key: "resultado", label: "Resultado", short: "Resultado", hint: "Registrar se ganhou, perdeu ou foi desclassificado, com o motivo.", offset: null },
];
export const STEP_KEYS = STEPS.map((s) => s.key);
export const STEP_BY_KEY = Object.fromEntries(STEPS.map((s) => [s.key, s])) as Record<StepKey, (typeof STEPS)[number]>;
export const isStepKey = (v: unknown): v is StepKey => typeof v === "string" && v in STEP_BY_KEY;

export type StepStatus = "a_fazer" | "em_andamento" | "concluida" | "nao_se_aplica";
export const STEP_STATUS_LABEL: Record<StepStatus, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", concluida: "Concluída", nao_se_aplica: "Não se aplica" };
export const STEP_STATUSES = Object.keys(STEP_STATUS_LABEL) as StepStatus[];
export const isStepStatus = (v: unknown): v is StepStatus => typeof v === "string" && v in STEP_STATUS_LABEL;

/* ----------------------------------- dossiê ----------------------------------- */

export type DossieStatus = "andamento" | "ganhou" | "perdeu" | "desclassificada" | "desistiu";
export const DOSSIE_STATUS_LABEL: Record<DossieStatus, string> = { andamento: "Em andamento", ganhou: "Ganhou", perdeu: "Perdeu", desclassificada: "Desclassificada", desistiu: "Desistimos" };
export const isDossieStatus = (v: unknown): v is DossieStatus => typeof v === "string" && v in DOSSIE_STATUS_LABEL;
/** resultados que exigem motivo (aprendizado) */
export const LOSS_STATUSES: DossieStatus[] = ["perdeu", "desclassificada", "desistiu"];

export const DEFAULT_LOSS_REASONS = [
  "Preço acima do vencedor",
  "Desclassificada por documentação",
  "Faltou atestado de capacidade técnica",
  "Nota técnica inferior",
  "Perdemos o prazo",
  "Recurso negado",
  "Desistimos (risco alto)",
  "Desistimos (margem baixa)",
  "Outro",
];

/* ------------------------------------ papéis ------------------------------------ */

export type RoleKey = "coordenacao" | "tecnico" | "orcamento" | "administrativo" | "juridico";
export const ROLES: { key: RoleKey; label: string; hint: string }[] = [
  { key: "coordenacao", label: "Coordenação", hint: "Decide, revisa e protocola." },
  { key: "tecnico", label: "Responsável técnico", hint: "Metodologia, atestados e proposta técnica." },
  { key: "orcamento", label: "Orçamento", hint: "Planilha de preços, BDI e cronograma." },
  { key: "administrativo", label: "Administrativo", hint: "Certidões, declarações e documentos de habilitação." },
  { key: "juridico", label: "Jurídico", hint: "Impugnação, recursos e minutas." },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label])) as Record<string, string>;
export const isRoleKey = (v: unknown): v is RoleKey => typeof v === "string" && v in ROLE_LABEL;

/* ------------------------------ modelos de checklist ------------------------------ */

export type TemplateItem = { key: string; step: StepKey; title: string; offsetDays: number | null; role: RoleKey | null };
export type MatrixItem = { key: string; title: string; cofreType: CofreType | null };

/* ------------------------------------ cofre ------------------------------------ */

export const COFRE_TYPES = [
  { key: "certidao_federal", label: "Certidão negativa federal (Receita/PGFN)", group: "Certidões" },
  { key: "certidao_fgts", label: "Certificado de regularidade do FGTS (CRF)", group: "Certidões" },
  { key: "certidao_trabalhista", label: "Certidão negativa de débitos trabalhistas (CNDT)", group: "Certidões" },
  { key: "certidao_estadual", label: "Certidão negativa estadual", group: "Certidões" },
  { key: "certidao_municipal", label: "Certidão negativa municipal", group: "Certidões" },
  { key: "certidao_falencia", label: "Certidão de falência e recuperação judicial", group: "Certidões" },
  { key: "contrato_social", label: "Contrato social e alterações", group: "Empresa" },
  { key: "cnpj", label: "Cartão CNPJ", group: "Empresa" },
  { key: "balanco", label: "Balanço patrimonial", group: "Empresa" },
  { key: "seguro_garantia", label: "Seguro-garantia / garantia da proposta", group: "Empresa" },
  { key: "atestado_tecnico", label: "Atestado de capacidade técnica", group: "Técnico" },
  { key: "cat_art_rrt", label: "CAT / ART / RRT", group: "Técnico" },
  { key: "registro_conselho", label: "Registro no CREA / CAU", group: "Técnico" },
  { key: "registro_iphan", label: "Cadastro / credenciamento IPHAN ou órgão de patrimônio", group: "Técnico" },
  { key: "declaracao", label: "Declaração padrão assinada", group: "Declarações" },
  { key: "outro", label: "Outro documento", group: "Outros" },
] as const;
export type CofreType = (typeof COFRE_TYPES)[number]["key"];
export const COFRE_LABEL = Object.fromEntries(COFRE_TYPES.map((t) => [t.key, t.label])) as Record<string, string>;
export const COFRE_SHORT: Record<string, string> = {
  certidao_federal: "Certidão federal",
  certidao_fgts: "FGTS",
  certidao_trabalhista: "CNDT",
  certidao_estadual: "Certidão estadual",
  certidao_municipal: "Certidão municipal",
  certidao_falencia: "Falência/RJ",
  contrato_social: "Contrato social",
  cnpj: "Cartão CNPJ",
  balanco: "Balanço",
  seguro_garantia: "Garantia",
  atestado_tecnico: "Atestado técnico",
  cat_art_rrt: "CAT/ART/RRT",
  registro_conselho: "CREA/CAU",
  registro_iphan: "IPHAN",
  declaracao: "Declaração",
  outro: "Outro",
};
export const isCofreType = (v: unknown): v is CofreType => typeof v === "string" && v in COFRE_LABEL;

/** dias de antecedência dos avisos de vencimento */
export const COFRE_ALERT_DAYS = [30, 15, 7];

/* ----------------------------------- portfólio ----------------------------------- */

export const PORTFOLIO_KINDS = [
  { key: "execucao", label: "Execução (obra)" },
  { key: "projeto", label: "Projeto" },
  { key: "laudo", label: "Laudo / consultoria" },
  { key: "outro", label: "Outro" },
] as const;
export const PORTFOLIO_KIND_LABEL = Object.fromEntries(PORTFOLIO_KINDS.map((k) => [k.key, k.label])) as Record<string, string>;

export const TOMBAMENTO = [
  { key: "nenhum", label: "Sem tombamento" },
  { key: "iphan", label: "Tombado pelo IPHAN" },
  { key: "estadual", label: "Tombado (estadual)" },
  { key: "municipal", label: "Tombado (municipal)" },
] as const;
export const TOMBAMENTO_LABEL = Object.fromEntries(TOMBAMENTO.map((k) => [k.key, k.label])) as Record<string, string>;

/** técnicas e bens sugeridos como etiquetas (a equipe pode criar outras) */
export const SUGGESTED_TAGS = ["restauração de forro", "pintura mural", "douramento", "consolidação estrutural", "pintura artística", "retábulo", "talha", "azulejaria", "vitrais", "cobertura", "fachada", "esquadrias", "pisos", "prospecção", "projeto executivo", "laudo", "imagem sacra", "igreja", "casarão"];

/* ------------------------------- configuração do estúdio ------------------------------- */

export type TechResponsible = { id: string; name: string; profession: string; registry: string; cpf: string };
export type PropostasConfig = {
  legalRep: { name: string; cpf: string; role: string };
  technical: TechResponsible[];
  /** BDI padrão (%) e encargos sociais sobre mão de obra (%) */
  bdiPercent: number;
  encargosPercent: number;
  validityDays: number;
  /** responsável padrão por papel (id de usuário) */
  roles: Partial<Record<RoleKey, string>>;
  lossReasons: string[];
  /** etapa do funil (nome) a que cada marco mapeia; vazio = procura “Proposta enviada” */
  stageSent: string;
  /** modelo de checklist padrão por tipo de edital */
  defaultTemplate: { execucao: string; projeto: string; outro: string };
};

export const DEFAULT_CONFIG: PropostasConfig = {
  legalRep: { name: "", cpf: "", role: "Sócio administrador" },
  technical: [],
  bdiPercent: 25,
  encargosPercent: 0,
  validityDays: 60,
  roles: {},
  lossReasons: DEFAULT_LOSS_REASONS,
  stageSent: "Proposta enviada",
  defaultTemplate: { execucao: "obra", projeto: "projeto", outro: "dispensa" },
};
