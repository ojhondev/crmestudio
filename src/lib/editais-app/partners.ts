import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hashPassword, randomToken } from "@/lib/password";
import { notifyUsers } from "@/lib/notifications";
import { isEmail, sendMail, type MailResult } from "@/lib/mail";
import { editalNote } from "@/lib/propostas/ops";
import { inviteHtml, inviteLink, inviteState, inviteText, mailtoLink, SUBJECT, whatsappLink, type InviteChannel, type InviteState } from "./invite";
import { isRole, isScope, type EditaisActor, type PartnerRole, type ShareScope } from "./access";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const tempPassword = () => randomToken(8).replace(/[-_]/g, "x");

type Staff = { id: string; name: string };

/* ------------------------------------ convite ------------------------------------ */

export type InvitePack = {
  /** texto pronto para colar */
  text: string;
  subject: string;
  link: string;
  whatsapp: string;
  mailto: string;
  /** o e-mail saiu de verdade? */
  emailed: boolean;
  /** por que não saiu (sem provedor configurado, erro…) */
  mailNote: string | null;
  /** senha provisória mostrada UMA vez (não fica guardada em texto) */
  tempPassword: string | null;
};

async function deliver(by: Staff, partner: { id: string; name: string; email: string; phone: string | null }, origin: string, temp: string | null): Promise<InvitePack> {
  const input = { partnerName: partner.name, partnerEmail: partner.email, inviterName: by.name, origin, tempPassword: temp };
  const text = inviteText(input);
  const res: MailResult = await sendMail({ to: partner.email, subject: SUBJECT, text, html: inviteHtml(input) });
  const emailed = res.ok;
  const channel: InviteChannel = emailed ? "email" : "manual";
  await db
    .update(schema.editalPartners)
    .set({
      inviteChannel: channel,
      inviteSentAt: emailed ? new Date() : null,
      inviteCount: sql`${schema.editalPartners.inviteCount} + 1`,
      inviteError: res.ok ? null : res.reason === "sem_provedor" ? null : (res.error ?? "Falha ao enviar").slice(0, 300),
    })
    .where(eq(schema.editalPartners.userId, partner.id));
  return {
    text,
    subject: SUBJECT,
    link: inviteLink(origin),
    whatsapp: whatsappLink(text, partner.phone),
    mailto: mailtoLink(partner.email, SUBJECT, text),
    emailed,
    mailNote: res.ok ? null : res.reason === "sem_provedor" ? "O envio automático de e-mail ainda não está configurado: copie o texto ou use o WhatsApp." : `O e-mail não saiu (${res.error ?? "erro"}). Copie o texto ou use o WhatsApp.`,
    tempPassword: temp,
  };
}

export type PartnerInput = { name: string; email: string; company?: string; phone?: string; areas?: string; radarCompleto?: boolean };

