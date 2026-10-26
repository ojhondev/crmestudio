"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dealScope } from "@/lib/deals";
import { cleanHtml } from "@/lib/docs/sanitize";
import { BUILTIN_CONTRACTS, defaultDeck } from "@/lib/docs/templates";
import { EMPTY_STUDIO, LAYOUTS, type ContractContent, type DeckContent, type DocContent, type Slide, type StudioProfile } from "@/lib/docs/types";
import { findVars, missingVars, valueMap } from "@/lib/docs/variables";
import { buildContext, getDoc, logEvent, newToken, nextNumber, renderContract } from "@/lib/docs/server";

const MAX_JSON = 6_000_000;
const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const LAYOUT_KEYS = new Set<string>(LAYOUTS.map((l) => l.key));

/** Valida e limpa o conteúdo que veio do navegador (nunca confiamos no que chega). */
function cleanContent(kind: "contrato" | "apresentacao", raw: unknown): DocContent {
  if (JSON.stringify(raw ?? "").length > MAX_JSON) throw new Error("Documento grande demais. Reduza as imagens.");
  const c = (raw ?? {}) as Record<string, unknown>;
  if (kind === "contrato") {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries((c.fields as Record<string, unknown>) ?? {})) {
      if (/^[a-z0-9_]{1,40}$/.test(k)) fields[k] = str(v, 8000);
    }
    return { kind: "contrato", html: cleanHtml(str(c.html, 600_000)), fields } satisfies ContractContent;
  }
  const slides: Slide[] = (Array.isArray(c.slides) ? c.slides : []).slice(0, 40).map((s: Record<string, unknown>, i): Slide => {
    const layout = LAYOUT_KEYS.has(String(s.layout)) ? (s.layout as Slide["layout"]) : "texto";
    const items = Array.isArray(s.items) ? s.items : [];
    const images = Array.isArray(s.images) ? s.images : [];
    return {
      id: str(s.id, 40) || `s${i}`,
      layout,
      title: str(s.title, 300),
      subtitle: str(s.subtitle, 500) || undefined,
      body: str(s.body, 3000) || undefined,
      total: str(s.total, 100) || undefined,
      items: items.slice(0, 8).map((it: Record<string, unknown>) => ({ title: str(it.title, 200), text: str(it.text, 600) || undefined, value: str(it.value, 100) || undefined })),
      images: images.slice(0, 4).map((u) => str(u, 2_000_000)).filter(Boolean),
    };
  });
  return { kind: "apresentacao", slides } satisfies DeckContent;
}

/* ------------------------------- criar / salvar ------------------------------ */

export async function createDocument(input: { kind: "contrato" | "apresentacao"; template?: string; dealId?: string | null; title?: string }) {
  const user = await requireAccess("documentos", "edit");
  const kind = input.kind === "apresentacao" ? "apresentacao" : "contrato";

  let deal: typeof schema.deals.$inferSelect | undefined;
  if (input.dealId) {
    [deal] = await db
      .select()
      .from(schema.deals)
      .where(and(eq(schema.deals.id, input.dealId), dealScope(user)))
      .limit(1);
    if (!deal) return { error: "Negócio não encontrado." };
  }
  const [contact] = deal?.contactId ? await db.select({ name: schema.contacts.name }).from(schema.contacts).where(eq(schema.contacts.id, deal.contactId)).limit(1) : [];

  let content: DocContent;
  let templateName = kind === "contrato" ? "Contrato" : "Proposta comercial";
  let slug: string | null = null;
  const custom = input.template && /^[0-9a-f-]{36}$/i.test(input.template) ? (await db.select().from(schema.docTemplates).where(eq(schema.docTemplates.id, input.template)).limit(1))[0] : undefined;
  if (custom && custom.kind === kind) {
    content = cleanContent(kind, custom.content);
    templateName = custom.name;
  } else if (kind === "contrato") {
    const t = BUILTIN_CONTRACTS.find((b) => b.slug === input.template) ?? BUILTIN_CONTRACTS[0];
    content = { kind: "contrato", html: t.html, fields: {} };
    templateName = t.name;
    slug = t.slug;
  } else {
    content = defaultDeck();
  }

  const title = str(input.title, 160).trim() || [templateName, contact?.name].filter(Boolean).join(" — ");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const number = await nextNumber(kind);
      const [doc] = await db
        .insert(schema.documents)
        .values({ kind, number, title, dealId: deal?.id ?? null, contactId: deal?.contactId ?? null, templateSlug: slug, content, createdById: user.id })
        .returning({ id: schema.documents.id });
      await logEvent(doc.id, "criado", { by: user.name });
      await audit(user, "documento_criado", `Criou ${kind === "contrato" ? "o contrato" : "a apresentação"} ${number}`, { entity: "documento", entityId: doc.id });
      revalidatePath("/documentos");
      redirect(`/documentos/${doc.id}`);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) throw e; // redirect
      if (attempt === 3) throw e; // número duplicado em corrida: tenta o próximo
    }
  }
}

