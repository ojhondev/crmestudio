import "server-only";
import crypto from "node:crypto";
import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { todayISO } from "@/lib/format";
import { cleanHtml } from "./sanitize";
import { EMPTY_STUDIO, type ContractContent, type DeckContent, type DocContent, type StudioProfile } from "./types";
import { resolveText, valueMap, type VarContext } from "./variables";
import { getConfig } from "@/lib/propostas/server";
import { propostaValueMap } from "@/lib/propostas/vars";

export async function getStudio(): Promise<StudioProfile> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "studio")).limit(1);
  return { ...EMPTY_STUDIO, ...((row?.value as Partial<StudioProfile> | undefined) ?? {}) };
}

/** Quem tem "só os próprios" vê documentos que criou ou que pertencem a negócios seus. */
export function docScope(user: SessionUser): SQL | undefined {
  if (!user.ownOnly) return undefined;
  const mine = db.select({ id: schema.deals.id }).from(schema.deals).where(dealScope(user));
  return or(eq(schema.documents.createdById, user.id), inArray(schema.documents.dealId, mine));
}

export async function getDoc(id: string, user: SessionUser) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, id), docScope(user)))
    .limit(1);
  return doc ?? null;
}

export async function buildContext(doc: { number: string | null; title: string; contactId: string | null; dealId: string | null; content: unknown; editalId?: string | null }): Promise<VarContext> {
  const studio = await getStudio();
  const [deal] = doc.dealId ? await db.select().from(schema.deals).where(eq(schema.deals.id, doc.dealId)).limit(1) : [];
  const contactId = doc.contactId ?? deal?.contactId ?? null;
  const [contact] = contactId ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1) : [];
  const content = doc.content as DocContent;
  // documento de proposta: edital.*, proposta.* e dados do estúdio (representante, responsáveis técnicos)
  let extra: Record<string, string> | undefined;
  if (doc.editalId) {
    const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, doc.editalId)).limit(1);
    const [dossie] = e ? await db.select().from(schema.propostaDossies).where(eq(schema.propostaDossies.editalId, e.id)).limit(1) : [];
    extra = propostaValueMap(e ?? null, dossie ?? null, await getConfig());
  } else {
    extra = propostaValueMap(null, null, await getConfig());
  }
  return {
    extra,
    studio,
    contact: contact ?? null,
    deal: deal ?? null,
    doc: { number: doc.number, title: doc.title },
    fields: content.kind === "contrato" ? content.fields : undefined,
    today: todayISO(),
  };
}

/** Número sequencial por tipo e ano: CT-2026-0001 / PR-2026-0001. */
export async function nextNumber(kind: "contrato" | "apresentacao") {
  const prefix = `${kind === "contrato" ? "CT" : "PR"}-${todayISO().slice(0, 4)}-`;
  const [row] = await db
    .select({ n: sql<string>`coalesce(max(substring(${schema.documents.number} from '[0-9]+$')::int), 0)` })
    .from(schema.documents)
    .where(like(schema.documents.number, `${prefix}%`));
  return `${prefix}${String(Number(row?.n ?? 0) + 1).padStart(4, "0")}`;
}

export const newToken = () => crypto.randomBytes(24).toString("base64url");

/** Conteúdo pronto para exibir: variáveis trocadas, HTML sanitizado. */
export function renderContract(content: ContractContent, map: Record<string, string>) {
  return cleanHtml(resolveText(content.html, map, { html: true }));
}

export const asContent = (v: unknown) => v as DocContent;
export const isContract = (c: DocContent): c is ContractContent => c.kind === "contrato";
export const isDeck = (c: DocContent): c is DeckContent => c.kind === "apresentacao";

export async function logEvent(documentId: string, type: string, meta?: Record<string, unknown>) {
  await db.insert(schema.documentEvents).values({ documentId, type, meta: meta ?? null });
}

export async function listEvents(documentId: string) {
  return db.select().from(schema.documentEvents).where(eq(schema.documentEvents.documentId, documentId)).orderBy(desc(schema.documentEvents.at));
}

/** Documento + contexto resolvido, a partir do token público (sem login). Mostra o congelado quando já foi enviado. */
export async function getPublic(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.publicToken, token)).limit(1);
  if (!doc || doc.status === "rascunho" || doc.status === "cancelado") return null;
  const snap = (doc.snapshot ?? null) as { content: DocContent; map: Record<string, string> } | null;
  if (!snap) return null;
  return { doc, content: snap.content, map: snap.map };
}

export { valueMap };

/** Opções para o diálogo "Novo documento": modelos do sistema + modelos próprios. */
export async function templateOptions() {
  const custom = await db.select().from(schema.docTemplates).orderBy(schema.docTemplates.name);
  const { BUILTIN_CONTRACTS } = await import("./templates");
  return {
    contractTemplates: [
      ...BUILTIN_CONTRACTS.map((t) => ({ value: t.slug, label: t.name, hint: t.description })),
      ...custom.filter((t) => t.kind === "contrato").map((t) => ({ value: t.id, label: `${t.name} (seu modelo)`, hint: t.description })),
    ],
    deckTemplates: [
      { value: "padrao", label: "Proposta padrão", hint: "Capa, escopo, cronograma, investimento e condições" },
      ...custom.filter((t) => t.kind === "apresentacao").map((t) => ({ value: t.id, label: `${t.name} (seu modelo)`, hint: t.description })),
    ],
  };
}