/** Cria a conta do parceiro (ativa, restrita ao app Editais) e dispara o convite. */
export async function invitePartner(by: Staff, input: PartnerInput, origin: string): Promise<{ error: string } | { ok: true; partnerId: string; pack: InvitePack }> {
  const name = str(input.name, 120);
  const email = str(input.email, 200).toLowerCase();
  if (!name) return { error: "Informe o nome do parceiro." };
  if (!isEmail(email)) return { error: "Informe um e-mail válido." };
  const [exists] = await db.select({ id: schema.users.id, profile: schema.users.profile }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (exists) return { error: exists.profile === "parceiro_editais" ? "Este e-mail já foi convidado. Veja em Parceiros." : "Já existe uma conta da equipe com esse e-mail." };
  const temp = tempPassword();
  const [u] = await db
    .insert(schema.users)
    .values({
      name,
      email,
      role: "parceiro",
      profile: "parceiro_editais",
      permissions: null,
      ownOnly: true,
      title: str(input.company, 120) || null,
      phone: str(input.phone, 40) || null,
      passwordHash: hashPassword(temp),
      mustChangePassword: true,
      calendarToken: randomToken(),
    })
    .returning({ id: schema.users.id, phone: schema.users.phone });
  await db.insert(schema.editalPartners).values({ userId: u.id, company: str(input.company, 120) || null, areas: str(input.areas, 200) || null, radarCompleto: !!input.radarCompleto, invitedById: by.id });
  const pack = await deliver(by, { id: u.id, name, email, phone: u.phone }, origin, temp);
  return { ok: true, partnerId: u.id, pack };
}

/** Reenvia o convite. Se a pessoa ainda não entrou, gera uma senha provisória nova (a antiga não é recuperável). */
export async function resendInvite(by: Staff, partnerId: string, origin: string): Promise<{ error: string } | { ok: true; pack: InvitePack }> {
  const p = await getPartnerRow(partnerId);
  if (!p) return { error: "Parceiro não encontrado." };
  if (p.revokedAt) return { error: "O acesso deste parceiro está revogado. Reative antes de reenviar." };
  let temp: string | null = null;
  if (!p.lastLoginAt) {
    temp = tempPassword();
    await db.update(schema.users).set({ passwordHash: hashPassword(temp), mustChangePassword: true, sessionVersion: p.sessionVersion + 1 }).where(eq(schema.users.id, partnerId));
  }
  return { ok: true, pack: await deliver(by, { id: p.id, name: p.name, email: p.email, phone: p.phone }, origin, temp) };
}

/** Nova senha provisória para quem esqueceu (derruba as sessões). */
export async function resetPartnerPassword(by: Staff, partnerId: string, origin: string): Promise<{ error: string } | { ok: true; pack: InvitePack }> {
  const p = await getPartnerRow(partnerId);
  if (!p) return { error: "Parceiro não encontrado." };
  if (p.revokedAt) return { error: "O acesso deste parceiro está revogado." };
  const temp = tempPassword();
  await db.update(schema.users).set({ passwordHash: hashPassword(temp), mustChangePassword: true, sessionVersion: p.sessionVersion + 1 }).where(eq(schema.users.id, partnerId));
  return { ok: true, pack: await deliver(by, { id: p.id, name: p.name, email: p.email, phone: p.phone }, origin, temp) };
}

/** Revoga: desativa a conta e derruba as sessões. Os compartilhamentos ficam guardados (voltam se reativar). */
export async function revokePartner(partnerId: string): Promise<{ error: string } | { ok: true }> {
  const p = await getPartnerRow(partnerId);
  if (!p) return { error: "Parceiro não encontrado." };
  await db.update(schema.users).set({ active: false, sessionVersion: p.sessionVersion + 1 }).where(eq(schema.users.id, partnerId));
  await db.update(schema.editalPartners).set({ revokedAt: new Date() }).where(eq(schema.editalPartners.userId, partnerId));
  return { ok: true };
}

export async function reactivatePartner(by: Staff, partnerId: string, origin: string): Promise<{ error: string } | { ok: true; pack: InvitePack }> {
  const p = await getPartnerRow(partnerId);
  if (!p) return { error: "Parceiro não encontrado." };
  const temp = tempPassword();
  await db.update(schema.users).set({ active: true, passwordHash: hashPassword(temp), mustChangePassword: true, sessionVersion: p.sessionVersion + 1 }).where(eq(schema.users.id, partnerId));
  await db.update(schema.editalPartners).set({ revokedAt: null }).where(eq(schema.editalPartners.userId, partnerId));
  return { ok: true, pack: await deliver(by, { id: p.id, name: p.name, email: p.email, phone: p.phone }, origin, temp) };
}

export async function setRadarCompleto(partnerId: string, on: boolean): Promise<{ error: string } | { ok: true }> {
  const r = await db.update(schema.editalPartners).set({ radarCompleto: !!on }).where(eq(schema.editalPartners.userId, partnerId)).returning({ id: schema.editalPartners.userId });
  return r.length ? { ok: true } : { error: "Parceiro não encontrado." };
}

/** Uma vez só: quando o parceiro entra pela primeira vez, avisa quem convidou. */
export async function noteAcceptance(partnerId: string): Promise<void> {
  const [p] = await db
    .select({ invitedById: schema.editalPartners.invitedById, notified: schema.editalPartners.acceptedNotifiedAt, last: schema.users.lastLoginAt, name: schema.users.name })
    .from(schema.editalPartners)
    .innerJoin(schema.users, eq(schema.editalPartners.userId, schema.users.id))
    .where(eq(schema.editalPartners.userId, partnerId))
    .limit(1);
  if (!p || p.notified || !p.last) return;
  const claimed = await db
    .update(schema.editalPartners)
    .set({ acceptedNotifiedAt: new Date() })
    .where(and(eq(schema.editalPartners.userId, partnerId), isNull(schema.editalPartners.acceptedNotifiedAt)))
    .returning({ id: schema.editalPartners.userId });
  if (!claimed.length) return; // outra requisição já avisou
  const managers = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true)));
  const targets = [p.invitedById, ...managers.map((m) => m.id)].filter((x): x is string => !!x);
  await notifyUsers(targets, { type: "parceiro_aceito", title: `${p.name} aceitou o convite e entrou no app Editais`, href: `/editais/parceiros/${partnerId}`, dedupeKey: `parceiro_aceito:${partnerId}` });
}

