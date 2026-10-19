import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decryptToken, encryptToken } from "./crypto";
import { kindFromMime } from "./detect";
import { DriveUnavailable, type DriveEntry, type DriveProvider, type UploadInput } from "./types";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive.readonly"];

/** Credenciais OAuth do app no Google Cloud. Sem elas, o Google Drive fica "Não conectado". */
export const googleConfig = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
});
export const googleConfigured = () => {
  const c = googleConfig();
  return !!(c.clientId && c.clientSecret);
};

export async function getConnection() {
  const [c] = await db.select().from(schema.driveConnections).where(eq(schema.driveConnections.provider, "google")).limit(1);
  return c ?? null;
}

export function authUrl(redirectUri: string, state: string) {
  const c = googleConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const c = googleConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) throw new DriveUnavailable(`Google recusou a autorização (${json.error ?? res.status}).`);
  return json;
}

export const exchangeCode = (code: string, redirectUri: string) => tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });

/** Guarda os tokens criptografados (uma conexão por vez). */
export async function saveConnection(t: TokenResponse, by: string, email: string | null) {
  const old = await getConnection();
  const values = {
    provider: "google",
    accountEmail: email,
    accessTokenEnc: encryptToken(t.access_token),
    refreshTokenEnc: t.refresh_token ? encryptToken(t.refresh_token) : (old?.refreshTokenEnc ?? null),
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope ?? GOOGLE_SCOPES.join(" "),
    connectedById: by,
    updatedAt: new Date(),
  };
  if (old) await db.update(schema.driveConnections).set(values).where(eq(schema.driveConnections.id, old.id));
  else await db.insert(schema.driveConnections).values(values);
}

export async function fetchAccountEmail(accessToken: string) {
  try {
    const res = await fetch(`${API}/about?fields=user(emailAddress)`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const j = (await res.json()) as { user?: { emailAddress?: string } };
    return j.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Access token válido (renova com o refresh token quando expira). */
async function accessToken() {
  const c = await getConnection();
  if (!c?.accessTokenEnc) throw new DriveUnavailable("Google Drive não conectado.");
  if (c.expiresAt && c.expiresAt.getTime() > Date.now() && c.accessTokenEnc) return decryptToken(c.accessTokenEnc);
  if (!c.refreshTokenEnc) throw new DriveUnavailable("A conexão com o Google expirou. Reconecte o Drive.");
  const t = await tokenRequest({ refresh_token: decryptToken(c.refreshTokenEnc), grant_type: "refresh_token" });
  await db
    .update(schema.driveConnections)
    .set({ accessTokenEnc: encryptToken(t.access_token), expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), updatedAt: new Date() })
    .where(eq(schema.driveConnections.id, c.id));
  return t.access_token;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new DriveUnavailable(`Google Drive respondeu ${res.status}.`);
  return (await res.json()) as T;
}

type GFile = { id: string; name: string; mimeType: string; webViewLink?: string; modifiedTime?: string; size?: string; parents?: string[] };
const FIELDS = "id,name,mimeType,webViewLink,modifiedTime,size,parents";

const toEntry = (f: GFile): DriveEntry => ({
  id: f.id,
  name: f.name,
  kind: kindFromMime(f.mimeType),
  isFolder: f.mimeType === "application/vnd.google-apps.folder",
  url: f.webViewLink ?? `https://drive.google.com/open?id=${f.id}`,
  mimeType: f.mimeType,
  modifiedAt: f.modifiedTime ?? null,
  size: f.size ? Number(f.size) : null,
  parentId: f.parents?.[0] ?? null,
});

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Provedor "google": API REST v3 do Google Drive com OAuth2. Só funciona com credenciais + conta conectada. */
export const googleProvider: DriveProvider = {
  id: "google",
  label: "Google Drive",
  async isReady() {
    return googleConfigured() && !!(await getConnection())?.accessTokenEnc;
  },
  async listFolder(folderId) {
    const q = `'${esc(folderId || "root")}' in parents and trashed=false`;
    const r = await api<{ files: GFile[] }>(`/files?${new URLSearchParams({ q, fields: `files(${FIELDS})`, orderBy: "folder,name", pageSize: "200" })}`);
    return r.files.map(toEntry);
  },
  async search(query) {
    const q = `name contains '${esc(query)}' and trashed=false`;
    const r = await api<{ files: GFile[] }>(`/files?${new URLSearchParams({ q, fields: `files(${FIELDS})`, orderBy: "modifiedTime desc", pageSize: "50" })}`);
    return r.files.map(toEntry);
  },
  async getMeta(id) {
    try {
      return toEntry(await api<GFile>(`/files/${encodeURIComponent(id)}?fields=${FIELDS}`));
    } catch {
      return null;
    }
  },
  async openUrl(id) {
    return (await this.getMeta(id))?.url ?? null;
  },
  async upload({ name, mimeType, data, folderId }: UploadInput) {
    const boundary = `rs${Date.now()}`;
    const meta = JSON.stringify({ name, ...(folderId ? { parents: [folderId] } : {}) });
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const f = await api<GFile>(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body: Buffer.concat([head, Buffer.from(data), tail]),
    });
    return toEntry(f);
  },
  async createFolder(name, parentId) {
    const f = await api<GFile>(`/files?fields=${FIELDS}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) }),
    });
    return toEntry(f);
  },
};
