/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Testes da importação de contatos: vCard 2.1/3.0/4.0, CSV do Google PT/EN, telefones, duplicados, mesclagem,
 * despacho do state do OAuth (Agenda/Contatos/Drive), People API com Google MOCKADO (syncToken, 410, accessNotConfigured).
 *   npm run test:contacts-import        (lógica pura: sem banco, sem rede)
 *   npm run test:contacts-import:db     (inclui banco idempotente; cria e apaga dados "QA-import")
 */
import "./_server-only.cjs";
import { parsePhone, phoneKey, pickPhones } from "../src/lib/contacts-import/phone";
import { decodeBytes, tidyEmail, tidyName } from "../src/lib/contacts-import/text";
import { parseVcf } from "../src/lib/contacts-import/vcard";
import { csvToRaw, guessRole, mapProblems, readCsv } from "../src/lib/contacts-import/csv-contacts";
import { buildCandidate, buildIndex, classify, countByStatus, DEFAULT_FILTERS, defaultLabel, mergePatch, sanitizeCandidate } from "../src/lib/contacts-import/engine";
import { callbackTarget, cookieMatchesState } from "../src/lib/contacts-import/state";
import { classifyPeople, createPeopleClient, friendlyPeopleError, PeopleError, personToRaw, type ConnectionsPage } from "../src/lib/contacts-import/people";
import type { Existing } from "../src/lib/contacts-import/types";

let fail = 0;
let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  n++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};
const ok = (v: unknown, m: string) => eq(!!v, true, m);

async function main() {
/* ------------------------------ telefones ------------------------------ */
for (const [i, e, k] of [
  ["(11) 99999-0000", "5511999990000", "celular"],
  ["11999990000", "5511999990000", "celular"],
  ["+55 11 99999-0000", "5511999990000", "celular"],
  ["5511999990000", "5511999990000", "celular"],
  ["(11) 9999-0000", "5511999990000", "celular"], // sem o 9º dígito: ganha o 9
  ["+55 11 9999-0000", "5511999990000", "celular"],
  ["(11) 3333-4444", "551133334444", "fixo"],
  ["011 99999-0000", "5511999990000", "celular"],
  ["0 15 11 99999-0000", "5511999990000", "celular"],
  ["+1 415 555 2671", "14155552671", "internacional"],
  ["00351 912 345 678", "351912345678", "internacional"],
  ["99999-0000", null, "invalido"], // sem DDD
  ["12345", null, "invalido"],
  ["(00) 99999-0000", null, "invalido"],
  ["11 89999-0000", null, "invalido"], // 11 dígitos sem 9
  ["", null, "invalido"],
  ["abc", null, "invalido"],
  ["111111111111", null, "invalido"],
  ["(11) 99999-0000 ramal 12", "5511999990000", "celular"],
] as [string, string | null, string][]) {
  const r = parsePhone(i);
  eq([r.e164, r.kind], [e, k], `telefone "${i}"`);
}
eq(phoneKey("5511999990000"), phoneKey("551199990000"), "chave igual com e sem o 9");
ok(phoneKey("551133334444") !== phoneKey("5511999990000"), "chave diferente");
{
  const p = pickPhones(["(11) 3333-4444", "11 99999-0000", "+1 415 555 2671", "lixo", "(11) 9999-0000"]);
  eq(p.primary?.e164, "5511999990000", "melhor número é o celular");
  eq(p.extras, ["551133334444", "14155552671"], "extras distintos (sem repetir o mesmo celular)");
  eq(p.invalid, ["lixo"], "inválidos listados");
}

/* ------------------------------ nomes e e-mails ------------------------------ */
eq(tidyName("  JOÃO   DA SILVA "), "João da Silva", "caixa alta");
eq(tidyName("maria de souza"), "Maria de Souza", "minúsculas");
eq(tidyName("Pe. João Silva"), "Pe. João Silva", "misto preservado");
eq(tidyName("PE. ANTÔNIO DOS SANTOS"), "Pe. Antônio dos Santos", "título em caixa alta");
eq(tidyName("DR. JOSÉ"), "Dr. José", "Dr.");
eq(tidyName("iPhone da Ana"), "iPhone da Ana", "mista com i minúsculo");
eq(tidyName("CNBB"), "CNBB", "sigla curta");
eq(tidyName("PARÓQUIA SÃO JOSÉ LTDA"), "Paróquia São José Ltda", "empresa");
eq(tidyName(""), "", "vazio");
eq(tidyEmail(" Ana@Example.TEST "), "ana@example.test", "e-mail minúsculo");
eq(tidyEmail("sem-arroba"), null, "e-mail inválido");
eq(decodeBytes(new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f])), "João", "Latin-1 quando não é UTF-8");
eq(decodeBytes(new TextEncoder().encode("João")), "João", "UTF-8");

