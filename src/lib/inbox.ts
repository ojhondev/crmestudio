import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Registra uma mensagem recebida: acha/cria a conversa pelo número e,
 * se o número ainda não for um contato, cria o lead automaticamente
 * (origem WhatsApp) — como no Kommo.
 */
export async function recordInbound(input: { phone: string; name?: string | null; body: string; waMessageId?: string | null; at?: Date }) {
  const at = input.at ?? new Date();
  if (input.waMessageId) {
    const [dup] = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.waMessageId, input.waMessageId))
      .limit(1);
    if (dup) return null; // a Meta reenvia webhooks; ignora duplicata
  }

  let [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.phone, input.phone)).limit(1);
  if (!conv) {
    let [contact] = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(eq(schema.contacts.phone, input.phone))
      .limit(1);
    if (!contact) {
      [contact] = await db
        .insert(schema.contacts)
        .values({ name: input.name || `+${input.phone}`, phone: input.phone, source: "WhatsApp" })
        .returning({ id: schema.contacts.id });
    }
    [conv] = await db
      .insert(schema.conversations)
      .values({ phone: input.phone, profileName: input.name ?? null, contactId: contact.id })
      .onConflictDoNothing()
      .returning();
    if (!conv) [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.phone, input.phone));
  }

  await db.insert(schema.messages).values({
    conversationId: conv.id,
    direction: "in",
    body: input.body,
    waMessageId: input.waMessageId ?? null,
    status: "received",
    createdAt: at,
  });
  await db
    .update(schema.conversations)
    .set({
      unread: sql`${schema.conversations.unread} + 1`,
      lastMessageAt: at,
      lastInboundAt: at,
      preview: input.body.slice(0, 200),
      status: "aberta",
      profileName: input.name ?? conv.profileName,
    })
    .where(eq(schema.conversations.id, conv.id));
  return conv.id;
}

export async function updateMessageStatus(waMessageId: string, status: string) {
  await db.update(schema.messages).set({ status }).where(eq(schema.messages.waMessageId, waMessageId));
}
