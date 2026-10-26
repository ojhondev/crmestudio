/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Testes da sincronização com o Google Agenda: mapeamento CRM↔Google, fuso e dia inteiro, hash/anti-eco,
 * resolução de conflito, syncToken 410, backoff/erros do cliente e token OIDC do workflow calendar-sync.yml.
 * Google MOCKADO (fetch simulado). Sem banco, sem rede.   npm run test:calendar
 */
import crypto from "node:crypto";
import { backoffMs, contentOfCrm, contentOfGoogle, dayBR, decide, fromGoogle, googleIdFor, hashContent, parseEmails, toGoogle, type CrmEventLike, type GEvent } from "../src/lib/calendar/map";
import { createCalendarClient, friendlyError, GoogleApiError } from "../src/lib/calendar/client";
import { pullChanges } from "../src/lib/calendar/pull";
import { oidcConfig, verifyGithubOidc, type Jwk } from "../src/lib/editais/oidc";

let fail = 0;
let total = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  total++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};
const ok = (v: unknown, m: string) => eq(!!v, true, m);

const ev = (o: Partial<CrmEventLike> = {}): CrmEventLike => ({
  id: "0a1b2c3d-1111-2222-3333-444455556666",
  title: "Visita técnica",
  type: "visita",
  startsAt: new Date("2026-11-03T12:00:00Z"), // 09:00 em Brasília
  endsAt: new Date("2026-11-03T13:00:00Z"),
  allDay: false,
  location: "Igreja do Carmo",
  description: "Levar trena",
  meet: false,
  inviteGuests: false,
  guestEmails: null,
  ...o,
});

