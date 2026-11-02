import type { RawContact } from "./types";

/**
 * Cliente mínimo da Google People API (somente leitura, fetch, sem SDK). Recebe o token e o `fetch` por injeção,
 * então os testes usam um Google simulado. Repete com espera crescente em 429/5xx.
 */

const BASE = "https://people.googleapis.com/v1";
export const PERSON_FIELDS = "names,phoneNumbers,emailAddresses,organizations,addresses,biographies,metadata";

export type PeopleErrorKind = "api_desativada" | "reautorizar" | "sync_expirado" | "limite" | "sem_permissao" | "outro";

export class PeopleError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
    public kind: PeopleErrorKind,
  ) {
    super(message);
    this.name = "PeopleError";
  }
}

export function classifyPeople(status: number, reason: string, message: string): PeopleErrorKind {
  if (reason === "accessNotConfigured" || /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(message)) return "api_desativada";
  if (status === 400 && /EXPIRED_SYNC_TOKEN|sync token/i.test(`${reason} ${message}`)) return "sync_expirado";
  if (status === 410) return "sync_expirado";
  if (status === 401 || reason === "invalid_grant") return "reautorizar";
  if (status === 429 || ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "RESOURCE_EXHAUSTED"].includes(reason)) return "limite";
  if (status === 403) return "sem_permissao";
  return "outro";
}

export function friendlyPeopleError(e: unknown): { kind: PeopleErrorKind; message: string } {
  const kind = e instanceof PeopleError ? e.kind : "outro";
  const msg: Record<PeopleErrorKind, string> = {
    api_desativada: "A People API do Google ainda não foi ativada pelo administrador. Quem cuida do Google Cloud precisa abrir APIs e serviços → Biblioteca → “People API” → Ativar.",
    reautorizar: "O Google pediu uma nova autorização. Toque em “Reconectar”.",
    sync_expirado: "O Google reiniciou a lista de alterações; vamos baixar tudo de novo.",
    limite: "O Google limitou as requisições por alguns instantes. Tente de novo em um minuto.",
    sem_permissao: "O Google não permitiu ler os contatos. Reconecte e conceda a permissão de contatos.",
    outro: "Não foi possível falar com o Google Contatos agora. Tente de novo em instantes.",
  };
  return { kind, message: msg[kind] };
}

export type Person = {
  resourceName?: string;
  metadata?: { deleted?: boolean };
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string; type?: string }[];
  emailAddresses?: { value?: string }[];
  organizations?: { name?: string; title?: string }[];
  addresses?: { formattedValue?: string; streetAddress?: string; city?: string; region?: string; country?: string }[];
  biographies?: { value?: string }[];
};

export type ConnectionsPage = { connections?: Person[]; nextPageToken?: string; nextSyncToken?: string; totalItems?: number };

/** Prefixo do externalId: separa contas Google diferentes (people/c123 pode se repetir entre contas). */
export const externalIdFor = (scope: string, resourceName: string) => `g:${scope}:${resourceName}`;

/** Pessoa do Google → contato cru. Devolve null para contatos apagados. */
export function personToRaw(p: Person, scope: string): (RawContact & { deleted?: boolean }) | null {
  if (!p.resourceName) return null;
  const n = p.names?.[0];
  const o = p.organizations?.[0];
  const a = p.addresses?.[0];
  const phones = (p.phoneNumbers ?? []).map((x) => ({ value: (x.canonicalForm || x.value || "").trim(), label: x.type?.toLowerCase() })).filter((x) => x.value);
  return {
    externalId: externalIdFor(scope, p.resourceName),
    deleted: !!p.metadata?.deleted,
    name: n?.displayName?.trim() || [n?.givenName, n?.familyName].filter(Boolean).join(" ").trim() || undefined,
    givenName: n?.givenName,
    familyName: n?.familyName,
    phones,
    emails: (p.emailAddresses ?? []).map((x) => (x.value ?? "").trim()).filter(Boolean),
    company: o?.name?.trim() || undefined,
    role: o?.title?.trim() || undefined,
    address: a?.formattedValue?.replace(/\n+/g, ", ").trim() || a?.streetAddress?.trim() || undefined,
    city: a?.city?.trim() || undefined,
    state: a?.region?.trim() || undefined,
    notes: p.biographies?.[0]?.value?.trim() || undefined,
  };
}

export type PeopleDeps = {
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

export const backoff = (attempt: number, retryAfter?: number | null) => (retryAfter && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : Math.min(500 * 2 ** attempt, 8000));

export function createPeopleClient(deps: PeopleDeps) {
  const f = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = deps.maxAttempts ?? 4;

  async function call<T>(path: string, query: Record<string, string | undefined>): Promise<T> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") q.set(k, v);
    const url = `${BASE}${path}?${q}`;
    for (let attempt = 0; ; attempt++) {
      const res = await f(url, { headers: { authorization: `Bearer ${await deps.getToken()}` }, cache: "no-store" });
      if (res.ok) return (await res.json()) as T;
      let reason = "";
      let message = `Google respondeu ${res.status}`;
      try {
        const j = (await res.json()) as { error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
        reason = j.error?.errors?.[0]?.reason ?? j.error?.details?.find((d) => d.reason)?.reason ?? j.error?.status ?? "";
        message = j.error?.message ?? message;
      } catch {
        /* corpo vazio */
      }
      const kind = classifyPeople(res.status, reason, message);
      if ((kind === "limite" || res.status >= 500) && attempt + 1 < max) {
        await sleep(backoff(attempt, Number(res.headers.get("retry-after")) || null));
        continue;
      }
      throw new PeopleError(res.status, reason, message, kind);
    }
  }

  return {
    /** Uma página de contatos. Sem `syncToken`: lista completa (pede um syncToken novo no fim). Com ele: só o que mudou. */
    listConnections: (o: { pageToken?: string | null; syncToken?: string | null; pageSize?: number }) =>
      call<ConnectionsPage>("/people/me/connections", {
        personFields: PERSON_FIELDS,
        pageSize: String(o.pageSize ?? 1000),
        pageToken: o.pageToken ?? undefined,
        requestSyncToken: "true",
        syncToken: o.syncToken ?? undefined,
        sources: "READ_SOURCE_TYPE_CONTACT",
      }),
  };
}

export type PeopleClient = ReturnType<typeof createPeopleClient>;
