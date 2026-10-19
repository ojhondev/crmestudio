"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { insideWindow, sendText, whatsappConnected } from "@/lib/whatsapp";
import { recordInbound } from "@/lib/inbox";
import { normalizePhone } from "@/lib/format";

async function getConv(id: string) {
  const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).limit(1);
  if (!c) throw new Error("Conversa não encontrada");
  return c;
}

export async function sendMessage(conversationId: string, text: string, asNote = false) {
  const user = await requireAccess("atendimento", "edit");
  const body = text.trim();
  if (!body) return { error: "Mensagem vazia." };
  const conv = await getConv(conversationId);

  if (asNote) {
    await db.insert(schema.messages).values({ conversationId, direction: "note", body, authorId: user.id, status: "local" });
    revalidatePath("/atendimento");
    return { ok: true };
  }

  if (!insideWindow(conv.lastInboundAt))
    return {
      error: "Fora da janela de 24h da Meta: o cliente precisa escrever primeiro (ou usar um modelo aprovado).",
    };

  const res = await sendText(conv.phone, body);
  if (!res.ok) return { error: `WhatsApp recusou: ${res.error}` };

  const now = new Date();
  await db.insert(schema.messages).values({
    conversationId,
    direction: "out",
    body,
    authorId: user.id,
    waMessageId: res.id,
    status: res.status,
    createdAt: now,
  });
  await db
    .update(schema.conversations)
    .set({ lastMessageAt: now, preview: body.slice(0, 200), unread: 0, assigneeId: conv.assigneeId ?? user.id })
    .where(eq(schema.conversations.id, conversationId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markRead(conversationId: string) {
  await requireAccess("atendimento", "view");
  await db.update(schema.conversations).set({ unread: 0 }).where(eq(schema.conversations.id, conversationId));
  revalidatePath("/", "layout");
}

export async function setStatus(conversationId: string, status: "aberta" | "resolvida") {
  await requireAccess("atendimento", "edit");
  await db.update(schema.conversations).set({ status, unread: 0 }).where(eq(schema.conversations.id, conversationId));
  revalidatePath("/", "layout");
}

export async function assignConversation(conversationId: string, userId: string | null) {
  await requireAccess("atendimento", "edit");
  await db.update(schema.conversations).set({ assigneeId: userId }).where(eq(schema.conversations.id, conversationId));
  revalidatePath("/atendimento");
}

/** Abre (ou reabre) conversa com um número, a partir do CRM. */
export async function startConversation(form: FormData) {
  await requireAccess("atendimento", "edit");
  const phone = normalizePhone(String(form.get("phone") || ""));
  if (!phone) redirect("/atendimento");
  let [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.phone, phone)).limit(1);
  if (!conv) {
    const [contact] = await db
      .select({ id: schema.contacts.id, name: schema.contacts.name })
      .from(schema.contacts)
      .where(eq(schema.contacts.phone, phone))
      .limit(1);
    [conv] = await db
      .insert(schema.conversations)
      .values({ phone, contactId: contact?.id ?? null, profileName: contact?.name ?? null, lastMessageAt: new Date() })
      .returning();
  }
  redirect(`/atendimento?c=${conv.id}`);
}

/** Só no modo simulado: finge que o cliente respondeu (para testar o fluxo e a Ana). */
export async function simulateInbound(conversationId: string, text: string) {
  await requireAccess("atendimento", "edit");
  if (whatsappConnected()) return { error: "WhatsApp real conectado — simulação desativada." };
  const conv = await getConv(conversationId);
  await recordInbound({ phone: conv.phone, name: conv.profileName, body: text.trim() || "Olá!" });
  revalidatePath("/", "layout");
  return { ok: true };
}
