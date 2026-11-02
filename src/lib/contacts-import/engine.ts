import { parsePhone, phoneKey, pickPhones } from "./phone";
import { clean, tidyEmail, tidyName } from "./text";
import type { Candidate, DupMode, Existing, RawContact, Status } from "./types";

/** Núcleo puro da importação: normaliza, filtra, detecta duplicados e mescla. Roda no navegador (prévia) e no servidor (gravação). */

export const MAX_FIELD = 400;
const cut = (s: string | null, n = MAX_FIELD) => (s && s.length > n ? s.slice(0, n) : s);

/** Telefone BR legível para observações: 5511999990000 → (11) 99999-0000 */
export function showPhone(p: string): string {
  const m = p.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${p}`;
}

const UF: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
export function toUf(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const k = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return UF[k] ?? null;
}

export function buildCandidate(raw: RawContact, key: string): Candidate {
  const { primary, extras, invalid } = pickPhones(raw.phones.map((p) => p.value));
  const emails = [...new Set(raw.emails.map(tidyEmail).filter((e): e is string => !!e))];
  const company = clean(raw.company);
  let name = tidyName(raw.name || [raw.givenName, raw.familyName].filter(Boolean).join(" "));
  let nameGuessed = false;
  if (!name) {
    nameGuessed = true;
    name = tidyName(company) || (primary?.e164 ? showPhone(primary.e164) : emails[0] ?? "Sem nome");
  }
  return {
    key,
    externalId: raw.externalId,
    name: cut(name)!,
    nameGuessed: nameGuessed || undefined,
    phone: primary?.e164 ?? null,
    phoneKind: primary ? primary.kind : invalid.length ? "invalido" : "nenhum",
    extraPhones: extras,
    badPhones: invalid,
    email: emails[0] ?? null,
    extraEmails: emails.slice(1),
    company: cut(company),
    role: cut(clean(raw.role)),
    address: cut(clean(raw.address)),
    city: cut(clean(raw.city)),
    state: toUf(raw.state),
    notes: cut(raw.notes?.trim() || null, 2000),
    isOrg: raw.isOrg || undefined,
  };
}

/** Revalida um candidato vindo do cliente (o servidor nunca confia no que o navegador mandou). */
export function sanitizeCandidate(c: Partial<Candidate> & { key?: string }, i: number): Candidate {
  const phones = [c.phone, ...(c.extraPhones ?? [])].filter((x): x is string => !!x);
  const raw: RawContact = {
    externalId: typeof c.externalId === "string" ? c.externalId.slice(0, 200) : undefined,
    name: String(c.name ?? "").slice(0, MAX_FIELD),
    phones: phones.slice(0, 10).map((v) => ({ value: String(v).slice(0, 40) })),
    emails: [c.email, ...(c.extraEmails ?? [])].filter((x): x is string => !!x).slice(0, 10).map((x) => String(x).slice(0, 200)),
    company: c.company ?? undefined,
    role: c.role ?? undefined,
    address: c.address ?? undefined,
    city: c.city ?? undefined,
    state: c.state ?? undefined,
    notes: c.notes ?? undefined,
    isOrg: c.isOrg,
  };
  const b = buildCandidate(raw, String(c.key ?? i));
  b.nameGuessed = c.nameGuessed;
  b.badPhones = (c.badPhones ?? []).slice(0, 10).map((x) => String(x).slice(0, 40));
  if (!b.phone && b.badPhones.length) b.phoneKind = "invalido";
  return b;
}

/** Observações do contato novo: notas do cartão + telefones/e-mails extras. */
export function composeNotes(c: Candidate, label?: string): string | null {
  const parts: string[] = [];
  if (c.notes) parts.push(c.notes);
  const extra: string[] = [];
  if (c.extraPhones.length) extra.push(`Outros telefones: ${c.extraPhones.map(showPhone).join(", ")}`);
  if (c.extraEmails.length) extra.push(`Outros e-mails: ${c.extraEmails.join(", ")}`);
  if (c.badPhones.length) extra.push(`Telefone não reconhecido: ${c.badPhones.join(", ")}`);
  if (extra.length) parts.push(extra.join(" · "));
  void label;
  return parts.length ? parts.join("\n") : null;
}

/* ------------------------------ filtros ------------------------------ */

export type Filters = {
  /** só importa quem tem celular brasileiro */
  onlyBrMobile: boolean;
  /** ignora números fixos (sem exigir celular) */
  ignoreLandline: boolean;
  /** ignora cartões de organização/grupo sem nome de pessoa */
  ignoreUnnamed: boolean;
};
export const DEFAULT_FILTERS: Filters = { onlyBrMobile: false, ignoreLandline: false, ignoreUnnamed: true };

export function passesFilters(c: Candidate, f: Filters): boolean {
  if (f.ignoreUnnamed && c.nameGuessed) return false;
  if (f.onlyBrMobile && c.phoneKind !== "celular") return false;
  if (f.ignoreLandline && c.phoneKind === "fixo") return false;
  return true;
}

/* ------------------------------ duplicados ------------------------------ */

export type Index = {
  byPhone: Map<string, Existing>;
  byEmail: Map<string, Existing>;
  byExternal: Map<string, Existing>;
};

export function buildIndex(list: Existing[]): Index {
  const idx: Index = { byPhone: new Map(), byEmail: new Map(), byExternal: new Map() };
  for (const e of list) addToIndex(idx, e);
  return idx;
}
export function addToIndex(idx: Index, e: Existing) {
  const k = phoneKey(e.phone);
  if (k && !idx.byPhone.has(k)) idx.byPhone.set(k, e);
  const m = e.email?.trim().toLowerCase();
  if (m && !idx.byEmail.has(m)) idx.byEmail.set(m, e);
  if (e.externalId && !idx.byExternal.has(e.externalId)) idx.byExternal.set(e.externalId, e);
}

export type Match = { existing: Existing; by: "google" | "telefone" | "e-mail" };

export function findMatch(idx: Index, c: Candidate, extId?: string | null): Match | null {
  const ext = extId ?? c.externalId;
  if (ext) {
    const e = idx.byExternal.get(ext);
    if (e) return { existing: e, by: "google" };
  }
  for (const p of [c.phone, ...c.extraPhones]) {
    const k = phoneKey(p);
    const e = k ? idx.byPhone.get(k) : undefined;
    if (e) return { existing: e, by: "telefone" };
  }
  for (const m of [c.email, ...c.extraEmails]) {
    const e = m ? idx.byEmail.get(m) : undefined;
    if (e) return { existing: e, by: "e-mail" };
  }
  return null;
}

export type Classified = { c: Candidate; status: Status; match?: Match; reason?: string };

/** Classifica cada candidato: novo, duplicado (no CRM), repetido (no próprio arquivo), sem telefone, inválido ou filtrado. */
export function classify(cands: Candidate[], idx: Index, filters: Filters = DEFAULT_FILTERS, externalOf?: (c: Candidate) => string | undefined): Classified[] {
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();
  const out: Classified[] = [];
  for (const c of cands) {
    if (!passesFilters(c, filters)) {
      out.push({ c, status: "filtrado", reason: c.nameGuessed ? "sem nome" : c.phoneKind === "fixo" ? "telefone fixo" : "não é celular brasileiro" });
      continue;
    }
    const match = findMatch(idx, c, externalOf?.(c));
    if (match) {
      out.push({ c, status: "duplicado", match, reason: `já existe (${match.by})` });
      continue;
    }
    const kp = [c.phone, ...c.extraPhones].map(phoneKey).filter((x): x is string => !!x);
    const ke = [c.email, ...c.extraEmails].filter((x): x is string => !!x);
    if (kp.some((k) => seenPhone.has(k)) || ke.some((k) => seenEmail.has(k))) {
      out.push({ c, status: "repetido", reason: "aparece mais de uma vez na lista" });
      continue;
    }
    if (!c.phone) {
      if (c.badPhones.length && !c.email) out.push({ c, status: "invalido", reason: `telefone não reconhecido: ${c.badPhones[0]}` });
      else out.push({ c, status: "sem_telefone", reason: c.email ? "só tem e-mail" : "sem telefone nem e-mail" });
      if (c.email) {
        for (const k of ke) seenEmail.add(k);
      }
      continue;
    }
    kp.forEach((k) => seenPhone.add(k));
    ke.forEach((k) => seenEmail.add(k));
    out.push({ c, status: "novo" });
  }
  return out;
}

export function countByStatus(list: Classified[]): Record<Status, number> {
  const r: Record<Status, number> = { novo: 0, duplicado: 0, sem_telefone: 0, invalido: 0, repetido: 0, filtrado: 0 };
  for (const x of list) r[x.status]++;
  return r;
}

/* ------------------------------ mesclagem ------------------------------ */

export type Patch = Partial<{
  phone: string;
  email: string;
  company: string;
  role: string;
  address: string;
  city: string;
  state: string;
  notes: string;
  externalId: string;
  tags: string[];
}>;

/** Calcula o que mudar em um contato existente. Nunca apaga nem sobrescreve valor já preenchido. */
export function mergePatch(e: Existing, c: Candidate, mode: DupMode, label: string): Patch {
  const p: Patch = {};
  if (e.externalId == null && c.externalId) p.externalId = c.externalId; // só liga ao Google; não altera dados
  if (mode === "pular") return p;
  const fill = (k: "phone" | "email" | "company" | "role" | "address" | "city" | "state", v: string | null) => {
    if (v && !(e[k] ?? "").toString().trim()) p[k] = v;
  };
  fill("phone", c.phone);
  fill("email", c.email);
  fill("company", c.company);
  fill("role", c.role);
  fill("address", c.address);
  fill("city", c.city);
  fill("state", c.state);
  if (mode === "completar") {
    if (c.notes && !(e.notes ?? "").trim()) p.notes = c.notes;
    return p;
  }
  // mesclar: junta o que sobrou nas observações e aplica a etiqueta
  const have = e.notes ?? "";
  const add: string[] = [];
  if (c.notes && !have.includes(c.notes)) add.push(c.notes);
  const missingPhones = [c.phone && phoneKey(c.phone) !== phoneKey(e.phone) && !p.phone ? c.phone : null, ...c.extraPhones].filter((x): x is string => !!x && !have.includes(showPhone(x)));
  if (missingPhones.length) add.push(`Outros telefones: ${[...new Set(missingPhones.map(showPhone))].join(", ")}`);
  const missingMails = [c.email && c.email !== e.email && !p.email ? c.email : null, ...c.extraEmails].filter((x): x is string => !!x && !have.includes(x));
  if (missingMails.length) add.push(`Outros e-mails: ${[...new Set(missingMails)].join(", ")}`);
  if (add.length) p.notes = [have, ...add].filter(Boolean).join("\n");
  if (label && !e.tags.includes(label)) p.tags = [...e.tags, label];
  return p;
}

export const patchChanges = (p: Patch) => Object.keys(p).filter((k) => k !== "externalId").length > 0;

/** Etiqueta padrão do lote: "Importado do WhatsApp em 02/11". */
export function defaultLabel(source: string, d = new Date()): string {
  const dd = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
  const from = source === "WhatsApp" ? "WhatsApp" : source === "Google Contatos" ? "Google" : "arquivo";
  return `Importado do ${from} em ${dd}`;
}

export { parsePhone };
