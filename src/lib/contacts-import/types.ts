/** Tipos compartilhados da importação de contatos (navegador e servidor). */

/** Contato "cru", como saiu do arquivo ou do Google, antes de normalizar. */
export type RawContact = {
  /** id estável na origem (resourceName do Google, UID do vCard) */
  externalId?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  phones: { value: string; label?: string }[];
  emails: string[];
  company?: string;
  role?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
  /** o cartão é de uma organização (vCard X-ABShowAs:COMPANY) */
  isOrg?: boolean;
};

/** Contato já normalizado, no formato do CRM. É o que trafega para o servidor. */
export type Candidate = {
  /** posição/identificador estável na lista (usado na seleção) */
  key: string;
  externalId?: string;
  name: string;
  /** o nome veio vazio e foi preenchido com empresa/telefone/e-mail */
  nameGuessed?: boolean;
  phone: string | null;
  phoneKind: "celular" | "fixo" | "internacional" | "invalido" | "nenhum";
  /** outros telefones válidos do mesmo cartão */
  extraPhones: string[];
  /** telefones que não foram reconhecidos */
  badPhones: string[];
  email: string | null;
  extraEmails: string[];
  company: string | null;
  role: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  isOrg?: boolean;
};

export type DupMode = "pular" | "completar" | "mesclar";
export const DUP_MODES: Record<DupMode, { label: string; help: string }> = {
  pular: { label: "Pular", help: "Não mexe em quem já está no CRM." },
  completar: { label: "Completar", help: "Preenche só os campos vazios de quem já está no CRM." },
  mesclar: { label: "Mesclar", help: "Completa os vazios, junta e-mails e telefones extras nas observações e aplica a etiqueta do lote." },
};

export const IMPORT_SOURCES = ["WhatsApp", "Google Contatos", "Importação"] as const;

export type Status = "novo" | "duplicado" | "sem_telefone" | "invalido" | "repetido" | "filtrado";

/** Dados mínimos de um contato já existente no CRM, para detectar duplicados. */
export type Existing = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  externalId: string | null;
  company: string | null;
  role: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  tags: string[];
};