/* ------------------------------ mapeamento CRM → Google ------------------------------ */
{
  const b = toGoogle(ev(), { create: true }) as Record<string, any>;
  eq(b.summary, "Visita técnica", "título");
  eq(b.start, { dateTime: "2026-11-03T12:00:00.000Z", timeZone: "America/Sao_Paulo", date: null }, "início com fuso");
  eq(b.id, "0a1b2c3d111122223333444455556666", "id derivado do id do CRM (idempotente)");
  ok(/^[a-v0-9]{5,}$/.test(b.id), "id aceito pelo Google (a-v e 0-9)");
  eq(b.reminders.overrides[0].minutes, 30, "lembrete de 30 min");
  eq(b.extendedProperties.private.crmEventId, "0a1b2c3d-1111-2222-3333-444455556666", "id do CRM guardado no Google");
  eq(b.attendees, undefined, "sem convite por padrão");
  eq(b.conferenceData, undefined, "sem Meet por padrão");
  eq((toGoogle(ev(), { create: false }) as Record<string, unknown>).id, undefined, "patch não envia id");
  eq((toGoogle(ev(), { create: false }) as Record<string, unknown>).reminders, undefined, "patch não mexe nos lembretes do usuário");

  const m = toGoogle(ev({ meet: true, inviteGuests: true }), { create: true, guests: ["a@x.com"], requestId: "r1" }) as Record<string, any>;
  eq(m.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet", "pede Meet");
  eq(m.attendees, [{ email: "a@x.com" }], "convidados");
  eq((toGoogle(ev({ meet: true }), { create: false, hasMeet: true }) as Record<string, unknown>).conferenceData, undefined, "não pede segundo Meet");
  eq((toGoogle(ev({ inviteGuests: true }), { create: true, guests: [] }) as Record<string, unknown>).attendees, undefined, "convite sem e-mails não envia lista");
  eq(toGoogle(ev({ description: "  ", location: null }), { create: false }).description, null, "descrição vazia limpa o campo");
}

/* ------------------------------ dia inteiro e fuso ------------------------------ */
{
  // CRM: 5 a 6 de novembro, 00:00 → 23:59:59 de Brasília
  const allDay = ev({ allDay: true, startsAt: new Date("2026-11-05T03:00:00Z"), endsAt: new Date("2026-11-07T02:59:59Z") });
  const b = toGoogle(allDay, { create: true }) as Record<string, any>;
  eq(b.start.date, "2026-11-05", "dia inteiro: início");
  eq(b.end.date, "2026-11-07", "dia inteiro: fim exclusivo");
  eq(b.start.dateTime, null, "dia inteiro limpa o horário (nulos saem só na criação)");
  eq(b.reminders.overrides[0].minutes, 900, "dia inteiro: lembrete 9h do dia anterior");
  eq(toGoogle(ev({ allDay: true, meet: true }), { create: true }).conferenceData, undefined, "dia inteiro não pede Meet");

  const back = fromGoogle({ id: "x", summary: "Feriado", start: { date: "2026-11-05" }, end: { date: "2026-11-07" } })!;
  eq(back.allDay, true, "Google dia inteiro → CRM");
  eq(back.startsAt.toISOString(), "2026-11-05T03:00:00.000Z", "00:00 Brasília");
  eq(back.endsAt.toISOString(), "2026-11-07T02:59:59.000Z", "23:59:59 do último dia");
  // ida e volta mantém o mesmo conteúdo (sem eco)
  eq(hashContent(contentOfCrm(allDay)), hashContent(contentOfGoogle({ id: "x", summary: "Visita técnica", description: "Levar trena", location: "Igreja do Carmo", start: { date: "2026-11-05" }, end: { date: "2026-11-07" } })!), "ida e volta de dia inteiro tem o mesmo hash");

  const one = fromGoogle({ id: "y", start: { date: "2026-11-05" }, end: { date: "2026-11-06" } })!;
  eq(one.endsAt.toISOString(), "2026-11-06T02:59:59.000Z", "dia único");
  const bad = fromGoogle({ id: "z", start: { date: "2026-11-05" } })!;
  eq(bad.endsAt.toISOString(), "2026-11-06T02:59:59.000Z", "dia inteiro sem fim = 1 dia");
  eq(fromGoogle({ id: "w" }), null, "sem datas = ignora");
  eq(fromGoogle({ id: "v", summary: "  ", start: { dateTime: "2026-11-03T09:00:00-03:00" }, end: { dateTime: "2026-11-03T08:00:00-03:00" } })!.title, "(sem título)", "título vazio");
  eq(fromGoogle({ id: "v", start: { dateTime: "2026-11-03T09:00:00-03:00" }, end: { dateTime: "2026-11-03T08:00:00-03:00" } })!.endsAt.toISOString(), "2026-11-03T13:00:00.000Z", "fim antes do início vira +1h");
  eq(dayBR(new Date("2026-11-03T02:30:00Z")), "2026-11-02", "dia no fuso de Brasília (UTC já é dia seguinte)");
}

/* ------------------------------ hash e anti-eco ------------------------------ */
{
  const e = ev();
  const g: GEvent = { id: "g1", summary: "Visita técnica", description: "Levar trena", location: "Igreja do Carmo", start: { dateTime: "2026-11-03T09:00:00-03:00" }, end: { dateTime: "2026-11-03T10:00:00-03:00" } };
  eq(hashContent(contentOfCrm(e)), hashContent(contentOfGoogle(g)!), "mesmo conteúdo, fusos diferentes → mesmo hash (não há eco)");
  ok(hashContent(contentOfCrm(e)) !== hashContent(contentOfCrm(ev({ title: "Outro" }))), "título muda o hash");
  eq(hashContent(contentOfCrm(ev({ description: null }))), hashContent(contentOfCrm(ev({ description: "  " }))), "descrição vazia = nula");
}

/* ------------------------------ resolução de conflito ------------------------------ */
{
  const base = { linkHash: "A", crmUpdatedMs: 1000, googleUpdatedMs: 2000 };
  eq(decide({ ...base, crmHash: "A", googleHash: "A" }), { action: "noop", linkHash: "A" }, "nada mudou");
  eq(decide({ ...base, crmHash: "B", googleHash: "A" }), { action: "push", linkHash: "B" }, "só o CRM mudou → envia");
  eq(decide({ ...base, crmHash: "A", googleHash: "C" }), { action: "pull", linkHash: "C" }, "só o Google mudou → traz");
  eq(decide({ ...base, crmHash: "B", googleHash: "B" }), { action: "noop", linkHash: "B" }, "os dois já iguais → só atualiza o elo");
  eq(decide({ ...base, crmHash: "B", googleHash: "C" }).action, "pull", "conflito: Google alterou depois → Google vence");
  eq(decide({ linkHash: "A", crmHash: "B", googleHash: "C", crmUpdatedMs: 5000, googleUpdatedMs: 2000 }).action, "push", "conflito: CRM alterou depois → CRM vence");
  eq(decide({ linkHash: "A", crmHash: "B", googleHash: "C", crmUpdatedMs: 2000, googleUpdatedMs: 2000 }).action, "pull", "empate → Google");
  eq(decide({ linkHash: "", crmHash: "B", googleHash: "C", crmUpdatedMs: 9, googleUpdatedMs: 1 }).action, "push", "elo perdido → vale o mais recente");
}

/* ------------------------------ e-mails ------------------------------ */
eq(parseEmails("A@x.com, b@y.com;  lixo, a@x.com", null, "c@z.com.br"), ["a@x.com", "b@y.com", "c@z.com.br"], "e-mails: válidos, sem repetição");
eq(googleIdFor("AB-CD"), "abcd", "id minúsculo sem hífen");

/* ------------------------------ cliente (Google mockado) ------------------------------ */
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function clientTests() {
  // backoff: 429 duas vezes e depois ok
  const calls: string[] = [];
  const waits: number[] = [];
  let n = 0;
  const c1 = createCalendarClient({
    getToken: async () => "tok",
    sleep: async (ms) => void waits.push(ms),
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      ok((init?.headers as Record<string, string>).authorization === "Bearer tok", "envia o token");
      return ++n < 3 ? json(429, { error: { errors: [{ reason: "rateLimitExceeded" }], message: "limite" } }) : json(200, { id: "cal1" });
    }) as unknown as typeof fetch,
  });
  eq((await c1.insertCalendar("Estúdio Restaura", "America/Sao_Paulo")).id, "cal1", "cria a agenda após retries");
  eq(calls.length, 3, "3 tentativas");
  eq(waits.length, 2, "esperou 2 vezes (backoff)");
  ok(waits[1] >= waits[0], "backoff cresce");
  ok(backoffMs(0, 3) === 3000 && backoffMs(10, null, 0) === 8000, "backoff respeita Retry-After e teto");

  // API desativada
  const c2 = createCalendarClient({
    getToken: async () => "t",
    fetchImpl: (async () => json(403, { error: { code: 403, message: "Google Calendar API has not been used in project 1 before or it is disabled.", errors: [{ reason: "accessNotConfigured" }], status: "PERMISSION_DENIED" } })) as unknown as typeof fetch,
  });
  try {
    await c2.getCalendar("x");
    ok(false, "deveria lançar");
  } catch (e) {
    ok(e instanceof GoogleApiError && e.kind === "api_desativada", "403 accessNotConfigured → api_desativada");
    ok(/ainda não foi ativada pelo administrador/.test(friendlyError(e).message), "mensagem amigável da API desativada");
  }

  // 401 → reautorizar; 409 → conflito; delete 404 tolerado
  const c3 = createCalendarClient({ getToken: async () => "t", fetchImpl: (async () => json(401, { error: { message: "x" } })) as unknown as typeof fetch });
  await c3.getCalendar("a").catch((e) => eq(e.kind, "reautorizar", "401 → reautorizar"));
  const c4 = createCalendarClient({ getToken: async () => "t", fetchImpl: (async () => json(409, { error: { message: "dup" } })) as unknown as typeof fetch });
  await c4.insertEvent("c", { summary: "x" }).catch((e) => eq(e.kind, "conflito", "409 → conflito"));
  const c5 = createCalendarClient({ getToken: async () => "t", fetchImpl: (async () => json(404, { error: { message: "nf" } })) as unknown as typeof fetch });
  await c5.deleteEvent("c", "e");
  ok(true, "apagar evento inexistente não falha");

  // remoção de nulos na criação; nulos mantidos no patch
  const bodies: Record<string, unknown>[] = [];
  const c6 = createCalendarClient({ getToken: async () => "t", fetchImpl: (async (_u: string, i?: RequestInit) => (bodies.push(JSON.parse(String(i?.body))), json(200, { id: "e" }))) as unknown as typeof fetch });
  await c6.insertEvent("c", toGoogle(ev({ allDay: true }), { create: true }));
  await c6.patchEvent("c", "e", toGoogle(ev({ allDay: true }), { create: false }));
  eq((bodies[0].start as Record<string, unknown>).dateTime, undefined, "insert sem nulos");
  eq((bodies[1].start as Record<string, unknown>).dateTime, null, "patch limpa o horário ao virar dia inteiro");
}

