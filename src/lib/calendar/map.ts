/**
 * Mapeamento puro entre eventos do CRM e do Google Agenda (sem banco, sem rede: é o que os testes cobrem).
 *
 * Regras:
 *  - fuso fixo America/Sao_Paulo (sem horário de verão desde 2019: -03:00);
 *  - no CRM, evento de dia inteiro vai de 00:00 do primeiro dia até 23:59:59 do último; no Google a data final é exclusiva;
 *  - o "conteúdo" sincronizado (título, descrição, local, início, fim, dia inteiro) tem um hash: é ele que diz quem mudou
 *    desde a última sincronização (o CRM, o Google, os dois ou ninguém) e evita eco (reenviar o que acabou de chegar).
 */
import crypto from "node:crypto";

export const TZ = "America/Sao_Paulo";
export const CAL_NAME = "Estúdio Restaura";

export type GDateTime = { date?: string; dateTime?: string; timeZone?: string };
export type GEvent = {
  id: string;
  etag?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: GDateTime;
  end?: GDateTime;
  updated?: string;
  hangoutLink?: string;
  htmlLink?: string;
  attendees?: { email: string; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
  recurringEventId?: string;
};

/** Evento do CRM no formato mínimo usado aqui. */
export type CrmEventLike = {
  id: string;
  title: string;
  type: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  description: string | null;
  meet: boolean;
  inviteGuests: boolean;
  guestEmails: string | null;
};

export type Content = { title: string; description: string | null; location: string | null; allDay: boolean; start: string; end: string };

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** "YYYY-MM-DD" no fuso de Brasília. */
export const dayBR = (d: Date) => dayFmt.format(d);
const startOfDayBR = (day: string) => new Date(`${day}T00:00:00-03:00`);

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").replace(/\r\n/g, "\n").trim();
  return t ? t : null;
};

/** Conteúdo canônico de um evento do CRM. */
export function contentOfCrm(e: Pick<CrmEventLike, "title" | "description" | "location" | "allDay" | "startsAt" | "endsAt">): Content {
  return {
    title: e.title.trim(),
    description: clean(e.description),
    location: clean(e.location),
    allDay: e.allDay,
    start: e.allDay ? dayBR(e.startsAt) : e.startsAt.toISOString(),
    end: e.allDay ? dayBR(e.endsAt) : e.endsAt.toISOString(),
  };
}

/** Início/fim de um evento do Google no padrão do CRM (dia inteiro: até 23:59:59 do último dia). */
export function datesOfGoogle(g: GEvent): { startsAt: Date; endsAt: Date; allDay: boolean } | null {
  const s = g.start;
  const e = g.end;
  if (!s) return null;
  if (s.date) {
    const startsAt = startOfDayBR(s.date);
    let endsAt = e?.date ? new Date(startOfDayBR(e.date).getTime() - 1000) : new Date(startsAt.getTime() + 864e5 - 1000);
    if (endsAt < startsAt) endsAt = new Date(startsAt.getTime() + 864e5 - 1000);
    return { startsAt, endsAt, allDay: true };
  }
  if (!s.dateTime) return null;
  const startsAt = new Date(s.dateTime);
  if (Number.isNaN(startsAt.getTime())) return null;
  let endsAt = e?.dateTime ? new Date(e.dateTime) : new Date(startsAt.getTime() + 36e5);
  if (Number.isNaN(endsAt.getTime()) || endsAt < startsAt) endsAt = new Date(startsAt.getTime() + 36e5);
  return { startsAt, endsAt, allDay: false };
}

export type PulledFields = { title: string; description: string | null; location: string | null; startsAt: Date; endsAt: Date; allDay: boolean };

/** Campos do CRM a partir de um evento do Google (null se não der para ler as datas). */
export function fromGoogle(g: GEvent): PulledFields | null {
  const d = datesOfGoogle(g);
  if (!d) return null;
  return { title: clean(g.summary) ?? "(sem título)", description: clean(g.description), location: clean(g.location), ...d };
}

export const contentOfGoogle = (g: GEvent): Content | null => {
  const f = fromGoogle(g);
  return f ? contentOfCrm(f) : null;
};