/* ------------------------------------ leitura ------------------------------------ */

async function getPartnerRow(id: string) {
  if (!isId(id)) return null;
  const [r] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      phone: schema.users.phone,
      lastLoginAt: schema.users.lastLoginAt,
      sessionVersion: schema.users.sessionVersion,
      revokedAt: schema.editalPartners.revokedAt,
    })
    .from(schema.editalPartners)
    .innerJoin(schema.users, eq(schema.editalPartners.userId, schema.users.id))
    .where(eq(schema.editalPartners.userId, id))
    .limit(1);
  return r ?? null;
}

export type PartnerDTO = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  areas: string | null;
  radarCompleto: boolean;
  state: InviteState;
  channel: InviteChannel | null;
  inviteSentAt: string | null;
  inviteCount: number;
  inviteError: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  shareCount: number;
};

export async function listPartners(): Promise<PartnerDTO[]> {
  const rows = await db
    .select({ p: schema.editalPartners, u: schema.users, shares: sql<number>`(select count(*)::int from ${schema.editalShares} where ${schema.editalShares.partnerId} = ${schema.users.id})` })
    .from(schema.editalPartners)
    .innerJoin(schema.users, eq(schema.editalPartners.userId, schema.users.id))
    .orderBy(asc(schema.users.name));
  return rows.map(({ p, u, shares }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    company: p.company,
    areas: p.areas,
    radarCompleto: p.radarCompleto,
    state: inviteState({ revokedAt: p.revokedAt, lastLoginAt: u.lastLoginAt }),
    channel: p.inviteChannel === "email" ? "email" : p.inviteChannel === "manual" ? "manual" : null,
    inviteSentAt: p.inviteSentAt?.toISOString() ?? null,
    inviteCount: p.inviteCount,
    inviteError: p.inviteError,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    shareCount: shares,
  }));
}

export async function getPartner(id: string) {
  if (!isId(id)) return null;
  return (await listPartners()).find((p) => p.id === id) ?? null;
}

export type PartnerShareRow = {
  id: string;
  editalId: string;
  title: string;
  organ: string;
  uf: string | null;
  closeAt: string | null;
  role: PartnerRole;
  scope: ShareScope;
  showDocs: boolean;
  showSheet: boolean;
  docIds: string[];
};

export async function sharesOfPartner(partnerId: string): Promise<PartnerShareRow[]> {
  const rows = await db
    .select({ s: schema.editalShares, e: schema.editais })
    .from(schema.editalShares)
    .innerJoin(schema.editais, eq(schema.editalShares.editalId, schema.editais.id))
    .where(eq(schema.editalShares.partnerId, partnerId))
    .orderBy(sql`${schema.editais.closeAt} asc nulls last`);
  return rows.map(({ s, e }) => ({
    id: s.id,
    editalId: e.id,
    title: e.title,
    organ: e.organ,
    uf: e.uf,
    closeAt: e.closeAt?.toISOString() ?? null,
    role: s.role === "contribuir" ? "contribuir" : "ver",
    scope: s.scope === "proposta" ? "proposta" : "edital",
    showDocs: s.showDocs,
    showSheet: s.showSheet,
    docIds: s.docIds ?? [],
  }));
}

/* ------------------------------------ compartilhar ------------------------------------ */

export type ShareInput = {
  editalIds: string[];
  partnerIds: string[];
  role: string;
  scope: string;
  showDocs?: boolean;
  showSheet?: boolean;
  docIds?: string[];
};

