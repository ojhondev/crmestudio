import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";
import { cleanLink } from "@/lib/propostas/links";
import type { EditaisActor } from "./access";
import { accessTo } from "./authz";
import { findMentions, type Mentionable } from "./mentions";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Quem pode ser mencionado neste edital: a equipe ativa + os parceiros que enxergam este edital. */
export async function mentionablesFor(editalId: string, actor: EditaisActor): Promise<Mentionable[]> {
  const [staff, partners] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, profile: schema.users.profile }).from(schema.users).where(eq(schema.users.active, true)),
    actor.kind === "staff"
      ? db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.editalShares)
          .innerJoin(schema.users, eq(schema.editalShares.partnerId, schema.users.id))
          .where(and(eq(schema.editalShares.editalId, editalId), eq(schema.users.active, true)))
      : Promise.resolve([]),
  ]);
  const team = staff.filter((u) => u.profile !== "parceiro_editais" && u.role !== "parceiro").map((u) => ({ id: u.id, name: u.name }));
  return [...team, ...partners].filter((p) => p.id !== actor.id);
}

export type CommentInput = { editalId: string; body: string; kind?: "comentario" | "link" | "revisao"; linkUrl?: string; linkName?: string; internal?: boolean };

/** Registra um comentário / link / documento para revisão e avisa quem precisa saber. */
export async function addComment(actor: EditaisActor, input: CommentInput): Promise<{ error: string } | { ok: true; id: string }> {
  if (!isId(input.editalId)) return { error: "Pedido inválido." };
  const v = await accessTo(actor, input.editalId);
  if (!v.edital) return { error: "Você não tem acesso a este edital." };
  if (actor.kind === "partner" && !v.contribute) return { error: "Você pode ler este edital, mas não comentar. Peça à equipe para liberar “Pode contribuir”." };
  if (actor.kind === "staff" && !v.contribute) return { error: "Seu acesso a Editais é só de consulta." };
  const kind = input.kind === "link" || input.kind === "revisao" ? input.kind : "comentario";
  const body = str(input.body, 2000);
  let linkUrl: string | null = null;
  if (kind !== "comentario") {
    linkUrl = cleanLink(input.linkUrl);
    if (!linkUrl) return { error: "Cole um link que comece com https:// (Drive, site do órgão…). O CRM não guarda arquivos, só links." };
  }
  if (!body && kind === "comentario") return { error: "Escreva o comentário." };
  const internal = actor.kind === "staff" && !!input.internal;
  const [edital] = await db.select({ title: schema.editais.title, ownerId: schema.editais.ownerId }).from(schema.editais).where(eq(schema.editais.id, input.editalId)).limit(1);
  if (!edital) return { error: "Edital não encontrado." };

  const people = await mentionablesFor(input.editalId, actor);
  const mentions = findMentions(body, people);
  const [row] = await db
    .insert(schema.editalComments)
    .values({
      editalId: input.editalId,
      userId: actor.id,
      userName: actor.name,
      kind,
      body: body || (kind === "revisao" ? "Documento para revisão" : "Link anexado"),
      linkUrl,
      linkName: kind === "comentario" ? null : str(input.linkName, 80) || (kind === "revisao" ? "Documento" : "Link"),
      reviewStatus: kind === "revisao" ? "pendente" : null,
      mentions,
      internal,
    })
    .returning({ id: schema.editalComments.id });

  // avisos
  const href = `/editais/radar/${input.editalId}`;
  const short = edital.title.length > 70 ? `${edital.title.slice(0, 70)}…` : edital.title;
  const verb = kind === "link" ? "anexou um link em" : kind === "revisao" ? "enviou um documento para revisão em" : "comentou em";
  const targets = new Set<string>(mentions);
  if (!internal) {
    if (actor.kind === "partner") {
      // parceiro falou: avisa o responsável do edital e o do dossiê
      const [d] = await db.select({ ownerId: schema.propostaDossies.ownerId }).from(schema.propostaDossies).where(eq(schema.propostaDossies.editalId, input.editalId)).limit(1);
      for (const id of [edital.ownerId, d?.ownerId]) if (id) targets.add(id);
      // sem responsável definido: os administradores ficam sabendo
      if (!targets.size) {
        const admins = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true)));
        for (const a of admins) targets.add(a.id);
      }
    } else {
      // equipe falou: avisa os parceiros que enxergam este edital
      const partners = await db.select({ id: schema.editalShares.partnerId }).from(schema.editalShares).where(eq(schema.editalShares.editalId, input.editalId));
      for (const p of partners) targets.add(p.id);
    }
  }
  targets.delete(actor.id);
  if (targets.size) {
    await notifyUsers([...targets], (uid) => ({
      type: "edital_comentario",
      title: mentions.includes(uid) ? `${actor.name} mencionou você em “${short}”` : `${actor.name} ${verb} “${short}”`,
      body: body ? body.slice(0, 200) : null,
      href,
      entity: "edital",
      entityId: input.editalId,
      dedupeKey: `comentario:${row.id}`,
    }));
  }
  return { ok: true, id: row.id };
}

