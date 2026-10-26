/**
 * Recorte do dossiê para o PARCEIRO (puro).
 * Regra: o parceiro nunca recebe valores internos, planilha, negócio, notas da equipe, matriz de habilitação nem o cofre completo.
 * Documentos e planilha só aparecem se a equipe marcou no compartilhamento. Isto roda no servidor, antes de enviar dados à tela.
 */
import type { Bundle } from "@/lib/propostas/server";
import { summarizeMatrix } from "@/lib/propostas/cofre";
import type { Visibility } from "./access";

export type DossieView = Omit<Bundle, "cofre"> & {
  /** documentos do cofre explicitamente compartilhados (equipe: todos) */
  cofre: Bundle["cofre"];
  /** o recorte foi aplicado (parceiro)? a tela esconde o que a equipe usa */
  redacted: boolean;
};

export function redactBundle(b: Bundle, vis: Visibility): DossieView {
  if (vis.staff) return { ...b, redacted: false };
  const shown = new Set(vis.docIds);
  return {
    ...b,
    redacted: true,
    dossie: {
      ...b.dossie,
      priceSheetId: null,
      resultValueCents: null,
      resultNotes: null,
      resultReason: null,
      ownerId: null,
      templateKey: null,
      matrixKey: null,
    },
    edital: { ...b.edital, notes: null, discardReason: null, ownerId: null, ownerName: null, dealId: null, taskId: null },
    requirements: [],
    matrix: [],
    matrixSummary: summarizeMatrix([]),
    cofre: b.cofre.filter((c) => shown.has(c.id)),
    docs: vis.docs ? b.docs : [],
    sheet: vis.sheet ? b.sheet : null,
    deal: null,
  };
}
