/** Opções do Banco de Talentos. Manter igual a restaura-app/src/lib/talentos.ts (o CRM filtra por estes rótulos). */

export const AREAS = [
  "Arquitetura e restauro",
  "Conservação e restauro de bens integrados",
  "Mestre de ofício / canteiro de obras",
  "Pesquisa histórica e prospecção",
  "Projetos complementares (engenharia, luminotécnico, estrutural)",
  "Gestão de obra e planejamento",
  "Administrativo e financeiro",
  "Comunicação, mídia e tecnologia",
  "Outra",
] as const;

export const FORMACOES = [
  "Ensino fundamental ou médio",
  "Curso técnico / formação em ofício",
  "Graduação (em andamento)",
  "Graduação",
  "Especialização / MBA",
  "Mestrado ou doutorado",
] as const;

export const EXPERIENCIAS_ANOS = ["Sem experiência (primeiro emprego)", "Até 2 anos", "2 a 5 anos", "5 a 10 anos", "Mais de 10 anos"] as const;

export const REGIMES = ["CLT", "PJ", "Freelancer / por projeto", "Estágio", "Qualquer regime"] as const;

export const DISPONIBILIDADES = ["Imediata", "Em até 15 dias", "Em até 30 dias", "Em mais de 30 dias"] as const;

export const VIAGEM_ALCANCE = [
  "Apenas no meu estado",
  "Estados vizinhos",
  "Qualquer lugar do Sudeste",
  "Todo o Brasil",
  "Brasil e exterior",
] as const;

export const EQUIPE = [
  "Gosto muito de trabalhar em equipe",
  "Me adapto bem a equipes",
  "Prefiro trabalhar de forma mais independente",
] as const;

export const FAIXAS = [
  "Até R$ 3.000",
  "R$ 3.000 a R$ 5.000",
  "R$ 5.000 a R$ 8.000",
  "R$ 8.000 a R$ 12.000",
  "R$ 12.000 a R$ 18.000",
  "Acima de R$ 18.000",
  "A combinar",
] as const;

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

export type Experiencia = { empresa: string; cargo: string; periodo: string; atividades: string };

/** Currículo: limite pequeno para não pesar na Vercel (corpo de função ≈ 4,5 MB) nem no banco. */
export const CV_MAX_BYTES = 2 * 1024 * 1024;
export const CV_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Etapas do cadastro dentro do CRM (só existe aqui, o site não usa). */
export const TALENT_STATUS = ["Novo", "Em análise", "Entrevista", "No banco", "Contratado", "Descartado"] as const;
export const TALENT_STATUS_TONE: Record<string, string> = {
  Novo: "bg-sky-100 text-sky-800",
  "Em análise": "bg-amber-100 text-amber-800",
  Entrevista: "bg-violet-100 text-violet-800",
  "No banco": "bg-emerald-100 text-emerald-800",
  Contratado: "bg-green-200 text-green-900",
  Descartado: "bg-zinc-200 text-zinc-700",
};
