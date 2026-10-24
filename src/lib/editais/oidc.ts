/**
 * Validação do token OIDC do GitHub Actions (sem nenhum segredo guardado em lugar nenhum).
 *
 * O workflow pede ao GitHub um JWT assinado (RS256) para a audiência do CRM; aqui conferimos:
 *  - assinatura, com as chaves públicas publicadas em https://token.actions.githubusercontent.com/.well-known/jwks;
 *  - issuer, audiência, expiração/validade (com tolerância de relógio) e idade máxima;
 *  - repositório (`ojhondev/crmestudio`), dono, branch (`refs/heads/main`), evento (agendado/manual) e o arquivo de
 *    workflow que rodou (`job_workflow_ref`): um workflow de outro repositório, de um fork, de outro branch
 *    ou de outro arquivo é recusado.
 * Só usa `node:crypto` e `fetch`: roda na Vercel e nos testes (com chaves de teste injetadas em `getKey`).
 */
import crypto from "node:crypto";

export type OidcConfig = {
  issuer: string;
  audience: string;
  /** "dono/repositório" */
  repository: string;
  workflowFile: string;
  refs: string[];
  events: string[];
  jwksUrl: string;
};

export const OIDC_ISSUER = "https://token.actions.githubusercontent.com";

export function oidcConfig(env: Record<string, string | undefined> = process.env): OidcConfig {
  return {
    issuer: OIDC_ISSUER,
    audience: env.EDITAIS_OIDC_AUDIENCE || "https://crm.estudiorestaura.com.br",
    repository: env.EDITAIS_GITHUB_REPO || env.GITHUB_REPO || "ojhondev/crmestudio",
    workflowFile: env.EDITAIS_WORKFLOW_FILE || "editais.yml",
    refs: (env.EDITAIS_ALLOWED_REFS || "refs/heads/main").split(",").map((s) => s.trim()).filter(Boolean),
    events: ["schedule", "workflow_dispatch"],
    jwksUrl: `${OIDC_ISSUER}/.well-known/jwks`,
  };
}

export type Jwk = { kid?: string; kty: string; n?: string; e?: string; alg?: string; use?: string };
export type KeyResolver = (kid: string) => Promise<Jwk | null>;

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

let jwksCache: { at: number; keys: Jwk[] } | null = null;

/** Busca (e guarda por 10 min) as chaves públicas do GitHub; se a chave pedida não está no cache, atualiza uma vez. */
export function githubKeyResolver(url = `${OIDC_ISSUER}/.well-known/jwks`): KeyResolver {
  return async (kid) => {
    const load = async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`JWKS ${res.status}`);
      const json = (await res.json()) as { keys?: Jwk[] };
      jwksCache = { at: Date.now(), keys: json.keys ?? [] };
    };
    if (!jwksCache || Date.now() - jwksCache.at > 10 * 60_000) await load();
    let k = jwksCache!.keys.find((x) => x.kid === kid);
    if (!k && Date.now() - jwksCache!.at > 30_000) {
      await load();
      k = jwksCache!.keys.find((x) => x.kid === kid);
    }
    return k ?? null;
  };
}

export type OidcResult = { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string };

const SKEW_S = 60;
const MAX_AGE_S = 30 * 60;

export async function verifyGithubOidc(token: string | null | undefined, cfg: OidcConfig, opts: { getKey?: KeyResolver; nowMs?: number } = {}): Promise<OidcResult> {
  const fail = (reason: string): OidcResult => ({ ok: false, reason });
  if (!token) return fail("sem token");
  const parts = token.split(".");
  if (parts.length !== 3) return fail("token malformado");
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(b64(parts[0]).toString("utf8"));
    claims = JSON.parse(b64(parts[1]).toString("utf8"));
  } catch {
    return fail("token ilegível");
  }
  if (header.alg !== "RS256") return fail("algoritmo não aceito");
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!kid) return fail("token sem kid");

  let jwk: Jwk | null;
  try {
    jwk = await (opts.getKey ?? githubKeyResolver(cfg.jwksUrl))(kid);
  } catch (e) {
    return fail(`não foi possível obter as chaves do GitHub (${e instanceof Error ? e.message : "erro"})`);
  }
  if (!jwk || jwk.kty !== "RSA") return fail("chave desconhecida");
  try {
    const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
    const ok = crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, b64(parts[2]));
    if (!ok) return fail("assinatura inválida");
  } catch {
    return fail("assinatura inválida");
  }

  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const exp = num(claims.exp);
  const nbf = num(claims.nbf);
  const iat = num(claims.iat);
  if (exp === null || exp + SKEW_S < now) return fail("token expirado");
  if (nbf !== null && nbf - SKEW_S > now) return fail("token ainda não válido");
  if (iat === null || iat - SKEW_S > now || now - iat > MAX_AGE_S) return fail("token velho demais");

  if (claims.iss !== cfg.issuer) return fail("emissor incorreto");
  const aud = claims.aud;
  if (!(aud === cfg.audience || (Array.isArray(aud) && aud.includes(cfg.audience)))) return fail("audiência incorreta");
  if (claims.repository !== cfg.repository) return fail("repositório não autorizado");
  if (claims.repository_owner !== cfg.repository.split("/")[0]) return fail("dono não autorizado");
  if (typeof claims.ref !== "string" || !cfg.refs.includes(claims.ref)) return fail("branch não autorizado");
  if (typeof claims.event_name !== "string" || !cfg.events.includes(claims.event_name)) return fail("evento não autorizado");
  const wf = `${cfg.repository}/.github/workflows/${cfg.workflowFile}@`;
  if (typeof claims.job_workflow_ref !== "string" || !claims.job_workflow_ref.startsWith(wf) || !cfg.refs.includes(claims.job_workflow_ref.slice(wf.length))) return fail("workflow não autorizado");
  return { ok: true, claims };
}

/** Extrai o token do cabeçalho `Authorization: Bearer …`. */
export const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;