/** Parceiro (ou colega) marca interesse: vira um registro na conversa e avisa o responsável. */
export async function markInterest(actor: EditaisActor, editalId: string): Promise<{ error: string } | { ok: true }> {
  if (!isId(editalId)) return { error: "Pedido inválido." };
  const v = await accessTo(actor, editalId);
  if (!v.edital) return { error: "Você não tem acesso a este edital." };
  if (actor.kind === "partner" && !v.contribute) return { error: "Peça à equipe para liberar “Pode contribuir” para marcar interesse." };
  const [already] = await db
    .select({ id: schema.editalComments.id })
    .from(schema.editalComments)
    .where(and(eq(schema.editalComments.editalId, editalId), eq(schema.editalComments.userId, actor.id), eq(schema.editalComments.kind, "interesse")))
    .limit(1);
  if (already) return { ok: true }; // idempotente
  const r = await addCommentRaw(actor, editalId, "interesse", "Tenho interesse neste edital.");
  return r;
}

async function addCommentRaw(actor: EditaisActor, editalId: string, kind: string, body: string): Promise<{ error: string } | { ok: true }> {
  const [edital] = await db.select({ title: schema.editais.title, ownerId: schema.editais.ownerId }).from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  if (!edital) return { error: "Edital não encontrado." };
  const [row] = await db.insert(schema.editalComments).values({ editalId, userId: actor.id, userName: actor.name, kind, body }).returning({ id: schema.editalComments.id });
  if (edital.ownerId && edital.ownerId !== actor.id) {
    await notifyUsers([edital.ownerId], {
      type: "edital_comentario",
      title: `${actor.name} tem interesse em “${edital.title.slice(0, 70)}”`,
      href: `/editais/radar/${editalId}`,
      entity: "edital",
      entityId: editalId,
      dedupeKey: `interesse:${row.id}`,
    });
  }
  return { ok: true };
}

/** A equipe aprova ou pede ajuste num documento enviado para revisão. */
export async function reviewDocument(actor: EditaisActor, commentId: string, status: "aprovado" | "ajustar"): Promise<{ error: string } | { ok: true }> {
  if (actor.kind !== "staff") return { error: "Só a equipe revisa documentos." };
  if (!isId(commentId) || (status !== "aprovado" && status !== "ajustar")) return { error: "Pedido inválido." };
  const [c] = await db.select().from(schema.editalComments).where(and(eq(schema.editalComments.id, commentId), eq(schema.editalComments.kind, "revisao"))).limit(1);
  if (!c) return { error: "Documento não encontrado." };
  await db.update(schema.editalComments).set({ reviewStatus: status }).where(eq(schema.editalComments.id, commentId));
  if (c.userId && c.userId !== actor.id) {
    await notifyUsers([c.userId], {
      type: "edital_comentario",
      title: status === "aprovado" ? `${actor.name} aprovou o documento “${c.linkName ?? "enviado"}”` : `${actor.name} pediu ajustes no documento “${c.linkName ?? "enviado"}”`,
      href: `/editais/radar/${c.editalId}`,
      entity: "edital",
      entityId: c.editalId,
      dedupeKey: `revisao:${c.id}:${status}`,
    });
  }
  return { ok: true };
}

/** Avisos de tarefa atribuída a um parceiro (item do checklist). */
export async function notifyAssigned(by: { id: string; name: string }, assigneeId: string, editalId: string, itemTitle: string, itemId: string) {
  if (assigneeId === by.id) return;
  const [e] = await db.select({ title: schema.editais.title }).from(schema.editais).where(eq(schema.editais.id, editalId)).limit(1);
  await notifyUsers([assigneeId], {
    type: "tarefa_atribuida",
    title: `${by.name} atribuiu a você: ${itemTitle.slice(0, 90)}`,
    body: e ? e.title.slice(0, 120) : null,
    href: `/editais/propostas/${editalId}`,
    entity: "edital",
    entityId: editalId,
    dedupeKey: `item:${itemId}:${assigneeId}`,
  });
}