/* ------------------------------ sync incremental e 410 ------------------------------ */
async function pullTests() {
  const seen: (string | null)[] = [];
  const mk = (gone: boolean) => ({
    listEvents: async (p: { syncToken?: string | null; pageToken?: string | null; timeMin?: string }) => {
      seen.push(p.syncToken ?? null);
      if (p.syncToken && gone) throw new GoogleApiError(410, "fullSyncRequired", "Gone", "gone");
      if (p.pageToken === "p2") return { items: [{ id: "c" }], nextSyncToken: "NOVO" };
      if (!p.syncToken && !p.pageToken) return { items: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" };
      return { items: [{ id: "d" }], nextSyncToken: "INC" };
    },
  });
  const full = await pullChanges(mk(false), "cal", null);
  eq(full.events.map((e) => e.id), ["a", "b", "c"], "sync completo pagina");
  eq([full.nextSyncToken, full.fullResync], ["NOVO", true], "guarda o syncToken");
  const inc = await pullChanges(mk(false), "cal", "TOK");
  eq([inc.events.map((e) => e.id), inc.nextSyncToken, inc.fullResync], [["d"], "INC", false], "sync incremental");
  seen.length = 0;
  const re = await pullChanges(mk(true), "cal", "VENCIDO");
  eq(seen, ["VENCIDO", null, null], "410: descarta o token e refaz o sync completo");
  eq([re.events.map((e) => e.id), re.nextSyncToken, re.fullResync], [["a", "b", "c"], "NOVO", true], "410: resultado do sync completo");
  // outro erro não é engolido
  await pullChanges({ listEvents: async () => { throw new GoogleApiError(500, "", "x", "outro"); } }, "cal", "T").then(() => ok(false, "deveria lançar"), (e) => eq(e.status, 500, "erro 500 sobe"));
}

/* ------------------------------ OIDC do workflow calendar-sync.yml ------------------------------ */
async function oidcTests() {
  const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as object), kid: "k1" } as Jwk;
  const getKey = async (kid: string) => (kid === "k1" ? jwk : null);
  const cfg = oidcConfig({ EDITAIS_WORKFLOW_FILE: "calendar-sync.yml" });
  const now = Math.floor(Date.now() / 1000);
  const claims = (o: object = {}) => ({
    iss: "https://token.actions.githubusercontent.com",
    aud: "https://crm.estudiorestaura.com.br",
    repository: "ojhondev/crmestudio",
    repository_owner: "ojhondev",
    ref: "refs/heads/main",
    event_name: "schedule",
    job_workflow_ref: "ojhondev/crmestudio/.github/workflows/calendar-sync.yml@refs/heads/main",
    iat: now - 5,
    nbf: now - 5,
    exp: now + 300,
    ...o,
  });
  const sign = (c: object) => {
    const data = `${b64u(JSON.stringify({ alg: "RS256", kid: "k1" }))}.${b64u(JSON.stringify(c))}`;
    return `${data}.${b64u(crypto.sign("RSA-SHA256", Buffer.from(data), privateKey))}`;
  };
  const v = (t: string | null) => verifyGithubOidc(t, cfg, { getKey });
  eq((await v(sign(claims()))).ok, true, "OIDC válido do calendar-sync.yml");
  eq((await v(null)).ok, false, "sem token recusado");
  eq((await v(sign(claims({ job_workflow_ref: "ojhondev/crmestudio/.github/workflows/editais.yml@refs/heads/main" })))).ok, false, "token do workflow de Editais não vale aqui");
  eq((await v(sign(claims({ repository: "outro/repo" })))).ok, false, "outro repositório recusado");
  eq((await v(sign(claims({ ref: "refs/heads/dev" })))).ok, false, "outro branch recusado");
  eq((await v(sign(claims({ aud: "https://evil.example" })))).ok, false, "audiência errada recusada");
}

async function main() {
  await clientTests();
  await pullTests();
  await oidcTests();
  console.log(fail ? `\n${fail} de ${total} verificações falharam` : `Todas as ${total} verificações passaram`);
  process.exit(fail ? 1 : 0);
}
main();