export const hashContent = (c: Content) => crypto.createHash("sha1").update(JSON.stringify([c.title, c.description, c.location, c.allDay, c.start, c.end])).digest("hex");

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
/** Lê e-mails separados por vírgula, ponto e vírgula ou espaço; descarta inválidos e repetidos. */
export function parseEmails(...lists: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const l of lists)
    for (const raw of (l ?? "").split(/[\s,;]+/)) {
      const e = raw.trim().toLowerCase();
      if (e && EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
    }
  return out.slice(0, 50);
}

/** O Google aceita ids próprios de 5–1024 caracteres em a–v e 0–9: o UUID sem hífens serve (e torna o envio idempotente). */
export const googleIdFor = (eventId: string) => eventId.replace(/-/g, "").toLowerCase();

export type PushOptions = {
  /** true na criação: define lembretes, Meet e id */
  create: boolean;
  /** e-mails dos convidados (já vindos do contato + extras); só vão se `inviteGuests` */
  guests?: string[];
  /** o evento já tem link do Meet? então não pede outro */
  hasMeet?: boolean;
  requestId?: string;
};

/** Corpo para events.insert / events.patch. */
export function toGoogle(e: CrmEventLike, o: PushOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: e.title.trim(),
    description: clean(e.description),
    location: clean(e.location),
    status: "confirmed",
    extendedProperties: { private: { crmEventId: e.id, crmType: e.type } },
  };
  if (e.allDay) {
    const start = dayBR(e.startsAt);
    let endExclusive = dayBR(new Date(e.endsAt.getTime() + 1000));
    if (endExclusive <= start) endExclusive = dayBR(new Date(startOfDayBR(start).getTime() + 864e5 + 3600e3));
    body.start = { date: start, dateTime: null, timeZone: null };
    body.end = { date: endExclusive, dateTime: null, timeZone: null };
  } else {
    body.start = { dateTime: e.startsAt.toISOString(), timeZone: TZ, date: null };
    body.end = { dateTime: e.endsAt.toISOString(), timeZone: TZ, date: null };
  }
  if (o.create) {
    body.id = googleIdFor(e.id);
    // lembretes: 30 min antes; dia inteiro, às 9h do dia anterior
    body.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: e.allDay ? 900 : 30 }] };
  }
  if (e.inviteGuests && o.guests?.length) body.attendees = o.guests.map((email) => ({ email }));
  if (e.meet && !o.hasMeet && !e.allDay)
    body.conferenceData = { createRequest: { requestId: o.requestId ?? `rs-${e.id}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  return body;
}

export type Decision = { action: "noop" | "push" | "pull"; /** hash a gravar no elo depois da ação */ linkHash: string };

/**
 * Quem vence quando o mesmo evento existe nos dois lados.
 *  - `linkHash`: conteúdo na última sincronização; `crmHash`/`googleHash`: conteúdo de agora.
 *  - só um lado mudou → esse lado vence; os dois mudaram para coisas diferentes → o último a alterar vence (empate: Google).
 *  - nada mudou, ou os dois já são iguais → nada a fazer (só atualiza o elo).
 */
export function decide(i: { linkHash: string; crmHash: string; googleHash: string; crmUpdatedMs: number; googleUpdatedMs: number }): Decision {
  const crmChanged = i.crmHash !== i.linkHash;
  const gChanged = i.googleHash !== i.linkHash;
  if (i.crmHash === i.googleHash) return { action: "noop", linkHash: i.crmHash };
  if (crmChanged && !gChanged) return { action: "push", linkHash: i.crmHash };
  if (!crmChanged && gChanged) return { action: "pull", linkHash: i.googleHash };
  return i.googleUpdatedMs >= i.crmUpdatedMs ? { action: "pull", linkHash: i.googleHash } : { action: "push", linkHash: i.crmHash };
}

/** Espera antes de tentar de novo (backoff exponencial com teto; respeita Retry-After). */
export function backoffMs(attempt: number, retryAfterSec?: number | null, jitter = Math.random()) {
  if (retryAfterSec && retryAfterSec > 0) return Math.min(retryAfterSec * 1000, 20_000);
  return Math.min(400 * 2 ** attempt + Math.floor(jitter * 250), 8000);
}