export async function saveDocument(id: string, data: { title: string; content: unknown; contactId?: string | null }) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.status !== "rascunho") return { error: "Este documento já foi enviado. Reabra para editar." };
  let content: DocContent;
  try {
    content = cleanContent(doc.kind, data.content);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Conteúdo inválido." };
  }
  const title = str(data.title, 160).trim() || doc.title;
  await db.update(schema.documents).set({ title, content, updatedAt: new Date() }).where(eq(schema.documents.id, id));
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function linkDocument(id: string, dealId: string | null) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc || doc.status !== "rascunho") return { error: "Só rascunhos podem mudar de negócio." };
  let contactId: string | null = null;
  if (dealId) {
    const [deal] = await db.select().from(schema.deals).where(and(eq(schema.deals.id, dealId), dealScope(user))).limit(1);
    if (!deal) return { error: "Negócio não encontrado." };
    contactId = deal.contactId;
  }
  await db.update(schema.documents).set({ dealId, contactId, updatedAt: new Date() }).where(eq(schema.documents.id, id));
  revalidatePath(`/documentos/${id}`);
  return { ok: true };
}

/* ------------------------------- visualizar / enviar ------------------------------ */

/** Valores já resolvidos para a prévia do editor (inclui o que falta preencher). */
export async function previewData(id: string, content?: unknown) {
  const user = await requireAccess("documentos", "view");
  const doc = await getDoc(id, user);
  if (!doc) return null;
  const merged = content ? cleanContent(doc.kind, content) : (doc.content as DocContent);
  const ctx = await buildContext({ ...doc, content: merged });
  const map = valueMap(ctx);
  const text = merged.kind === "contrato" ? merged.html : JSON.stringify(merged.slides);
  return { map, missing: missingVars(text, map), vars: findVars(text), html: merged.kind === "contrato" ? renderContract(merged, map) : null, studioName: ctx.studio.name };
}

export async function sendDocument(id: string, opts: { force?: boolean } = {}) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.status === "aceito") return { error: "Documento já aceito." };
  const content = doc.content as DocContent;
  const ctx = await buildContext(doc);
  const map = valueMap(ctx);
  const text = content.kind === "contrato" ? content.html : JSON.stringify(content.slides);
  const missing = missingVars(text, map);
  if (missing.length && !opts.force) return { missing };

  const token = doc.publicToken ?? newToken();
  const version = doc.version;
  await db.insert(schema.documentVersions).values({ documentId: id, version, content, note: "Enviado ao cliente", createdById: user.id });
  const frozen = content.kind === "contrato" ? { ...content, html: renderContract(content, map) } : content;
  await db
    .update(schema.documents)
    .set({ status: "enviado", publicToken: token, snapshot: { content: frozen, map, studioName: ctx.studio.name, frozenAt: new Date().toISOString() }, sentAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.documents.id, id));
  await logEvent(id, "enviado", { by: user.name });
  if (doc.dealId) {
    await db.insert(schema.activities).values({
      dealId: doc.dealId,
      contactId: doc.contactId,
      userId: user.id,
      type: "nota",
      body: `${content.kind === "contrato" ? "Contrato" : "Proposta"} ${doc.number} enviado(a) ao cliente`,
    });
  }
  await audit(user, "documento_enviado", `Enviou ${doc.number} (${doc.title})`, { entity: "documento", entityId: id });
  revalidatePath(`/documentos/${id}`);
  revalidatePath("/documentos");
  return { ok: true, token };
}

export async function reopenDocument(id: string) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.status === "aceito") return { error: "Documento aceito não pode ser editado. Duplique para criar uma nova versão." };
  await db.update(schema.documents).set({ status: "rascunho", version: doc.version + 1, updatedAt: new Date() }).where(eq(schema.documents.id, id));
  await logEvent(id, "reaberto", { by: user.name });
  await audit(user, "documento_reaberto", `Reabriu ${doc.number} para edição`, { entity: "documento", entityId: id });
  revalidatePath(`/documentos/${id}`);
  revalidatePath("/documentos");
  return { ok: true };
}

export async function cancelDocument(id: string) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.status === "aceito") return { error: "Documento aceito não pode ser cancelado." };
  await db.update(schema.documents).set({ status: "cancelado", updatedAt: new Date() }).where(eq(schema.documents.id, id));
  await logEvent(id, "cancelado", { by: user.name });
  await audit(user, "documento_cancelado", `Cancelou ${doc.number}`, { entity: "documento", entityId: id });
  revalidatePath(`/documentos/${id}`);
  revalidatePath("/documentos");
  return { ok: true };
}

