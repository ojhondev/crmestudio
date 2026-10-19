/** Detecção do tipo de item do Google Drive a partir da URL (sem dependências de servidor). */
import type { DriveKind } from "@/lib/db/schema";

export const KIND_LABEL: Record<DriveKind, string> = {
  pasta: "Pasta",
  documento: "Documento",
  planilha: "Planilha",
  apresentacao: "Apresentação",
  pdf: "PDF",
  imagem: "Imagem",
  video: "Vídeo",
  formulario: "Formulário",
  outro: "Arquivo",
};
export const KINDS = Object.keys(KIND_LABEL) as DriveKind[];

export type Detected = { ok: true; kind: DriveKind; externalId: string | null; url: string } | { ok: false; error: string };

const ID = "([A-Za-z0-9_-]{10,})";

/** Aceita links do Google Drive/Docs (e também qualquer link https, tratado como "arquivo"). */
export function detectDriveUrl(raw: string): Detected {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Cole um link completo (começando com https://)." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "O link precisa começar com https://." };
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  const url = u.toString();
  const m = (re: RegExp) => path.match(re)?.[1] ?? null;

  if (host === "docs.google.com") {
    if (path.includes("/document/")) return { ok: true, kind: "documento", externalId: m(new RegExp(`/d/${ID}`)), url };
    if (path.includes("/spreadsheets/")) return { ok: true, kind: "planilha", externalId: m(new RegExp(`/d/${ID}`)), url };
    if (path.includes("/presentation/")) return { ok: true, kind: "apresentacao", externalId: m(new RegExp(`/d/${ID}`)), url };
    if (path.includes("/forms/")) return { ok: true, kind: "formulario", externalId: m(new RegExp(`/d/${ID}`)), url };
    return { ok: true, kind: "documento", externalId: m(new RegExp(`/d/${ID}`)), url };
  }
  if (host === "drive.google.com") {
    const folder = m(new RegExp(`/folders/${ID}`));
    if (folder) return { ok: true, kind: "pasta", externalId: folder, url };
    const file = m(new RegExp(`/file/d/${ID}`)) ?? u.searchParams.get("id");
    if (file) return { ok: true, kind: "outro", externalId: file, url };
    return { ok: true, kind: path.includes("folder") ? "pasta" : "outro", externalId: null, url };
  }
  if (host === "docs.google.com" || host.endsWith("google.com")) return { ok: true, kind: "outro", externalId: null, url };

  // fora do Google: guarda mesmo assim, tipo pela extensão
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const kind: DriveKind = ext === "pdf" ? "pdf" : /^(jpe?g|png|webp|gif|heic)$/.test(ext) ? "imagem" : /^(mp4|mov|webm|m4v)$/.test(ext) ? "video" : /^(xlsx?|csv)$/.test(ext) ? "planilha" : /^(docx?|odt)$/.test(ext) ? "documento" : /^(pptx?)$/.test(ext) ? "apresentacao" : "outro";
  return { ok: true, kind, externalId: null, url };
}

/** Tipo a partir do mimeType do Google Drive. */
export function kindFromMime(mime: string): DriveKind {
  if (mime === "application/vnd.google-apps.folder") return "pasta";
  if (mime === "application/vnd.google-apps.document" || mime.includes("wordprocessingml") || mime === "application/msword") return "documento";
  if (mime === "application/vnd.google-apps.spreadsheet" || mime.includes("spreadsheetml") || mime === "text/csv") return "planilha";
  if (mime === "application/vnd.google-apps.presentation" || mime.includes("presentationml")) return "apresentacao";
  if (mime === "application/vnd.google-apps.form") return "formulario";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  return "outro";
}
