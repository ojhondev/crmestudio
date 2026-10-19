/**
 * Proteção contra "bomba de zip": confere o tamanho descompactado declarado antes de abrir .xlsx/.ods.
 */
import JSZip from "jszip";

export const MAX_UNZIPPED_BYTES = 250 * 1024 * 1024;

export async function assertZipSafe(buf: Uint8Array): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error("Não consegui abrir o arquivo. Ele pode estar corrompido ou protegido por senha.");
  }
  let total = 0;
  let files = 0;
  zip.forEach((_path, entry) => {
    files++;
    total += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  });
  if (files > 5000 || total > MAX_UNZIPPED_BYTES) throw new Error("O arquivo é grande demais depois de descompactado (limite de segurança).");
}
