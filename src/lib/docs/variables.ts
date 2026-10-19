import { money, fmtPhone } from "@/lib/format";
import { reaisPorExtenso } from "./extenso";
import type { StudioProfile } from "./types";

/** Variáveis que o redator insere no texto: {{cliente.nome}}. Tudo é resolvido na hora de visualizar, gerar o PDF e enviar. */
export const VARIABLES = [
  { key: "cliente.nome", label: "Nome do cliente", group: "Cliente" },
  { key: "cliente.documento", label: "CPF/CNPJ do cliente", group: "Cliente" },
  { key: "cliente.empresa", label: "Paróquia / empresa", group: "Cliente" },
  { key: "cliente.endereco", label: "Endereço do cliente", group: "Cliente" },
  { key: "cliente.cidade", label: "Cidade do cliente", group: "Cliente" },
  { key: "cliente.email", label: "E-mail do cliente", group: "Cliente" },
  { key: "cliente.telefone", label: "Telefone do cliente", group: "Cliente" },
  { key: "negocio.titulo", label: "Título do negócio", group: "Negócio" },
  { key: "negocio.servico", label: "Serviço", group: "Negócio" },
  { key: "negocio.imovel", label: "Bem / imóvel", group: "Negócio" },
  { key: "negocio.local", label: "Local da obra", group: "Negócio" },
  { key: "negocio.valor", label: "Valor (R$ 1.500,00)", group: "Negócio" },
  { key: "negocio.valor_extenso", label: "Valor por extenso", group: "Negócio" },
  { key: "estudio.nome", label: "Nome do estúdio", group: "Estúdio" },
  { key: "estudio.razao_social", label: "Razão social", group: "Estúdio" },
  { key: "estudio.documento", label: "CNPJ do estúdio", group: "Estúdio" },
  { key: "estudio.endereco", label: "Endereço do estúdio", group: "Estúdio" },
  { key: "estudio.cidade", label: "Cidade do estúdio", group: "Estúdio" },
  { key: "estudio.email", label: "E-mail do estúdio", group: "Estúdio" },
  { key: "estudio.telefone", label: "Telefone do estúdio", group: "Estúdio" },
  { key: "estudio.responsavel", label: "Responsável técnico", group: "Estúdio" },
  { key: "estudio.responsavel_documento", label: "CPF do responsável", group: "Estúdio" },
  { key: "estudio.foro", label: "Foro (comarca)", group: "Estúdio" },
  { key: "documento.numero", label: "Número do documento", group: "Documento" },
  { key: "documento.titulo", label: "Título do documento", group: "Documento" },
  { key: "data.hoje", label: "Data de hoje (por extenso)", group: "Documento" },
] as const;

export type VarKey = (typeof VARIABLES)[number]["key"];
export const VAR_GROUPS = ["Cliente", "Negócio", "Estúdio", "Documento"] as const;

export type VarContext = {
  studio: StudioProfile;
  contact?: { name: string; document?: string | null; company?: string | null; address?: string | null; city?: string | null; state?: string | null; email?: string | null; phone?: string | null } | null;
  deal?: { title: string; service?: string | null; property?: string | null; location?: string | null; valueCents: number } | null;
  doc: { number?: string | null; title: string };
  /** campos personalizados: campo.nome → valor */
  fields?: Record<string, string>;
  /** data de referência (ISO yyyy-MM-dd, fuso do estúdio) */
  today: string;
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function dataPorExtenso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Mapa chave → valor. Vazio quando a informação não existe (a chave aparece como pendente). */
export function valueMap(c: VarContext): Record<string, string> {
  const s = c.studio;
  const ct = c.contact;
  const d = c.deal;
  const cityState = ct ? [ct.city, ct.state].filter(Boolean).join("/") : "";
  const map: Record<string, string> = {
    "cliente.nome": ct?.name ?? "",
    "cliente.documento": ct?.document ?? "",
    "cliente.empresa": ct?.company ?? "",
    "cliente.endereco": ct?.address ?? "",
    "cliente.cidade": cityState,
    "cliente.email": ct?.email ?? "",
    "cliente.telefone": ct?.phone ? fmtPhone(ct.phone) : "",
    "negocio.titulo": d?.title ?? "",
    "negocio.servico": d?.service ?? "",
    "negocio.imovel": d?.property ?? "",
    "negocio.local": d?.location ?? "",
    "negocio.valor": d && d.valueCents > 0 ? money(d.valueCents) : "",
    "negocio.valor_extenso": d && d.valueCents > 0 ? reaisPorExtenso(d.valueCents) : "",
    "estudio.nome": s.name,
    "estudio.razao_social": s.legalName,
    "estudio.documento": s.document,
    "estudio.endereco": s.address,
    "estudio.cidade": s.city,
    "estudio.email": s.email,
    "estudio.telefone": s.phone,
    "estudio.responsavel": s.responsible,
    "estudio.responsavel_documento": s.responsibleDocument,
    "estudio.foro": s.forum,
    "documento.numero": c.doc.number ?? "",
    "documento.titulo": c.doc.title,
    "data.hoje": dataPorExtenso(c.today),
  };
  for (const [k, v] of Object.entries(c.fields ?? {})) map[`campo.${k}`] = v;
  return map;
}

const VAR_RE = /\{\{\s*([a-z_]+(?:\.[a-z0-9_]+)+)\s*\}\}/g;

export function findVars(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) out.add(m[1]);
  return [...out];
}

/** Campos `campo.*` presentes no texto. */
export const findFieldNames = (text: string) => findVars(text).filter((k) => k.startsWith("campo.")).map((k) => k.slice(6));

/** Chaves usadas que não têm valor (cliente sem CPF, estúdio sem endereço…). */
export function missingVars(text: string, map: Record<string, string>) {
  return findVars(text).filter((k) => !(map[k] ?? "").trim());
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Troca {{chave}} pelo valor. Em HTML (`html: true`) o valor é escapado e variáveis sem valor
 * viram um marcador destacado visível na prévia — nunca somem em silêncio.
 */
export function resolveText(text: string, map: Record<string, string>, opts: { html?: boolean } = {}) {
  return text.replace(VAR_RE, (_, key: string) => {
    const v = (map[key] ?? "").trim();
    if (v) return opts.html ? escapeHtml(v) : v;
    const label = `[${key}]`;
    return opts.html ? `<mark class="doc-missing">${escapeHtml(label)}</mark>` : label;
  });
}