/** Compartilha editais (ou propostas) com parceiros. Em lote; idempotente (repetir só atualiza o papel). */
export async function shareEditais(by: Staff, input: ShareInput): Promise<{ error: string } | { ok: true; created: number; updated: number }> {
  const editalIds = [...new Set(input.editalIds.filter(isId))].slice(0, 100);
  const partnerIds = [...new Set(input.partnerIds.filter(isId))].slice(0, 50);
  if (!editalIds.length || !partnerIds.length) return { error: "Escolha pelo menos um edital e um parceiro." };
  const role: PartnerRole = isRole(input.role) ? input.role : "ver";
  const scope: ShareScope = isScope(input.scope) ? input.scope : "edital";
  const [editais, partners] = await Promise.all([
    db.select({ id: schema.editais.id, title: schema.editais.title }).from(schema.editais).where(inArray(schema.editais.id, editalIds)),
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.editalPartners)
      .innerJoin(schema.users, eq(schema.editalPartners.userId, schema.users.id))
      .where(and(inArray(schema.editalPartners.userId, partnerIds), isNull(schema.editalPartners.revokedAt))),
  ]);
  if (!editais.length) return { error: "Edital não encontrado." };
  if (!partners.length) return { error: "Parceiro não encontrado ou com acesso revogado." };
  const docIds = (input.docIds ?? []).filter(isId).slice(0, 20);
  const existing = await db
    .select({ editalId: schema.editalShares.editalId, partnerId: schema.editalShares.partnerId })
    .from(schema.editalShares)
    .where(and(inArray(schema.editalShares.editalId, editais.map((e) => e.id)), inArray(schema.editalShares.partnerId, partners.map((p) => p.id))));
  const had = new Set(existing.map((x) => `${x.editalId}:${x.partnerId}`));
  const values = editais.flatMap((e) =>
    partners.map((p) => ({ editalId: e.id, partnerId: p.id, role, scope, showDocs: scope === "proposta" && !!input.showDocs, showSheet: scope === "proposta" && !!input.showSheet, docIds, createdById: by.id })),
  );
  await db
    .insert(schema.editalShares)
    .values(values)
    .onConflictDoUpdate({ target: [schema.editalShares.editalId, schema.editalShares.partnerId], set: { role, scope, showDocs: sql`excluded.show_docs`, showSheet: sql`excluded.show_sheet`, docIds: sql`excluded.doc_ids` } });
  let created = 0;
  for (const v of values) if (!had.has(`${v.editalId}:${v.partnerId}`)) created++;
  // histórico no edital + aviso ao parceiro (uma vez por edital)
  for (const e of editais) {
    const fresh = partners.filter((p) => !had.has(`${e.id}:${p.id}`));
    if (fresh.length) await editalNote(e.id, by, "compartilhar", `Compartilhado com ${fresh.map((p) => p.name).join(", ")} (${role === "contribuir" ? "pode contribuir" : "só ver"}${scope === "proposta" ? ", com a proposta" : ""})`);
    await notifyUsers(
      fresh.map((p) => p.id),
      { type: "edital_compartilhado", title: `${by.name} compartilhou com você: ${e.title.slice(0, 90)}`, href: `/editais/radar/${e.id}`, entity: "edital", entityId: e.id, dedupeKey: `share:${e.id}` },
    );
  }
  return { ok: true, created, updated: values.length - created };
}

export async function unshare(by: Staff, editalId: string, partnerId: string): Promise<{ error: string } | { ok: true }> {
  if (!isId(editalId) || !isId(partnerId)) return { error: "Pedido inválido." };
  const r = await db.delete(schema.editalShares).where(and(eq(schema.editalShares.editalId, editalId), eq(schema.editalShares.partnerId, partnerId))).returning({ id: schema.editalShares.id });
  if (r.length) {
    const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, partnerId)).limit(1);
    await editalNote(editalId, by, "compartilhar", `Deixou de compartilhar com ${u?.name ?? "o parceiro"}`);
    // o item do checklist atribuído a ele volta a ficar sem dono
    await db
      .update(schema.propostaItems)
      .set({ assigneeId: null })
      .where(and(eq(schema.propostaItems.assigneeId, partnerId), sql`${schema.propostaItems.dossieId} in (select id from ${schema.propostaDossies} where ${schema.propostaDossies.editalId} = ${editalId})`));
  }
  return { ok: true };
}

