/** Aceita só links http(s). O CRM guarda o LINK do arquivo (Drive, site do órgão…), nunca o arquivo. */
export function cleanLink(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 600) : "";
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
