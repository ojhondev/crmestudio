export const SERVICES = [
  "Restauro",
  "Conservação preventiva",
  "Projeto de arquitetura",
  "Diagnóstico / laudo técnico",
  "Restauro de obra de arte",
  "Consultoria / aprovação em órgão de patrimônio",
  "Acompanhamento de obra",
  "Outro",
];

export const PROPERTIES = [
  "Igreja / capela",
  "Casarão",
  "Bem tombado",
  "Pintura / tela",
  "Pintura mural / forro",
  "Retábulo / talha",
  "Imaginária",
  "Edifício institucional",
  "Outro",
];

export const SOURCES = ["Site", "WhatsApp", "Indicação", "Instagram", "Parceiro", "Evento", "Licitação", "Outro"];

export const ACTIVITY_TYPES: Record<string, string> = {
  nota: "Nota",
  ligacao: "Ligação",
  email: "E-mail",
  reuniao: "Reunião",
  visita: "Visita técnica",
  etapa: "Etapa",
  whatsapp: "WhatsApp",
};

export const EVENT_TYPES: Record<string, { label: string; color: string }> = {
  reuniao: { label: "Reunião", color: "#537179" },
  visita: { label: "Visita técnica", color: "#b75928" },
  obra: { label: "Obra / execução", color: "#193f32" },
  prazo: { label: "Prazo / entrega", color: "#c0392b" },
  outro: { label: "Outro", color: "#776157" },
};

export const INCOME_CATEGORIES = ["Projeto", "Restauro", "Laudo / diagnóstico", "Consultoria", "Sinal / entrada", "Outro"];
export const EXPENSE_CATEGORIES = [
  "Materiais",
  "Mão de obra / terceiros",
  "Comissão de parceiro",
  "Deslocamento",
  "Impostos",
  "Software / ferramentas",
  "Aluguel / escritório",
  "Pró-labore",
  "Outro",
];
