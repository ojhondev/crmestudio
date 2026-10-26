/**
 * Regras de acesso do app Editais (PURO: sem banco e sem Next — roda nos testes e no navegador).
 *
 * Duas espécies de pessoa:
 *  - equipe (staff): as permissões do módulo "editais" do CRM valem (ver / editar / gerenciar);
 *  - parceiro: conta externa; só enxerga o que a equipe COMPARTILHOU (ou o Radar completo, se liberado).
 *
 * A regra de verdade roda no servidor (lib/editais-app/authz.ts usa estas funções). Esconder na tela não basta.
 */
import { atLeast, type Level } from "@/lib/permissions";

export type PartnerRole = "ver" | "contribuir";
export type ShareScope = "edital" | "proposta";

export const ROLE_LABEL: Record<PartnerRole, string> = { ver: "Só ver", contribuir: "Pode contribuir" };
export const ROLE_HELP: Record<PartnerRole, string> = {
  ver: "Lê o edital e a conversa.",
  contribuir: "Comenta, anexa links, envia documentos para revisão e faz o que for atribuído a ele.",
};
export const SCOPE_LABEL: Record<ShareScope, string> = { edital: "Só o edital", proposta: "Edital e proposta" };

export const isRole = (v: unknown): v is PartnerRole => v === "ver" || v === "contribuir";
export const isScope = (v: unknown): v is ShareScope => v === "edital" || v === "proposta";

export type EditaisActor =
  | { kind: "staff"; id: string; name: string; level: Level }
  | { kind: "partner"; id: string; name: string; radarCompleto: boolean };

export type ShareLite = { role: PartnerRole; scope: ShareScope; showDocs: boolean; showSheet: boolean; docIds: string[] };

/** O que o ator pode fazer num edital específico. */
export type Visibility = {
  /** vê o edital (Radar / detalhe) */
  edital: boolean;
  /** vê a proposta (dossiê: etapas, checklist, conversa) */
  proposta: boolean;
  /** pode agir: comentar, anexar links, concluir o que lhe foi atribuído */
  contribute: boolean;
  /** vê documentos gerados (propostas, declarações) */
  docs: boolean;
  /** vê a planilha de preços e os valores internos da proposta */
  sheet: boolean;
  /** só a equipe: triagem, compartilhar, mexer na esteira, ver o cofre completo */
  staff: boolean;
  /** documentos do cofre liberados para este parceiro neste edital */
  docIds: string[];
};

export const NO_ACCESS: Visibility = { edital: false, proposta: false, contribute: false, docs: false, sheet: false, staff: false, docIds: [] };

/** Equipe só entra no app com pelo menos "ver" no módulo editais. */
export const staffMayEnter = (level: Level) => atLeast(level, "view");

/** Visibilidade de um ator num edital, dado o compartilhamento (se houver). */
export function visibility(actor: EditaisActor, share: ShareLite | null): Visibility {
  if (actor.kind === "staff") {
    if (!staffMayEnter(actor.level)) return NO_ACCESS;
    return { edital: true, proposta: true, contribute: atLeast(actor.level, "edit"), docs: true, sheet: true, staff: true, docIds: [] };
  }
  if (!share) {
    // sem compartilhamento: só o Radar completo (leitura do edital, sem proposta)
    return actor.radarCompleto ? { ...NO_ACCESS, edital: true } : NO_ACCESS;
  }
  const proposta = share.scope === "proposta";
  return {
    edital: true,
    proposta,
    contribute: share.role === "contribuir",
    docs: proposta && share.showDocs,
    sheet: proposta && share.showSheet,
    staff: false,
    docIds: share.docIds ?? [],
  };
}

export const canSeeEditalPure = (actor: EditaisActor, share: ShareLite | null) => visibility(actor, share).edital;
export const canSeePropostaPure = (actor: EditaisActor, share: ShareLite | null) => visibility(actor, share).proposta;
export const canContributePure = (actor: EditaisActor, share: ShareLite | null) => {
  const v = visibility(actor, share);
  return v.contribute && (actor.kind === "staff" || v.edital);
};

/** Só a equipe com "editar" mexe em triagem, esteira, compartilhamento. */
export const staffCan = (actor: EditaisActor, need: Level) => actor.kind === "staff" && atLeast(actor.level, need);

/** O parceiro pode concluir este item/etapa? Só se estiver atribuído a ele e o compartilhamento permitir contribuir. */
export function partnerMayWorkOn(actor: EditaisActor, share: ShareLite | null, assigneeId: string | null): boolean {
  if (actor.kind !== "partner") return false;
  const v = visibility(actor, share);
  return v.proposta && v.contribute && !!assigneeId && assigneeId === actor.id;
}

/** Etapas que o parceiro nunca conclui sozinho (decisão e protocolo são da equipe). */
export const STAFF_ONLY_STEPS = ["envio", "resultado"] as const;

/* ------------------------------------ abas do Radar ------------------------------------ */

export type RadarTab = "novos" | "interessantes" | "proposta" | "descartados" | "todos";

export const RADAR_TABS: { key: RadarTab; label: string; triages: string[] | null }[] = [
  { key: "novos", label: "Novos", triages: ["novo"] },
  { key: "interessantes", label: "Interessantes", triages: ["interessante", "em_analise"] },
  { key: "proposta", label: "Em proposta", triages: ["em_proposta", "proposta_enviada"] },
  { key: "descartados", label: "Descartados", triages: ["descartado"] },
  { key: "todos", label: "Todos", triages: null },
];

export const isRadarTab = (v: unknown): v is RadarTab => RADAR_TABS.some((t) => t.key === v);

export function tabOfTriage(triage: string): RadarTab | null {
  return RADAR_TABS.find((t) => t.triages?.includes(triage))?.key ?? null;
}

/** Contagem por aba a partir da contagem por triagem. "Todos" soma tudo (inclusive ganho/perdido). */
export function tabCounts(byTriage: Record<string, number>): Record<RadarTab, number> {
  const out = { novos: 0, interessantes: 0, proposta: 0, descartados: 0, todos: 0 } as Record<RadarTab, number>;
  for (const [t, n] of Object.entries(byTriage)) {
    out.todos += n;
    const tab = tabOfTriage(t);
    if (tab) out[tab] += n;
  }
  return out;
}

/* ------------------------------------ propostas (quadro) ------------------------------------ */

export type BoardColumn = "analisando" | "preparando" | "enviada" | "resultado";

export const BOARD_COLUMNS: { key: BoardColumn; label: string; hint: string }[] = [
  { key: "analisando", label: "Analisando", hint: "Lendo o edital e decidindo" },
  { key: "preparando", label: "Preparando", hint: "Habilitação, técnica e preço" },
  { key: "enviada", label: "Enviada", hint: "Aguardando o resultado" },
  { key: "resultado", label: "Resultado", hint: "Ganhou, perdeu ou desistiu" },
];

/** Coluna do quadro a partir da situação do dossiê e do avanço das etapas. */
export function boardColumn(d: { status: string; steps: { key: string; status: string }[] }): BoardColumn {
  if (d.status !== "andamento") return "resultado";
  const done = (k: string) => d.steps.some((s) => s.key === k && (s.status === "concluida" || s.status === "nao_se_aplica"));
  if (done("envio")) return "enviada";
  const prep = ["habilitacao", "tecnica", "preco", "revisao"];
  const started = prep.some((k) => d.steps.some((s) => s.key === k && s.status !== "a_fazer"));
  if (done("analisar") || started) return "preparando";
  return "analisando";
}
