import type { DriveKind } from "@/lib/db/schema";

/** Item devolvido por qualquer provedor (links do CRM ou API do Google). */
export type DriveEntry = {
  id: string;
  name: string;
  kind: DriveKind;
  isFolder: boolean;
  url: string | null;
  mimeType?: string;
  modifiedAt?: string | null;
  size?: number | null;
  parentId?: string | null;
};

export type UploadInput = { name: string; mimeType: string; data: Uint8Array; folderId?: string | null };

/**
 * Camada de provedores do Drive. O CRM conversa só com esta interface:
 *  - `links`: funciona hoje, sem credenciais (time registra links; pastas virtuais do CRM);
 *  - `google`: API real do Google Drive v3 (precisa de credenciais OAuth e conexão).
 */
export interface DriveProvider {
  readonly id: "links" | "google";
  readonly label: string;
  /** pronto para uso agora? (links: sempre; google: credenciais + conta conectada) */
  isReady(): Promise<boolean>;
  listFolder(folderId?: string | null): Promise<DriveEntry[]>;
  search(query: string): Promise<DriveEntry[]>;
  getMeta(id: string): Promise<DriveEntry | null>;
  openUrl(id: string): Promise<string | null>;
  upload(input: UploadInput): Promise<DriveEntry>;
  createFolder(name: string, parentId?: string | null): Promise<DriveEntry>;
}

export class DriveUnavailable extends Error {}