export async function updateShare(shareId: string, patch: { role?: string; scope?: string; showDocs?: boolean; showSheet?: boolean; docIds?: string[] }): Promise<{ error: string } | { ok: true }> {
  if (!isId(shareId)) return { error: "Pedido inválido." };
  const set: Partial<typeof schema.editalShares.$inferInsert> = {};
  if (patch.role !== undefined) {
    if (!isRole(patch.role)) return { error: "Papel inválido." };
    set.role = patch.role;
  }
  if (patch.scope !== undefined) {
    if (!isScope(patch.scope)) return { error: "Alcance inválido." };
    set.scope = patch.scope;
    if (patch.scope === "edital") {
      set.showDocs = false;
      set.showSheet = false;
    }
  }
  if (patch.showDocs !== undefined) set.showDocs = !!patch.showDocs;
  if (patch.showSheet !== undefined) set.showSheet = !!patch.showSheet;
  if (patch.docIds !== undefined) set.docIds = patch.docIds.filter(isId).slice(0, 20);
  if (!Object.keys(set).length) return { ok: true };
  const r = await db.update(schema.editalShares).set(set).where(eq(schema.editalShares.id, shareId)).returning({ id: schema.editalShares.id });
  return r.length ? { ok: true } : { error: "Compartilhamento não encontrado." };
}

/** Parceiros ativos (para escolher no compartilhamento e na atribuição). */
export async function activePartners() {
  return db
    .select({ id: schema.users.id, name: schema.users.name, company: schema.editalPartners.company, radarCompleto: schema.editalPartners.radarCompleto })
    .from(schema.editalPartners)
    .innerJoin(schema.users, eq(schema.editalPartners.userId, schema.users.id))
    .where(and(isNull(schema.editalPartners.revokedAt), eq(schema.users.active, true)))
    .orderBy(asc(schema.users.name));
}

/* ------------------------------------ painel do parceiro ------------------------------------ */

export type PartnerHome = {
  shared: { editalId: string; title: string; organ: string; uf: string | null; closeAt: string | null; daysLeft: number | null; role: PartnerRole; scope: ShareScope; hasDossie: boolean }[];
  tasks: { itemId: string; title: string; stepKey: string; dueAt: string | null; editalId: string; editalTitle: string; overdue: boolean }[];
  comments: number;
};

export async function partnerHome(actor: Extract<EditaisActor, { kind: "partner" }>): Promise<PartnerHome> {
  const { daysLeft } = await import("@/lib/editais/filters");
  const [shared, tasks] = await Promise.all([
    db
      .select({ s: schema.editalShares, e: schema.editais, dossie: schema.propostaDossies.id })
      .from(schema.editalShares)
      .innerJoin(schema.editais, eq(schema.editalShares.editalId, schema.editais.id))
      .leftJoin(schema.propostaDossies, eq(schema.propostaDossies.editalId, schema.editais.id))
      .where(eq(schema.editalShares.partnerId, actor.id))
      .orderBy(sql`${schema.editais.closeAt} asc nulls last`)
      .limit(100),
    db
      .select({ i: schema.propostaItems, e: schema.editais })
      .from(schema.propostaItems)
      .innerJoin(schema.propostaDossies, eq(schema.propostaItems.dossieId, schema.propostaDossies.id))
      .innerJoin(schema.editais, eq(schema.propostaDossies.editalId, schema.editais.id))
      // só tarefas de propostas que ainda estão compartilhadas com ele
      .innerJoin(schema.editalShares, and(eq(schema.editalShares.editalId, schema.editais.id), eq(schema.editalShares.partnerId, actor.id), eq(schema.editalShares.scope, "proposta")))
      .where(and(eq(schema.propostaItems.assigneeId, actor.id), eq(schema.propostaItems.done, false)))
      .orderBy(sql`${schema.propostaItems.dueAt} asc nulls last`)
      .limit(60),
  ]);
  const now = Date.now();
  return {
    shared: shared.map(({ s, e, dossie }) => ({
      editalId: e.id,
      title: e.title,
      organ: e.organ,
      uf: e.uf,
      closeAt: e.closeAt?.toISOString() ?? null,
      daysLeft: daysLeft(e.closeAt, now),
      role: s.role === "contribuir" ? "contribuir" : "ver",
      scope: s.scope === "proposta" ? "proposta" : "edital",
      hasDossie: !!dossie && s.scope === "proposta",
    })),
    tasks: tasks.map(({ i, e }) => ({ itemId: i.id, title: i.title, stepKey: i.stepKey, dueAt: i.dueAt?.toISOString() ?? null, editalId: e.id, editalTitle: e.title, overdue: !!i.dueAt && i.dueAt.getTime() < now })),
    comments: 0,
  };
}

