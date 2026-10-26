/**
 * Tipos e rótulos do módulo Editais (sem dependências de servidor: usado no navegador, no servidor e no script do GitHub Actions).
 */

export type EditalKind = "projeto" | "execucao" | "projeto_execucao" | "laudo" | "outro";
export const KIND_LABEL: Record<EditalKind, string> = {
  projeto: "Projeto de restauro",
  execucao: "Execução (obra)",
  projeto_execucao: "Projeto + execução",
  laudo: "Laudo / consultoria",
  outro: "Outro",
};
export const KIND_SHORT: Record<EditalKind, string> = { projeto: "Projeto", execucao: "Execução", projeto_execucao: "Projeto + obra", laudo: "Laudo", outro: "Outro" };
export const KINDS = Object.keys(KIND_LABEL) as EditalKind[];
export const isKind = (v: unknown): v is EditalKind => typeof v === "string" && v in KIND_LABEL;

export type Esfera = "federal" | "estadual" | "municipal" | "distrital";
export const ESFERA_LABEL: Record<Esfera, string> = { federal: "Federal", estadual: "Estadual", municipal: "Municipal", distrital: "Distrital" };
export const ESFERAS = Object.keys(ESFERA_LABEL) as Esfera[];

/** situação do edital no portal */
export type EditalSituation = "aberto" | "encerrado" | "suspenso" | "cancelado";
export const SITUATION_LABEL: Record<EditalSituation, string> = { aberto: "Aberto", encerrado: "Encerrado", suspenso: "Suspenso", cancelado: "Cancelado" };
export const SITUATIONS = Object.keys(SITUATION_LABEL) as EditalSituation[];

/** triagem feita pela equipe no CRM */
export type EditalTriage = "novo" | "interessante" | "em_analise" | "em_proposta" | "proposta_enviada" | "descartado" | "ganho" | "perdido";
export const TRIAGE_LABEL: Record<EditalTriage, string> = {
  novo: "Novo",
  interessante: "Interessante",
  em_analise: "Em análise",
  em_proposta: "Em proposta",
  proposta_enviada: "Proposta enviada",
  descartado: "Descartado",
  ganho: "Ganho",
  perdido: "Perdido",
};
export const TRIAGES = Object.keys(TRIAGE_LABEL) as EditalTriage[];
export const isTriage = (v: unknown): v is EditalTriage => typeof v === "string" && v in TRIAGE_LABEL;
/** triagens "em andamento": o prazo importa e o lembrete vale */
export const ACTIVE_TRIAGES: EditalTriage[] = ["interessante", "em_analise", "em_proposta"];

export const DISCARD_REASONS = [
  "Fora do escopo (não é restauro)",
  "Valor abaixo do mínimo",
  "Longe demais / fora da região",
  "Exige acervo técnico que não temos",
  "Prazo curto demais",
  "Já vencido ou suspenso",
  "Duplicado",
  "Outro",
];

export type RunStatus = "solicitada" | "executando" | "concluida" | "parcial" | "falhou";
export const RUN_STATUS_LABEL: Record<RunStatus, string> = { solicitada: "Solicitada", executando: "Executando", concluida: "Concluída", parcial: "Parcial", falhou: "Falhou" };

/** O que o coletor entrega (e o que o endpoint de ingestão aceita). Datas em ISO 8601 com fuso. */
export type EditalInput = {
  externalId: string;
  source: string;
  object: string;
  organ: string;
  organCnpj: string | null;
  unit: string | null;
  esfera: Esfera | null;
  uf: string | null;
  city: string | null;
  ibge: string | null;
  modalidade: string | null;
  modalidadeId: number | null;
  situation: EditalSituation;
  valueCents: number | null;
  publishedAt: string | null;
  openAt: string | null;
  closeAt: string | null;
  /** página do edital no PNCP */
  url: string | null;
  /** portal de origem (onde se envia a proposta) */
  sourceUrl: string | null;
};

export type Cursor = { phase: string; step?: number; page?: number; extra?: Record<string, unknown> };

export type RunStats = {
  scanned?: number;
  candidates?: number;
  relevant?: number;
  created?: number;
  updated?: number;
  errors?: number;
  sources?: Record<string, number>;
};

export const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

/** relevância (score 0–100) → rótulo */
export const SCORE_HIGH = 70;
export const SCORE_MIN_DEFAULT = 50;
export const SCORE_STORE_MIN = 35;
export const scoreLabel = (s: number) => (s >= SCORE_HIGH ? "Alta" : s >= SCORE_MIN_DEFAULT ? "Boa" : "Possível");
