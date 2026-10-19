import "server-only";
import crypto from "node:crypto";

/** Chave de 32 bytes derivada de DRIVE_TOKEN_KEY (ou, na falta, do AUTH_SECRET). */
function key() {
  const secret = process.env.DRIVE_TOKEN_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Defina DRIVE_TOKEN_KEY (ou AUTH_SECRET) para criptografar os tokens do Drive.");
  return crypto.createHash("sha256").update(`drive-tokens:${secret}`).digest();
}

/** AES-256-GCM → `iv.tag.cifrado` (base64url). */
export function encryptToken(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(packed: string) {
  const [iv, tag, enc] = packed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