/* ------------------------------ vCard ------------------------------ */
const v30 = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:Pe. João Álvares",
  "N:Álvares;João;;Pe.;",
  "ORG:Paróquia São José;Secretaria",
  "TITLE:Pároco",
  "TEL;TYPE=CELL,VOICE:(11) 99999-0001",
  "TEL;TYPE=WORK:+55 11 3333-4444",
  "item1.EMAIL;TYPE=INTERNET:JOAO@Example.Test",
  "EMAIL;TYPE=HOME:joao2@example.test",
  "ADR;TYPE=HOME:;;Praça da Matriz 100;Itu;SP;13300-000;Brasil",
  "NOTE:Linha 1\\nLinha 2\\, com vírgula",
  "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQ",
  " AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "UID:abc-123",
  "END:VCARD",
  "",
].join("\r\n");
{
  const [c] = parseVcf(v30);
  eq(c.name, "Pe. João Álvares", "v3 nome");
  eq(c.company, "Paróquia São José", "v3 empresa (sem departamento)");
  eq(c.role, "Pároco", "v3 cargo");
  eq(c.phones.map((p) => p.value), ["(11) 99999-0001", "+55 11 3333-4444"], "v3 telefones");
  eq(c.emails, ["JOAO@Example.Test", "joao2@example.test"], "v3 e-mails (com grupo)");
  eq([c.address, c.city, c.state], ["Praça da Matriz 100, 13300-000", "Itu", "SP"], "v3 endereço");
  eq(c.notes, "Linha 1\nLinha 2, com vírgula", "v3 nota com escapes");
  eq(c.externalId, "abc-123", "v3 UID");
  eq(c.phones.length, 2, "foto ignorada");
}
const v21 = [
  "BEGIN:VCARD",
  "VERSION:2.1",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=81vila;Jo=C3=A3o;;;",
  "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o =C3=81vila",
  "TEL;CELL;PREF:11 98888-7777",
  "TEL;HOME:11 3222-1111",
  "NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Cliente antigo =E2=80=93 indicado pelo =",
  "Pe. Marcos",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:2.1",
  "FN;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:Jos=E9 Concei=E7=E3o",
  "TEL;CELL:+5521999998888",
  "END:VCARD",
].join("\n");
{
  const l = parseVcf(v21);
  eq(l.length, 2, "v2.1 dois cartões");
  eq(l[0].name, "João Ávila", "v2.1 QP UTF-8");
  eq(l[0].phones.length, 2, "v2.1 vários TEL");
  eq(l[0].notes, "Cliente antigo – indicado pelo Pe. Marcos", "v2.1 QP com quebra suave");
  eq(l[1].name, "José Conceição", "v2.1 QP Latin-1");
}
const v40 = ["BEGIN:VCARD", "VERSION:4.0", "FN:Ana Lima", "TEL;VALUE=uri;TYPE=cell:tel:+55-11-97777-6666", "EMAIL:ana@example.test", "X-ABShowAs:COMPANY", "END:VCARD"].join("\r\n");
{
  const [c] = parseVcf(v40);
  eq(parsePhone(c.phones[0].value).e164, "5511977776666", "v4 tel:uri");
  eq(c.isOrg, true, "v4 organização");
}
eq(parseVcf("lixo qualquer").length, 0, "texto sem vCard");
eq(parseVcf("BEGIN:VCARD\nFN:Sem fim").length, 0, "cartão sem END é descartado");
{
  // arquivo grande: 10 mil contatos
  const big = Array.from({ length: 10_000 }, (_, i) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pessoa ${i}\r\nTEL:11 9${String(10000000 + i).slice(-8)}\r\nEND:VCARD`).join("\r\n");
  const t0 = Date.now();
  const l = parseVcf(big);
  eq(l.length, 10_000, "10 mil cartões");
  ok(Date.now() - t0 < 4000, "10 mil cartões em menos de 4 s");
}

/* ------------------------------ CSV ------------------------------ */
const gEn = ['First Name,Middle Name,Last Name,Organization Name,Organization Title,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value,Address 1 - Formatted,Address 1 - City,Address 1 - Region', 'João,,Silva,Paróquia X,Pároco,Cliente,* myContacts,Home,joao@example.test,Mobile,+55 11 99999-0002,Work,(11) 3333-1111 ::: 11 3333-2222,"Rua A, 1",Itu,SP', ',,,,,,,,,,,,,,,'].join("\n");
{
  const p = readCsv(gEn);
  eq(p.roles, ["nome_proprio", "nome_meio", "sobrenome", "empresa", "cargo", "observacoes", "ignorar", "ignorar", "email", "ignorar", "telefone", "ignorar", "telefone", "endereco", "cidade", "estado"], "Google EN: papéis");
  const l = csvToRaw(p.rows, p.roles);
  eq(l.length, 1, "linha vazia ignorada");
  eq(l[0].name, "João Silva", "Google EN nome");
  eq(l[0].phones.map((x) => x.value), ["+55 11 99999-0002", "(11) 3333-1111", "11 3333-2222"], "Google EN: telefones (com :::)");
  eq([l[0].company, l[0].role, l[0].city, l[0].state], ["Paróquia X", "Pároco", "Itu", "SP"], "Google EN campos");
}
const gPt = ["Nome,Sobrenome,Nome da organização,Cargo da organização,Observações,E-mail 1 - Rótulo,E-mail 1 - Valor,Telefone 1 - Rótulo,Telefone 1 - Valor", "Maria,Souza,Construtora Y,Eng.,,Trabalho,maria@example.test,Celular,11 98888-1111"].join("\n");
{
  const p = readCsv(gPt);
  eq(p.roles, ["nome_proprio", "sobrenome", "empresa", "cargo", "observacoes", "ignorar", "email", "ignorar", "telefone"], "Google PT: papéis");
  const [c] = csvToRaw(p.rows, p.roles);
  eq([c.name, c.company, c.role, c.emails[0]], ["Maria Souza", "Construtora Y", "Eng.", "maria@example.test"], "Google PT dados");
}
{
  const p = readCsv("Name;Mobile Phone;E-mail Address;Company\nPedro Rocha;(21) 99999-1234;pedro@example.test;Igreja Z");
  eq(p.roles, ["nome", "telefone", "email", "empresa"], "Outlook com ponto e vírgula");
  eq(csvToRaw(p.rows, p.roles)[0].name, "Pedro Rocha", "Outlook nome");
  eq(mapProblems(["ignorar", "ignorar"]).length, 2, "mapeamento sem nome nem telefone");
  eq(mapProblems(p.roles), [], "mapeamento ok");
  eq(guessRole("Celular"), "telefone", "Celular");
  eq(guessRole("Foto"), "ignorar", "Foto");
}
{
  const [c] = csvToRaw([['"Aspas, vírgula', "11 97777-1111"]], ["nome", "telefone"]);
  eq(c.name, '"Aspas, vírgula', "linha manual");
  const p = readCsv('Nome,Telefone\n"Silva, João",11977771111\n');
  eq(csvToRaw(p.rows, p.roles)[0].name, "Silva, João", "CSV com aspas e vírgula");
}

/* ------------------------------ candidatos, duplicados, mesclagem ------------------------------ */
const ex = (o: Partial<Existing>): Existing => ({ id: "e1", name: "Existente", phone: null, email: null, externalId: null, company: null, role: null, address: null, city: null, state: null, notes: null, tags: [], ...o });
const cand = (name: string, phone: string | null, email?: string, extra: Record<string, unknown> = {}) =>
  buildCandidate({ name, phones: phone ? [{ value: phone }] : [], emails: email ? [email] : [], ...extra }, name + phone);
{
  const list = [
    cand("Novo Um", "11 99999-1000"),
    cand("Dup Fone", "(11) 9999-2000"), // existente tem com 9º dígito
    cand("Dup Email", null, "dup@example.test"),
    cand("Repetido A", "11 99999-3000"),
    cand("Repetido B", "11 99999-3000"),
    cand("Só Email", null, "so@example.test"),
    cand("Sem Nada", null),
    cand("Tel Ruim", "123"),
    cand("Fixo", "11 3333-4000"),
    cand("", "11 99999-5000"), // sem nome
    cand("Via Google", "11 99999-6000", undefined, { externalId: "g:x:people/c1" }),
  ];
  const idx = buildIndex([
    ex({ id: "a", phone: "5511999992000" }),
    ex({ id: "b", email: "dup@example.test" }),
    ex({ id: "c", externalId: "g:x:people/c1", phone: "5511000000000" }),
  ]);
  const cl = classify(list, idx, DEFAULT_FILTERS);
  eq(cl.map((x) => x.status), ["novo", "duplicado", "duplicado", "novo", "repetido", "sem_telefone", "sem_telefone", "invalido", "novo", "filtrado", "duplicado"], "classificação");
  eq(cl[1].match?.by, "telefone", "duplicado por telefone (9º dígito)");
  eq(cl[2].match?.by, "e-mail", "duplicado por e-mail");
  eq(cl[10].match?.by, "google", "duplicado por id do Google");
  eq(countByStatus(cl).novo, 3, "contagem de novos");
  const cl2 = classify(list, idx, { ...DEFAULT_FILTERS, onlyBrMobile: true });
  eq(cl2[8].status, "filtrado", "filtro só celular tira o fixo");
  const cl3 = classify(list, idx, { ...DEFAULT_FILTERS, ignoreLandline: true, ignoreUnnamed: false });
  eq([cl3[8].status, cl3[9].status], ["filtrado", "novo"], "ignorar fixos e sem-nome opcional");
}
{
  const c = cand("Maria", "11 99999-7000", "maria@example.test", { company: "Empresa X", role: "Dona", notes: "Obs nova" });
  c.extraPhones = ["551133334444"];
  c.extraEmails = ["m2@example.test"];
  const e = ex({ phone: "5511999997000", company: "Já Tinha", notes: "Antiga", tags: ["velha"] });
  eq(mergePatch(e, c, "pular", "L"), {}, "pular não mexe");
  eq(mergePatch(e, c, "completar", "L"), { email: "maria@example.test", role: "Dona" }, "completar só campos vazios");
  const m = mergePatch(e, c, "mesclar", "L");
  eq([m.email, m.role, m.company], ["maria@example.test", "Dona", undefined], "mesclar não sobrescreve empresa");
  ok(m.notes?.startsWith("Antiga\nObs nova") && m.notes.includes("Outros telefones: (11) 3333-4444") && m.notes.includes("m2@example.test"), "mesclar junta notas e extras");
  eq(m.tags, ["velha", "L"], "mesclar aplica etiqueta");
  eq(mergePatch(ex({ externalId: null }), { ...c, externalId: "g:x:1" }, "pular", "L"), { externalId: "g:x:1" }, "pular só liga ao Google");
  eq(mergePatch(e, { ...c, phone: "5511999997000" }, "completar", "L").phone, undefined, "telefone igual não muda");
}
{
  const s = sanitizeCandidate({ name: "  JOSÉ  ", phone: "(11) 99999-0000", email: " A@B.CO ", extraPhones: ["x"], state: "são paulo" } as any, 0);
  eq([s.name, s.phone, s.email, s.state], ["José", "5511999990000", "a@b.co", "SP"], "servidor revalida o que vem do navegador");
  const forged = sanitizeCandidate({ name: "X", phone: "5511999990000; DROP TABLE" } as any, 1);
  eq(forged.phone, "5511999990000", "dígitos extras de texto são descartados");
}
eq(defaultLabel("WhatsApp", new Date("2026-11-02T15:00:00Z")), "Importado do WhatsApp em 02/11", "etiqueta padrão");

/* ------------------------------ despacho do state (sem regressão) ------------------------------ */
eq(callbackTarget("cal:abc"), "agenda", "state cal:");
eq(callbackTarget("ppl:abc"), "contatos", "state ppl:");
eq(callbackTarget("Zm9vYmFy"), "drive", "state do Drive");
eq(callbackTarget(null), "drive", "sem state → Drive");
eq(callbackTarget("calx"), "drive", "prefixo parecido não conta");
eq(cookieMatchesState("a=1; ppl_oauth_state=ppl%3Aabc; b=2", "ppl_oauth_state", "ppl:abc"), true, "cookie com %3A confere");
eq(cookieMatchesState("ppl_oauth_state=ppl%3Aabc", "ppl_oauth_state", "ppl:outro"), false, "state diferente (CSRF)");
eq(cookieMatchesState("x=1", "ppl_oauth_state", "ppl:abc"), false, "sem cookie");
eq(cookieMatchesState("xppl_oauth_state=ppl%3Aabc", "ppl_oauth_state", "ppl:abc"), false, "nome de cookie parcial não vale");
{
  // a rota do Drive desvia por prefixo, na ordem: cal: → ppl: → fluxo do Drive intacto
  const fs = await import("node:fs");
  const route = fs.readFileSync("src/app/api/drive/callback/route.ts", "utf8");
  const iCal = route.indexOf("isCalendarState(");
  const iPpl = route.indexOf("isContactsState(");
  const iDrive = route.indexOf("drive_oauth_state");
  ok(iCal > 0 && iPpl > iCal && iDrive > iPpl, "rota /api/drive/callback: cal:, depois ppl:, depois Drive");
  ok(route.includes("saveConnection(tokens, user.id, email)") && route.includes("erro=estado"), "fluxo do Drive preservado");
}

/* ------------------------------ People API (Google mockado) ------------------------------ */
const jres = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
{
  const person = { resourceName: "people/c1", names: [{ displayName: "Ana Lima", givenName: "Ana", familyName: "Lima" }], phoneNumbers: [{ value: "(11) 99999-0001", canonicalForm: "+5511999990001", type: "mobile" }], emailAddresses: [{ value: "ana@example.test" }], organizations: [{ name: "Igreja Z", title: "Ecônoma" }], addresses: [{ formattedValue: "Rua A\nItu", city: "Itu", region: "SP" }], biographies: [{ value: "nota" }] };
  const r = personToRaw(person, "abc12345")!;
  eq([r.externalId, r.name, r.phones[0].value, r.company, r.role, r.address, r.city, r.notes], ["g:abc12345:people/c1", "Ana Lima", "+5511999990001", "Igreja Z", "Ecônoma", "Rua A, Itu", "Itu", "nota"], "People → contato");
  eq(personToRaw({ resourceName: "people/c2", metadata: { deleted: true } }, "s")?.deleted, true, "apagado marcado");
  eq(personToRaw({}, "s"), null, "sem resourceName");
  const cand1 = buildCandidate(r, "k");
  eq([cand1.phone, cand1.email, cand1.name], ["5511999990001", "ana@example.test", "Ana Lima"], "People → candidato");
}
{
  // paginação + syncToken
  const calls: string[] = [];
  const pages: Record<string, ConnectionsPage> = {
    "": { connections: [{ resourceName: "people/c1" }], nextPageToken: "p2" },
    p2: { connections: [{ resourceName: "people/c2" }], nextSyncToken: "SYNC1" },
  };
  const client = createPeopleClient({
    getToken: async () => "tok",
    fetchImpl: (async (url: string, init: any) => {
      calls.push(String(url));
      eq(init.headers.authorization, "Bearer tok", "envia o token");
      const u = new URL(String(url));
      return jres(200, pages[u.searchParams.get("pageToken") ?? ""]);
    }) as any,
  });
  const a = await client.listConnections({});
  const b = await client.listConnections({ pageToken: a.nextPageToken });
  eq([a.nextPageToken, b.nextSyncToken], ["p2", "SYNC1"], "paginação e syncToken");
  const u0 = new URL(calls[0]);
  eq([u0.searchParams.get("personFields"), u0.searchParams.get("pageSize"), u0.searchParams.get("requestSyncToken")], ["names,phoneNumbers,emailAddresses,organizations,addresses,biographies,metadata", "1000", "true"], "parâmetros da lista");
  await client.listConnections({ syncToken: "SYNC1" });
  eq(new URL(calls[2]).searchParams.get("syncToken"), "SYNC1", "usa o syncToken");
}
{
  // backoff em 429/5xx
  let k = 0;
  const waits: number[] = [];
  const c = createPeopleClient({ getToken: async () => "t", sleep: async (ms) => void waits.push(ms), fetchImpl: (async () => (++k < 3 ? jres(k === 1 ? 429 : 503, { error: { message: "x" } }) : jres(200, { connections: [] }))) as any });
  await c.listConnections({});
  eq([k, waits.length], [3, 2], "repete após 429 e 503");
  ok(waits[1] > waits[0], "espera crescente");
  let k2 = 0;
  const c2 = createPeopleClient({ getToken: async () => "t", sleep: async () => {}, maxAttempts: 3, fetchImpl: (async () => (++k2, jres(429, { error: { message: "x" } }, { "retry-after": "2" }))) as any });
  let err: any;
  await c2.listConnections({}).catch((e) => (err = e));
  eq([k2, err?.kind], [3, "limite"], "desiste depois do máximo de tentativas");
}
{
  // erros: People API desativada, 410/400 token expirado, 401
  const disabled = { error: { code: 403, message: "People API has not been used in project 123 before or it is disabled.", status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }], errors: [{ reason: "accessNotConfigured" }] } };
  const c = createPeopleClient({ getToken: async () => "t", fetchImpl: (async () => jres(403, disabled)) as any });
  let err: any;
  await c.listConnections({}).catch((e) => (err = e));
  ok(err instanceof PeopleError, "erro tipado");
  eq(err.kind, "api_desativada", "accessNotConfigured");
  ok(/People API do Google ainda não foi ativada pelo administrador/.test(friendlyPeopleError(err).message), "mensagem amigável");
  const c403b = createPeopleClient({ getToken: async () => "t", fetchImpl: (async () => jres(403, { error: { message: "Google People API has not been used in project 9 before", status: "PERMISSION_DENIED" } })) as any });
  await c403b.listConnections({}).catch((e) => (err = e));
  eq(err.kind, "api_desativada", "403 só pela mensagem");
  eq(classifyPeople(400, "EXPIRED_SYNC_TOKEN", "Sync token is expired. Clear sync state and retry."), "sync_expirado", "token expirado (400)");
  eq(classifyPeople(410, "", ""), "sync_expirado", "token expirado (410)");
  eq(classifyPeople(401, "", ""), "reautorizar", "401");
  eq(classifyPeople(403, "forbidden", "x"), "sem_permissao", "403 comum");
  eq(classifyPeople(500, "", ""), "outro", "500");
}

if (process.argv.includes("--db")) await dbTests();
}

/* ------------------------------ banco (opcional) ------------------------------ */
async function dbTests() {
  const { eq: deq, like, or, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("../src/lib/db");
  const svc = await import("../src/lib/contacts-import/service");
  const { hashPassword } = await import("../src/lib/password");
  const { encryptToken } = await import("../src/lib/drive/crypto");
  const crypto = await import("node:crypto");
  process.env.DRIVE_TOKEN_KEY ??= "qa-key";

  const EMAIL = "qa-contacts-import@example.test";
  const QA = "QA-import";
  const cleanup = async () => {
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(deq(schema.users.email, EMAIL));
    const batches = u ? await db.select({ id: schema.contactImports.id }).from(schema.contactImports).where(deq(schema.contactImports.userId, u.id)) : [];
    if (batches.length) await db.delete(schema.contacts).where(inArray(schema.contacts.importBatchId, batches.map((b) => b.id)));
    await db.delete(schema.contacts).where(or(deq(schema.contacts.source, QA), like(schema.contacts.email, "%@qa-import.example.test"), like(schema.contacts.phone, "559990000%")));
    if (u) {
      await db.delete(schema.contactImports).where(deq(schema.contactImports.userId, u.id));
      await db.delete(schema.auditLog).where(deq(schema.auditLog.actorId, u.id));
      await db.delete(schema.users).where(deq(schema.users.id, u.id)); // conexão e pendentes saem em cascata
    }
  };
  {
{
  const { isCalendarState } = await import("../src/lib/calendar/callback");
  const { isContactsState } = await import("../src/lib/contacts-import/callback");
  eq([isCalendarState("cal:1"), isContactsState("cal:1")], [true, false], "cal: só da Agenda");
  eq([isCalendarState("ppl:1"), isContactsState("ppl:1")], [false, true], "ppl: só de Contatos");
  eq([isCalendarState("drive"), isContactsState("drive")], [false, false], "Drive não é desviado");
  const g = await import("../src/lib/contacts-import/google");
  process.env.GOOGLE_CLIENT_ID ??= "id";
  process.env.GOOGLE_CLIENT_SECRET ??= "secret";
  const u = new URL(g.contactsAuthUrl("https://x/api/drive/callback", "ppl:1"));
  eq(u.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/contacts.readonly", "escopo somente leitura");
  eq(u.searchParams.get("redirect_uri"), "https://x/api/drive/callback", "reutiliza a URI já autorizada");
  eq(g.hasContactsScope("openid email https://www.googleapis.com/auth/contacts.readonly"), true, "tem escopo");
  eq(g.hasContactsScope("openid email"), false, "sem escopo");
}


  }
  await cleanup();
  try {
    const [u] = await db.insert(schema.users).values({ name: "QA Importação", email: EMAIL, passwordHash: hashPassword(crypto.randomBytes(9).toString("base64url")), role: "admin", profile: "administrador", calendarToken: crypto.randomBytes(12).toString("hex") }).returning({ id: schema.users.id });
    const actor = { id: u.id, name: "QA Importação" };
    const ph = (i: number) => `5599900000${String(i).padStart(3, "0")}`;
    const mk = (i: number, extra: Record<string, unknown> = {}) => buildCandidate({ name: `QA Pessoa ${i}`, phones: [{ value: ph(i) }], emails: [`p${i}@qa-import.example.test`], ...extra }, String(i));

    // contatos preexistentes (nunca devem ser removidos pelo "desfazer")
    const [pre] = await db.insert(schema.contacts).values({ name: "QA Preexistente", phone: ph(1), source: QA, notes: "minha nota" }).returning({ id: schema.contacts.id });
    const [pre2] = await db.insert(schema.contacts).values({ name: "QA Preexistente 2", email: "p2@qa-import.example.test", source: QA, company: "Empresa Antiga" }).returning({ id: schema.contacts.id });

    const exists = await svc.existingFor([mk(1), mk(2), mk(3)]);
    eq(exists.map((e) => e.id).sort(), [pre.id, pre2.id].sort(), "existingFor acha por telefone e por e-mail");

    // lote 1: modo "completar"
    const b = await svc.startBatch(actor, { kind: "arquivo", source: "WhatsApp", label: "QA lote 1", dupMode: "completar", total: 5 });
    const items = [1, 2, 3, 4, 5].map((i) => mk(i, i === 2 ? { company: "Nova Empresa" } : {}));
    const r1 = await svc.importChunk(actor, b.id, null, items);
    eq(r1, { created: 3, updated: 2, skipped: 0 }, "lote 1: 3 criados, 2 completados");
    // reimportar o mesmo trecho: idempotente, nada duplica
    const r1b = await svc.importChunk(actor, b.id, null, items);
    ok("created" in r1b && r1b.created === 0, "reimportar não cria duplicados");
    const rows = await db.select().from(schema.contacts).where(like(schema.contacts.email, "%@qa-import.example.test"));
    eq(rows.length, 5, "5 contatos com e-mail QA (3 novos + 2 preexistentes)");
    const [p1] = await db.select().from(schema.contacts).where(deq(schema.contacts.id, pre.id));
    eq([p1.name, p1.notes, p1.email], ["QA Preexistente", "minha nota", "p1@qa-import.example.test"], "completar preenche vazio e preserva o resto");
    const [p2] = await db.select().from(schema.contacts).where(deq(schema.contacts.id, pre2.id));
    eq([p2.company, p2.phone], ["Empresa Antiga", ph(2)], "completar não sobrescreve empresa e põe o telefone");
    eq(p2.importBatchId, null, "preexistente não é vinculado ao lote");
    const created = rows.filter((r) => r.importBatchId === b.id);
    eq([created.length, created[0].source, created[0].tags], [3, "WhatsApp", ["QA lote 1"]], "novos ligados ao lote com origem e etiqueta");
    const fin = await svc.finishBatch(actor, b.id, {});
    ok(!("error" in fin) && fin.batch.status === "concluido" && fin.batch.created === 3, "lote concluído com contagens");

    // um contato do lote ganha negócio: desfazer deve mantê-lo
    const keep = created[0];
    const [stage] = await db.select().from(schema.stages).limit(1);
    const [deal] = await db.insert(schema.deals).values({ title: "QA — negócio import", contactId: keep.id, stageId: stage.id, ownerId: u.id }).returning({ id: schema.deals.id });
    const und = await svc.undoBatch({ ...actor, canManage: true }, b.id);
    eq(und, { removed: 2, kept: 1 }, "desfazer remove só os sem negócio");
    const still = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(inArray(schema.contacts.id, [pre.id, pre2.id]));
    eq(still.length, 2, "preexistentes intactos após desfazer");
    const again = await svc.undoBatch({ ...actor, canManage: true }, b.id);
    ok("error" in again, "desfazer duas vezes é recusado");
    await db.delete(schema.deals).where(deq(schema.deals.id, deal.id));
    await db.delete(schema.contacts).where(deq(schema.contacts.id, keep.id));

    // lote 2: modo "pular" e "mesclar"
    const b2 = await svc.startBatch(actor, { kind: "arquivo", source: "Importação", label: "QA lote 2", dupMode: "pular", total: 2 });
    const r2 = await svc.importChunk(actor, b2.id, null, [mk(1, { company: "Outra" }), mk(10)]);
    eq(r2, { created: 1, updated: 0, skipped: 1 }, "pular: 1 novo, 1 ignorado");
    const [p1b] = await db.select().from(schema.contacts).where(deq(schema.contacts.id, pre.id));
    eq(p1b.company, null, "pular não alterou o existente");
    const b3 = await svc.startBatch(actor, { kind: "arquivo", source: "Importação", label: "QA lote 3", dupMode: "mesclar", total: 1 });
    const c1 = mk(1, { company: "Outra", notes: "nota do arquivo" });
    c1.extraPhones = ["551133334444"];
    await svc.importChunk(actor, b3.id, null, [c1]);
    const [p1c] = await db.select().from(schema.contacts).where(deq(schema.contacts.id, pre.id));
    eq([p1c.company, p1c.tags.includes("QA lote 3"), (p1c.notes ?? "").includes("minha nota") && (p1c.notes ?? "").includes("nota do arquivo") && (p1c.notes ?? "").includes("(11) 3333-4444")], ["Outra", true, true], "mesclar completa, junta notas e etiqueta");
    ok("error" in (await svc.importChunk({ id: "00000000-0000-0000-0000-000000000000", name: "x" }, b2.id, null, [mk(11)])), "outro usuário não escreve no lote");
    ok("error" in (await svc.importChunk(actor, b2.id, null, Array.from({ length: 200 }, (_, i) => mk(i)))), "trecho acima do limite é recusado");

    // sincronização com Google mockado
    const [conn] = await db.insert(schema.contactConnections).values({ userId: u.id, googleEmail: "qa@example.test", accessTokenEnc: encryptToken("a"), refreshTokenEnc: encryptToken("r"), expiresAt: new Date(Date.now() + 3600_000), scope: "contacts.readonly", syncToken: "S0", status: "ativo", autoSync: true, autoMode: "confirmar" }).returning();
    const scope = svc.scopeOf(u.id);
    const gp = (i: number, extra: Record<string, unknown> = {}) => ({ resourceName: `people/qa${i}`, names: [{ displayName: `QA Google ${i}` }], phoneNumbers: [{ canonicalForm: `+${ph(100 + i)}` }], emailAddresses: [{ value: `g${i}@qa-import.example.test` }], ...extra });
    const seen: any[] = [];
    const fakeClient = (pagesFn: (o: any) => ConnectionsPage | PeopleError) => ({
      listConnections: async (o: any) => {
        seen.push(o);
        const r = pagesFn(o);
        if (r instanceof PeopleError) throw r;
        return r;
      },
    });
    const s1 = await svc.syncConnection(conn.id, { client: fakeClient(() => ({ connections: [gp(1), gp(2), { resourceName: "people/gone", metadata: { deleted: true } }], nextSyncToken: "S1" })) as any });
    eq([s1.ok, s1.fetched, s1.pending, s1.created], [true, 2, 2, 0], "sync: novos ficam pendentes (confirmar)");
    eq(seen[0].syncToken, "S0", "sync usa o syncToken salvo");
    eq((await svc.pendingCount(u.id)), 2, "2 pendentes");
    const nobody = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(like(schema.contacts.email, "g1@%"));
    eq(nobody.length, 0, "pendente ainda não virou contato");
    const s1b = await svc.syncConnection(conn.id, { client: fakeClient(() => ({ connections: [gp(1), gp(2)], nextSyncToken: "S2" })) as any });
    eq(await svc.pendingCount(u.id), 2, "sync repetido não duplica pendentes");
    ok(s1b.ok, "sync repetido ok");
    eq((await svc.listPending(u.id)).length, 2, "listPending");

    // modo direto + alterados + apagados no Google
    await db.update(schema.contactConnections).set({ autoMode: "direto" }).where(deq(schema.contactConnections.id, conn.id));
    await db.delete(schema.contactPending).where(deq(schema.contactPending.connectionId, conn.id));
    const s2 = await svc.syncConnection(conn.id, { client: fakeClient(() => ({ connections: [gp(1), gp(3), { resourceName: "people/qa3", metadata: { deleted: true } }], nextSyncToken: "S3" })) as any });
    eq([s2.created, s2.pending], [2, 0], "sync direto cria os novos");
    const g1 = await db.select().from(schema.contacts).where(deq(schema.contacts.externalId, `g:${scope}:people/qa1`));
    eq([g1.length, g1[0]?.source], [1, "Google Contatos"], "contato do Google com externalId e origem");
    const before = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(like(schema.contacts.email, "%@qa-import.example.test"));
    const s3 = await svc.syncConnection(conn.id, { client: fakeClient(() => ({ connections: [{ resourceName: "people/qa1", metadata: { deleted: true } }], nextSyncToken: "S4" })) as any });
    const after = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(like(schema.contacts.email, "%@qa-import.example.test"));
    eq([s3.ok, after.length], [true, before.length], "contato apagado no Google NÃO é apagado no CRM");
    // alterado no Google: completa campos vazios
    await svc.syncConnection(conn.id, { client: fakeClient(() => ({ connections: [gp(1, { organizations: [{ name: "Org Nova" }] })], nextSyncToken: "S5" })) as any });
    const [g1b] = await db.select().from(schema.contacts).where(deq(schema.contacts.externalId, `g:${scope}:people/qa1`));
    eq(g1b.company, "Org Nova", "alteração no Google completa campo vazio");

    // token expirado (410/400): recomeça a leitura completa, sem duplicar
    let first = true;
    const s4 = await svc.syncConnection(conn.id, {
      client: fakeClient((o) => {
        if (first) {
          first = false;
          return new PeopleError(400, "EXPIRED_SYNC_TOKEN", "expired", "sync_expirado");
        }
        eq(o.syncToken ?? null, null, "após expirar, lê tudo sem syncToken");
        return { connections: [gp(1), gp(3), gp(4)], nextSyncToken: "S6" };
      }) as any,
    });
    eq([s4.ok, s4.created], [true, 1], "token expirado: refaz a leitura e só cria o realmente novo");
    const [cn] = await db.select().from(schema.contactConnections).where(deq(schema.contactConnections.id, conn.id));
    eq(cn.syncToken, "S6", "novo syncToken salvo");

    // People API desativada: erro amigável e conexão marcada
    const s5 = await svc.syncConnection(conn.id, { client: fakeClient(() => new PeopleError(403, "accessNotConfigured", "People API has not been used", "api_desativada")) as any });
    eq([s5.ok, s5.kind], [false, "api_desativada"], "sync com People API desativada");
    ok(/People API do Google ainda não foi ativada pelo administrador/.test(s5.error ?? ""), "mensagem amigável no resultado");
    const [cn2] = await db.select().from(schema.contactConnections).where(deq(schema.contactConnections.id, conn.id));
    eq(cn2.syncToken, "S6", "falha não perde o syncToken");
    // sem importação inicial
    await db.update(schema.contactConnections).set({ syncToken: null, status: "ativo" }).where(deq(schema.contactConnections.id, conn.id));
    eq((await svc.syncConnection(conn.id, { client: fakeClient(() => ({})) as any })).skipped, "sem_importacao_inicial", "sync exige importação inicial");
  } finally {
    await cleanup();
    const left = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(or(deq(schema.contacts.source, QA), like(schema.contacts.email, "%@qa-import.example.test")));
    eq(left.length, 0, "limpeza do QA");
  }
}

main().then(() => {
console.log(fail ? `\n${fail} falha(s) em ${n} verificações` : `\nOK — ${n} verificações`);
process.exit(fail ? 1 : 0);
}, (e) => {
  console.error(e);
  process.exit(1);
});
