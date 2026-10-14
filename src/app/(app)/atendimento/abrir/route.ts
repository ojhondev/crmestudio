import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/format";

/** /atendimento/abrir?phone=55119… → acha ou cria a conversa e abre. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getUser();
  if (!user || user.role === "parceiro") return NextResponse.redirect(new URL("/", url));
  const phone = normalizePhone(url.searchParams.get("phone"));
  if (!phone) return NextResponse.redirect(new URL("/atendimento", url));

  let [conv] = await db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.phone, phone)).limit(1);
  if (!conv) {
    const [contact] = await db
      .select({ id: schema.contacts.id, name: schema.contacts.name })
      .from(schema.contacts)
      .where(eq(schema.contacts.phone, phone))
      .limit(1);
    [conv] = await db
      .insert(schema.conversations)
      .values({ phone, contactId: contact?.id ?? null, profileName: contact?.name ?? null, lastMessageAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: schema.conversations.id });
    if (!conv) [conv] = await db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.phone, phone));
  }
  return NextResponse.redirect(new URL(`/atendimento?c=${conv.id}`, url));
}
