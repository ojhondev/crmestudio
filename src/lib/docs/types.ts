/** Tipos dos documentos. Sem dependências de servidor: usado no editor, nas páginas públicas e no PDF. */

export type StudioProfile = {
  name: string;
  legalName: string;
  document: string; // CNPJ
  address: string;
  city: string;
  email: string;
  phone: string;
  responsible: string;
  responsibleDocument: string;
  /** cidade/comarca do foro nos contratos */
  forum: string;
};

export const EMPTY_STUDIO: StudioProfile = {
  name: "Estúdio Restaura",
  legalName: "",
  document: "",
  address: "",
  city: "",
  email: "",
  phone: "",
  responsible: "",
  responsibleDocument: "",
  forum: "",
};

export type ContractContent = {
  kind: "contrato";
  html: string;
  /** valores dos campos personalizados `campo.*` usados no texto */
  fields: Record<string, string>;
};

export type SlideLayout = "capa" | "texto" | "lista" | "imagem" | "galeria" | "cronograma" | "investimento" | "condicoes" | "encerramento";

export type SlideItem = { title: string; text?: string; value?: string };

export type Slide = {
  id: string;
  layout: SlideLayout;
  title: string;
  subtitle?: string;
  body?: string;
  items?: SlideItem[];
  images?: string[];
  /** investimento: total em texto livre (aceita variáveis) */
  total?: string;
};

export type DeckContent = {
  kind: "apresentacao";
  slides: Slide[];
};

export type DocContent = ContractContent | DeckContent;

export const LAYOUTS: { key: SlideLayout; label: string; hint: string }[] = [
  { key: "capa", label: "Capa", hint: "Título, subtítulo e imagem de fundo" },
  { key: "texto", label: "Texto", hint: "Título e um texto corrido" },
  { key: "lista", label: "Lista", hint: "Pontos com título e descrição" },
  { key: "imagem", label: "Imagem", hint: "Imagem grande com legenda" },
  { key: "galeria", label: "Galeria", hint: "Até 4 imagens" },
  { key: "cronograma", label: "Cronograma", hint: "Etapas com prazos" },
  { key: "investimento", label: "Investimento", hint: "Itens, valores e total" },
  { key: "condicoes", label: "Condições", hint: "Pagamento, validade e observações" },
  { key: "encerramento", label: "Encerramento", hint: "Contato e próximo passo" },
];

export const EVENT_LABEL: Record<string, string> = {
  criado: "Criado",
  enviado: "Enviado ao cliente",
  visualizado: "Visualizado pelo cliente",
  aceito: "Aceito pelo cliente",
  ajuste_solicitado: "Cliente pediu ajustes",
  reaberto: "Reaberto para edição",
  cancelado: "Cancelado",
  pdf: "PDF baixado",
};