export async function duplicateDocument(id: string) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  const number = await nextNumber(doc.kind);
  const [copy] = await db
    .insert(schema.documents)
    .values({ kind: doc.kind, number, title: `${doc.title} (cópia)`, dealId: doc.dealId, contactId: doc.contactId, templateSlug: doc.templateSlug, content: doc.content, createdById: user.id })
    .returning({ id: schema.documents.id });
  await logEvent(copy.id, "criado", { by: user.name, from: doc.number });
  await audit(user, "documento_criado", `Duplicou ${doc.number} → ${number}`, { entity: "documento", entityId: copy.id });
  revalidatePath("/documentos");
  redirect(`/documentos/${copy.id}`);
}

export async function deleteDocument(id: string) {
  const user = await requireAccess("documentos", "manage");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  await db.delete(schema.documents).where(eq(schema.documents.id, id));
  await audit(user, "documento_excluido", `Excluiu ${doc.number} (${doc.title})`, { entity: "documento", entityId: id });
  revalidatePath("/documentos");
  redirect("/documentos");
}

/* ------------------------------- versões ------------------------------ */

export async function saveVersion(id: string, note: string) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  await db.insert(schema.documentVersions).values({ documentId: id, version: doc.version, content: doc.content, note: str(note, 200) || "Versão salva", createdById: user.id });
  revalidatePath(`/documentos/${id}`);
  return { ok: true };
}

export async function restoreVersion(id: string, versionId: number) {
  const user = await requireAccess("documentos", "edit");
  const doc = await getDoc(id, user);
  if (!doc || doc.status !== "rascunho") return { error: "Só rascunhos podem voltar a uma versão anterior." };
  const [v] = await db.select().from(schema.documentVersions).where(and(eq(schema.documentVersions.id, versionId), eq(schema.documentVersions.documentId, id))).limit(1);
  if (!v) return { error: "Versão não encontrada." };
  await db.insert(schema.documentVersions).values({ documentId: id, version: doc.version, content: doc.content, note: "Antes de restaurar uma versão", createdById: user.id });
  await db.update(schema.documents).set({ content: v.content, updatedAt: new Date() }).where(eq(schema.documents.id, id));
  revalidatePath(`/documentos/${id}`);
  return { ok: true };
}

/* ------------------------------- modelos e cláusulas ------------------------------ */

export async function saveTemplate(input: { id?: string; kind: "contrato" | "apresentacao" | "clausula"; name: string; description?: string; content: unknown }) {
  const user = await requireAccess("documentos", "manage");
  const name = str(input.name, 120).trim();
  if (!name) return { error: "Dê um nome ao modelo." };
  const kind: "contrato" | "apresentacao" | "clausula" = input.kind === "apresentacao" ? "apresentacao" : input.kind === "clausula" ? "clausula" : "contrato";
  let content: unknown;
  try {
    content = kind === "clausula" ? { html: cleanHtml(str((input.content as { html?: string })?.html, 100_000)) } : cleanContent(kind, input.content);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Conteúdo inválido." };
  }
  const values = { kind, name, description: str(input.description, 300) || null, content, updatedAt: new Date() };
  if (input.id && /^[0-9a-f-]{36}$/i.test(input.id)) {
    await db.update(schema.docTemplates).set(values).where(eq(schema.docTemplates.id, input.id));
  } else {
    await db.insert(schema.docTemplates).values({ ...values, createdById: user.id });
  }
  await audit(user, "modelo_salvo", `Salvou o modelo "${name}"`, { entity: "modelo" });
  revalidatePath("/documentos/modelos");
  return { ok: true };
}

/** Salva o documento atual como modelo reutilizável (já sem os dados do cliente: variáveis ficam como estão). */
export async function saveAsTemplate(id: string, name: string) {
  const user = await requireAccess("documentos", "manage");
  const doc = await getDoc(id, user);
  if (!doc) return { error: "Documento não encontrado." };
  const c = doc.content as DocContent;
  const clean = c.kind === "contrato" ? { ...c, fields: {} } : c;
  return saveTemplate({ kind: doc.kind, name: name || doc.title, content: clean });
}

export async function deleteTemplate(id: string) {
  const user = await requireAccess("documentos", "manage");
  await db.delete(schema.docTemplates).where(eq(schema.docTemplates.id, id));
  await audit(user, "modelo_excluido", "Excluiu um modelo", { entity: "modelo", entityId: id });
  revalidatePath("/documentos/modelos");
  return { ok: true };
}

/* ------------------------------- dados do estúdio ------------------------------ */

export async function saveStudio(_: unknown, form: FormData) {
  const user = await requireAccess("configuracoes", "manage");
  const value: StudioProfile = { ...EMPTY_STUDIO };
  for (const k of Object.keys(EMPTY_STUDIO) as (keyof StudioProfile)[]) value[k] = str(form.get(k), 300).trim();
  if (!value.name) return { error: "Informe o nome do estúdio." };
  await db
    .insert(schema.appSettings)
    .values({ key: "studio", value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  await audit(user, "estudio_atualizado", "Atualizou os dados do estúdio", { entity: "configuracao" });
  revalidatePath("/", "layout");
  return { ok: true, msg: "Dados do estúdio salvos" };
}

