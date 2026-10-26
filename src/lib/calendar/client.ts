/**
 * Cliente REST mínimo da API do Google Agenda (fetch, sem SDK). Recebe o token e o `fetch` por injeção, então os testes
 * usam um Google simulado. Faz nova tentativa com backoff em 429/5xx/limite de taxa.
 */
import { backoffMs, type GEvent } from "./map";

const BASE = "https://www.googleapis.com/calendar/v3";

export type ErrorKind = "api_desativada" | "reautorizar" | "gone" | "nao_encontrado" | "conflito" | "limite" | "sem_permissao" | "outro";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
    public kind: ErrorKind,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

function classify(status: number, reason: string, message: string): ErrorKind {
  if (reason === "accessNotConfigured" || /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) return "api_desativada";
  if (status === 401 || reason === "authError" || reason === "invalid_grant") return "reautorizar";
  if (status === 410) return "gone";
  if (status === 404) return "nao_encontrado";
  if (status === 409) return "conflito";
  if (status === 429 || ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "calendarUsageLimitsExceeded"].includes(reason)) return "limite";
  if (status === 403) return "sem_permissao";
  return "outro";
}

/** Mensagem amigável (pt-BR) para mostrar na tela. */
export function friendlyError(e: unknown): { kind: ErrorKind; message: string } {
  const kind = e instanceof GoogleApiError ? e.kind : "outro";
  const msg: Record<ErrorKind, string> = {
    api_desativada: "A API do Google Agenda ainda não foi ativada pelo administrador. Avise quem cuida do Google Cloud do estúdio.",
    reautorizar: "O Google pediu uma nova autorização. Toque em “Reconectar”.",
    gone: "O Google reiniciou a lista de alterações; vamos baixar tudo de novo na próxima sincronização.",
    nao_encontrado: "A agenda ou o evento não foi encontrado no Google (talvez tenha sido apagado lá).",
    conflito: "O Google recusou por conflito. Tente sincronizar de novo.",
    limite: "O Google limitou as requisições por alguns instantes. Tentaremos de novo automaticamente.",
    sem_permissao: "O Google não permitiu esta operação. Reconecte e conceda a permissão de agenda.",
    outro: "Não foi possível falar com o Google Agenda agora. Tentaremos de novo automaticamente.",
  };
  return { kind, message: msg[kind] };
}

export type ClientDeps = {
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

export type ListParams = { calendarId: string; syncToken?: string | null; pageToken?: string | null; timeMin?: string; timeMax?: string };
export type ListResult = { items: GEvent[]; nextPageToken?: string; nextSyncToken?: string };
export type WatchResult = { id: string; resourceId: string; expiration?: string };

const stripNulls = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== null && x !== undefined)
        .map(([k, x]) => [k, stripNulls(x)]),
    );
  return v;
};

export function createCalendarClient(deps: ClientDeps) {
  const f = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = deps.maxAttempts ?? 4;

  async function call<T>(method: string, path: string, opts: { query?: Record<string, string | undefined>; body?: unknown; allow404?: boolean } = {}): Promise<T> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") q.set(k, v);
    const url = `${BASE}${path}${q.size ? `?${q}` : ""}`;
    for (let attempt = 0; ; attempt++) {
      const res = await f(url, {
        method,
        headers: { authorization: `Bearer ${await deps.getToken()}`, ...(opts.body ? { "content-type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      let reason = "";
      let message = `Google respondeu ${res.status}`;
      try {
        const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } | string; error_description?: string };
        if (typeof j.error === "object" && j.error) {
          reason = j.error.errors?.[0]?.reason ?? j.error.status ?? "";
          message = j.error.message ?? message;
        } else if (typeof j.error === "string") reason = j.error;
      } catch {
        /* corpo vazio ou não-JSON */
      }
      const kind = classify(res.status, reason, message);
      const retryable = kind === "limite" || res.status >= 500;
      if (retryable && attempt + 1 < max) {
        await sleep(backoffMs(attempt, Number(res.headers.get("retry-after")) || null));
        continue;
      }
      throw new GoogleApiError(res.status, reason, message, kind);
    }
  }

  const enc = encodeURIComponent;
  return {
    insertCalendar: (summary: string, timeZone: string) => call<{ id: string; summary?: string }>("POST", "/calendars", { body: { summary, timeZone, description: "Criada pelo Restaura Gestão. Os eventos daqui são sincronizados com o CRM." } }),
    getCalendar: (id: string) => call<{ id: string; summary?: string }>("GET", `/calendars/${enc(id)}`),
    listEvents: (p: ListParams) =>
      call<ListResult>("GET", `/calendars/${enc(p.calendarId)}/events`, {
        query: {
          showDeleted: "true",
          singleEvents: "true",
          maxResults: "250",
          syncToken: p.syncToken ?? undefined,
          pageToken: p.pageToken ?? undefined,
          timeMin: p.syncToken ? undefined : p.timeMin,
          timeMax: p.syncToken ? undefined : p.timeMax,
        },
      }),
    getEvent: (calendarId: string, id: string) => call<GEvent>("GET", `/calendars/${enc(calendarId)}/events/${enc(id)}`),
    insertEvent: (calendarId: string, body: Record<string, unknown>, o: { conference?: boolean; sendUpdates?: boolean } = {}) =>
      call<GEvent>("POST", `/calendars/${enc(calendarId)}/events`, {
        query: { conferenceDataVersion: o.conference ? "1" : undefined, sendUpdates: o.sendUpdates ? "all" : "none" },
        body: stripNulls(body),
      }),
    patchEvent: (calendarId: string, id: string, body: Record<string, unknown>, o: { conference?: boolean; sendUpdates?: boolean } = {}) =>
      call<GEvent>("PATCH", `/calendars/${enc(calendarId)}/events/${enc(id)}`, {
        query: { conferenceDataVersion: o.conference ? "1" : undefined, sendUpdates: o.sendUpdates ? "all" : "none" },
        body,
      }),
    /** Apaga (404/410 contam como já apagado). */
    deleteEvent: async (calendarId: string, id: string, sendUpdates = false) => {
      try {
        await call<void>("DELETE", `/calendars/${enc(calendarId)}/events/${enc(id)}`, { query: { sendUpdates: sendUpdates ? "all" : "none" } });
      } catch (e) {
        if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
        throw e;
      }
    },
    watch: (calendarId: string, ch: { id: string; address: string; token: string; ttlSeconds: number }) =>
      call<WatchResult>("POST", `/calendars/${enc(calendarId)}/events/watch`, {
        body: { id: ch.id, type: "web_hook", address: ch.address, token: ch.token, params: { ttl: String(ch.ttlSeconds) } },
      }),
    stopChannel: async (id: string, resourceId: string) => {
      try {
        await call<void>("POST", "/channels/stop", { body: { id, resourceId } });
      } catch {
        /* canal já expirado: tudo bem */
      }
    },
    /** Apaga a agenda secundária inteira (só usado se o usuário pedir para remover tudo ao desconectar). */
    deleteCalendar: async (id: string) => {
      try {
        await call<void>("DELETE", `/calendars/${enc(id)}`);
      } catch (e) {
        if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
        throw e;
      }
    },
  };
}

export type CalendarClient = ReturnType<typeof createCalendarClient>;
