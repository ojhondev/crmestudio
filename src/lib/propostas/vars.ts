/**
 * Variáveis dos documentos da proposta: dados do edital + dados do estúdio (puro).
 * Entram no mapa de valores dos documentos (lib/docs/variables.ts) — vazio = aparece como pendente no texto.
 */
import { fmtDate, money } from "@/lib/format";
import { reaisPorExtenso } from "@/lib/docs/extenso";
import { KIND_LABEL, type EditalKind } from "@/lib/editais/types";
import type { PropostasConfig } from "./types";

export const PROPOSTA_VARIABLES = [
  { key: "edital.orgao", label: "Órgão licitante", group: "Edital" },
  { key: "edital.unidade", label: "Unidade / secretaria", group: "Edital" },
  { key: "edital.objeto", label: "Objeto da licitação", group: "Edital" },
  { key: "edital.titulo", label: "Título do edital", group: "Edital" },
  { key: "edital.numero", label: "Nº do edital", group: "Edital" },
  { key: "edital.processo", label: "Nº do processo", group: "Edital" },
  { key: "edital.modalidade", label: "Modalidade", group: "Edital" },
  { key: "edital.tipo", label: "Tipo (projeto, obra…)", group: "Edital" },
  { key: "edital.valor_estimado", label: "Valor estimado (R$)", group: "Edital" },
  { key: "edital.valor_estimado_extenso", label: "Valor estimado por extenso", group: "Edital" },
  { key: "edital.data_sessao", label: "Data da sessão / abertura", group: "Edital" },
  { key: "edital.prazo_propostas", label: "Limite para propostas", group: "Edital" },
  { key: "edital.local", label: "Cidade/UF do órgão", group: "Edital" },
  { key: "edital.portal", label: "Portal de envio da proposta", group: "Edital" },
  { key: "estudio.representante", label: "Representante legal", group: "Estúdio" },
  { key: "estudio.representante_cpf", label: "CPF do representante legal", group: "Estúdio" },
  { key: "estudio.representante_cargo", label: "Cargo do representante legal", group: "Estúdio" },
  { key: "estudio.resp_tecnico", label: "Responsável técnico (principal)", group: "Estúdio" },
  { key: "estudio.resp_tecnico_profissao", label: "Profissão do responsável técnico", group: "Estúdio" },
  { key: "estudio.resp_tecnico_registro", label: "Registro do responsável técnico", group: "Estúdio" },
  { key: "estudio.resp_tecnico_cpf", label: "CPF do responsável técnico", group: "Estúdio" },
  { key: "estudio.equipe_tecnica", label: "Equipe técnica (todos)", group: "Estúdio" },
  { key: "proposta.bdi", label: "BDI padrão (%)", group: "Proposta" },
  { key: "proposta.validade", label: "Validade da proposta", group: "Proposta" },
] as const;

export type EditalVarSource = {
  title: string;
  object: string;
  organ: string;
  unit: string | null;
  modalidade: string | null;
  kind: string;
  valueCents: number | null;
  openAt: Date | string | null;
  closeAt: Date | string | null;
  city: string | null;
  uf: string | null;
  sourceUrl: string | null;
};

export type DossieVarSource = { numero: string | null; processo: string | null; sessionAt: Date | string | null };

const DT = "dd/MM/yyyy 'às' HH:mm";
const pct = (n: number) => `${String(n).replace(".", ",")}%`;

/** Mapa de valores de edital.*, proposta.* e extras do estúdio. Sem dados, a chave fica vazia. */
export function propostaValueMap(edital: EditalVarSource | null, dossie: DossieVarSource | null, config: PropostasConfig): Record<string, string> {
  const e = edital;
  const first = config.technical[0];
  const session = dossie?.sessionAt ?? e?.openAt ?? e?.closeAt ?? null;
  return {
    "edital.orgao": e?.organ ?? "",
    "edital.unidade": e?.unit ?? "",
    "edital.objeto": e?.object ?? "",
    "edital.titulo": e?.title ?? "",
    "edital.numero": dossie?.numero ?? "",
    "edital.processo": dossie?.processo ?? "",
    "edital.modalidade": e?.modalidade ?? "",
    "edital.tipo": e ? (KIND_LABEL[e.kind as EditalKind] ?? "") : "",
    "edital.valor_estimado": e?.valueCents ? money(e.valueCents) : "",
    "edital.valor_estimado_extenso": e?.valueCents ? reaisPorExtenso(e.valueCents) : "",
    "edital.data_sessao": session ? fmtDate(session, DT) : "",
    "edital.prazo_propostas": e?.closeAt ? fmtDate(e.closeAt, DT) : "",
    "edital.local": e ? [e.city, e.uf].filter(Boolean).join("/") : "",
    "edital.portal": e?.sourceUrl ?? "",
    "estudio.representante": config.legalRep.name,
    "estudio.representante_cpf": config.legalRep.cpf,
    "estudio.representante_cargo": config.legalRep.role,
    "estudio.resp_tecnico": first?.name ?? "",
    "estudio.resp_tecnico_profissao": first?.profession ?? "",
    "estudio.resp_tecnico_registro": first?.registry ?? "",
    "estudio.resp_tecnico_cpf": first?.cpf ?? "",
    "estudio.equipe_tecnica": config.technical.map((t) => [t.name, t.profession, t.registry].filter(Boolean).join(", ")).join("; "),
    "proposta.bdi": pct(config.bdiPercent),
    "proposta.validade": config.validityDays ? `${config.validityDays} dias` : "",
  };
}
