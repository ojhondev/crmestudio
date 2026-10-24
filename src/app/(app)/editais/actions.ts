"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, ilike, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { afterResponse, fireDealEvent } from "@/lib/automations-engine";
import { requestScan, runQuickScan } from "@/lib/editais/ingest";
import { KIND_LABEL, TRIAGE_LABEL, isTriage, type EditalTriage } from "@/lib/editais/types";
import { parseMoney } from "@/lib/format";

const str = (v: unknown, n = 500) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function note(editalId: string, user: Pick<SessionUser, "id" | "name"> | null, type: string, body: string) {
  await db.insert(schema.editalEvents).values({ editalId, userId: user?.id ?? null, userName: user?.name ?? null, type, body: body.slice(0, 600) });
}

/** Botão “Buscar oportunidades”: registra o pedido para o GitHub e roda já uma varredura rápida aqui. */
export async function requestScanAction() {
  const user = await requireAccess("editais", "edit");
  const days = 14;
  const r = await requestScan({ id: user.id, name: user.name }, days);
  if (r.quick) {
    const quickId = r.quick.id;
    after(async () => {
      try {
        const stats = await runQuickScan(quickId, days);
        if (stats) revalidatePath("/editais");
      } catch (e) {
        console.error("[editais] varredura rápida", e);
      }
    });
  }
  revalidatePath("/editais");
  return {
    ok: true as const,
    requestId: r.request.id,
    quickId: r.quick?.id ?? null,
    alreadyOpen: r.alreadyOpen,
    githubNote: r.dispatch.note,
    githubDispatched: r.dispatch.ok,
  };
}

/** Marca a triagem (novo, interessante, em análise, proposta enviada, descartado + motivo, ganho, perdido). */
export async function setTriage(id: string, triage: string, reason?: string) {
  const user = await requireAccess("editais", "edit");
  if (!isId(id) || !isTriage(triage)) return { error: "Pedido inválido." };
  const why = str(reason, 200);
  if (triage === "descartado" && !why) return { error: "Escolha o motivo do descarte." };
  const [cur] = await db.select().from(schema.editais).where(eq(schema.editais.id, id));
  if (!cur) return { error: "Edital não encontrado." };
  const t = triage as EditalTriage;
  await db
    .update(schema.editais)
    .set({
      triage: t,
      discardReason: t === "descartado" ? why : null,
      // quem marca “interessante/em análise” assume o edital (se ninguém assumiu): é quem receberá os lembretes de prazo
      ownerId: cur.ownerId ?? (t === "interessante" || t === "em_analise" || t === "proposta_enviada" ? user.id : null),
      updatedAt: new Date(),
    })
    .where(eq(schema.editais.id, id));
  await note(id, user, "triagem", `Triagem: ${TRIAGE_LABEL[t]}${t === "descartado" ? ` — ${why}` : ""}`);
  await audit(user, "edital_triagem", `Edital “${cur.title.slice(0, 80)}”: ${TRIAGE_LABEL[t]}`, { entity: "edital", entityId: id });
  revalidatePath("/editais");
  revalidatePath("/");
  return { ok: true as const };
}

export async function setOwner(id: string, ownerId: string | null) {
  const user = await requireAccess("editais", "edit");
  if (!isId(id) || (ownerId && !isId(ownerId))) return { error: "Pedido inválido." };
  let name = "ninguém";
  if (ownerId) {
    const [u] = await db.select({ name: schema.users.name, active: schema.users.active }).from(schema.users).where(eq(schema.users.id, ownerId));
    if (!u?.active) return { error: "Pessoa não encontrada." };
    name = u.name;
  }
  await db.update(schema.editais).set({ ownerId, updatedAt: new Date() }).where(eq(schema.editais.id, id));
  await note(id, user, "responsavel", ownerId ? `Responsável: ${name}` : "Responsável removido");
  revalidatePath("/editais");
  return { ok: true as const };
}

export async function saveNotes(id: string, notes: string) {
  const user = await requireAccess("editais", "edit");
  if (!isId(id)) return { error: "Pedido inválido." };
  await db.update(schema.editais).set({ notes: str(notes, 4000) || null, updatedAt: new Date() }).where(eq(schema.editais.id, id));
  await note(id, user, "nota", "Anotações atualizadas");
  revalidatePath("/editais");
  return { ok: true as const };
}

export async function addEventNote(id: string, body: string) {
  const user = await requireAccess("editais", "edit");
  const text = str(body, 600);
  if (!isId(id) || !text) return { error: "Escreva a anotação." };
  await note(id, user, "nota", text);
  revalidatePath("/editais");
  return { ok: true as const };
}

