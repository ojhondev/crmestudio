/**
 * Módulos "Em desenvolvimento": continuam no menu (apagados, com etiqueta) mas sem acesso pela navegação.
 * Para liberar um módulo, troque `true` por `false` (ou remova a linha).
 * Observação: as telas de detalhe de /documentos/[id] seguem abertas porque os Editais abrem documentos por elas.
 */
export const IN_DEVELOPMENT: Record<string, boolean> = {
  drive: true,
  documentos: true,
};