/** Cria o contato (órgão) e o negócio a partir do edital; opcionalmente a tarefa do prazo. */
export async function createDealFromEdital(id: string, input: { title: string; value: string; organ: string; location: string; withTask: boolean }) {
  const user = await requireAccess("editais", "edit");
  if (!has(user, "negocios", "edit") || !has(user, "contatos", "edit")) return { error: "Para criar o negócio você precisa de acesso de edição a Negócios e a Leads e contatos." };
  if (!isId(id)) return { error: "Pedido inválido." };
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, id));
  if (!e) return { error: "Edital não encontrado." };
  if (e.dealId) return { error: "Este edital já tem um negócio.", dealId: e.dealId };
  const title = str(input.title, 200) || e.title.slice(0, 120);
  const organ = str(input.organ, 200) || e.organ;

  // contato = o órgão (reaproveita se já existe um com o mesmo nome)
  const [found] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(ilike(schema.contacts.company, organ), eq(schema.contacts.source, "Licitação"))).limit(1);
  let contactId = found?.id ?? null;
  if (!contactId) {
    const [c] = await db
      .insert(schema.contacts)
      .values({ name: organ, company: organ, city: e.city, state: e.uf, document: e.organCnpj, source: "Licitação", tags: ["edital"], ownerId: user.id, notes: "Criado a partir de um edital de restauro." })
      .returning({ id: schema.contacts.id });
    contactId = c.id;
  }

  const [first] = await db.select().from(schema.stages).orderBy(schema.stages.position).limit(1);
  const [{ top }] = await db.select({ top: max(schema.deals.position) }).from(schema.deals).where(eq(schema.deals.stageId, first.id));
  const service = e.kind === "projeto" ? "Projeto de arquitetura" : e.kind === "laudo" ? "Diagnóstico / laudo técnico" : "Restauro";
  const closeText = e.closeAt ? e.closeAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "não informado";
  const [deal] = await db
    .insert(schema.deals)
    .values({
      title,
      contactId,
      stageId: first.id,
      valueCents: parseMoney(input.value) || e.valueCents || 0,
      service,
      property: e.kind === "outro" ? null : "Bem tombado",
      location: str(input.location, 160) || [e.city, e.uf].filter(Boolean).join("/"),
      ownerId: user.id,
      position: (top ?? 0) + 1,
      notes: `Edital (${KIND_LABEL[e.kind as keyof typeof KIND_LABEL] ?? e.kind}) · ${e.organ}\nPropostas até: ${closeText}\nPNCP: ${e.url ?? "—"}\nPortal de origem: ${e.sourceUrl ?? "—"}\nNº de controle: ${e.externalId}`,
    })
    .returning({ id: schema.deals.id });
  await db.insert(schema.activities).values({ dealId: deal.id, contactId, userId: user.id, type: "nota", body: `Negócio criado a partir do edital: ${e.title.slice(0, 200)}` });

  let taskId: string | null = null;
  if (input.withTask && e.closeAt && has(user, "tarefas", "edit")) {
    const [t] = await db
      .insert(schema.tasks)
      .values({ title: `Enviar proposta — ${e.title.slice(0, 150)}`, dueAt: e.closeAt, assigneeId: user.id, createdById: user.id, dealId: deal.id, priority: "alta", links: e.url ? [{ id: "pncp", url: e.url, name: "Edital no PNCP" }] : [] })
      .returning({ id: schema.tasks.id });
    taskId = t.id;
  }
  await db
    .update(schema.editais)
    .set({ dealId: deal.id, taskId: taskId ?? e.taskId, ownerId: e.ownerId ?? user.id, triage: e.triage === "novo" || e.triage === "interessante" ? "em_analise" : e.triage, updatedAt: new Date() })
    .where(eq(schema.editais.id, id));
  await note(id, user, "negocio", `Negócio criado${taskId ? " e tarefa do prazo agendada" : ""}`);
  await audit(user, "edital_negocio", `Criou o negócio “${title.slice(0, 80)}” a partir de um edital`, { entity: "edital", entityId: id, meta: { dealId: deal.id } });
  afterResponse(() => fireDealEvent(["deal_created"], deal.id, user, { eventKey: deal.id }));
  revalidatePath("/", "layout");
  return { ok: true as const, dealId: deal.id };
}

/** Tarefa com o prazo final do edital (para quem só quer lembrete, sem abrir negócio). */
export async function createTaskFromEdital(id: string) {
  const user = await requireAccess("editais", "edit");
  if (!has(user, "tarefas", "edit")) return { error: "Você precisa de acesso de edição a Tarefas." };
  if (!isId(id)) return { error: "Pedido inválido." };
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, id));
  if (!e) return { error: "Edital não encontrado." };
  if (!e.closeAt) return { error: "Este edital não tem prazo informado." };
  const [t] = await db
    .insert(schema.tasks)
    .values({ title: `Prazo do edital — ${e.title.slice(0, 150)}`, dueAt: e.closeAt, assigneeId: e.ownerId ?? user.id, createdById: user.id, dealId: e.dealId, priority: "alta", links: e.url ? [{ id: "pncp", url: e.url, name: "Edital no PNCP" }] : [] })
    .returning({ id: schema.tasks.id });
  await db.update(schema.editais).set({ taskId: t.id, updatedAt: new Date() }).where(eq(schema.editais.id, id));
  await note(id, user, "tarefa", "Tarefa criada com o prazo do edital");
  revalidatePath("/", "layout");
  return { ok: true as const };
}
