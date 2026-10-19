import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq, max, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { normalizePhone } from "@/lib/format";

/**
 * Entrada de leads vindos do site institucional (formulário de contato e
 * popup de orçamento). Chamada servidor→servidor, protegida por LEADS_API_KEY.
 */
const Body = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  telefone: z.string().trim().max(40).optional(),
  assunto: z.string().trim().max(120).optional(),
  mensagem: z.string().trim().min(1).max(4000),
  origem: z.string().trim().max(60).optional(),
});

function authorized(req: Request) {
  const key = process.env.LEADS_API_KEY;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!key || !got) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const d = parsed.data;

  const email = d.email ? d.email.toLowerCase() : null;
  const phone = normalizePhone(d.telefone);
  const origem = d.origem || "Site";

  // reaproveita o contato se o e-mail ou o telefone já existirem
  const matchers = [email ? eq(schema.contacts.email, email) : undefined, phone ? eq(schema.contacts.phone, phone) : undefined].filter(
    (m): m is NonNullable<typeof m> => !!m,
  );
  let contactId: string | undefined;
  if (matchers.length) {
    const [found] = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(matchers.length === 1 ? matchers[0] : or(...matchers))
      .limit(1);
    contactId = found?.id;
  }
  if (!contactId) {
    const [created] = await db
      .insert(schema.contacts)
      .values({ name: d.nome, email, phone, source: "Site" })
      .returning({ id: schema.contacts.id });
    contactId = created.id;
  }

  const [first] = await db.select().from(schema.stages).orderBy(schema.stages.position).limit(1);
  const [{ top }] = await db.select({ top: max(schema.deals.position) }).from(schema.deals).where(eq(schema.deals.stageId, first.id));
  const [deal] = await db
    .insert(schema.deals)
    .values({
      title: `${d.assunto || "Contato pelo site"} — ${d.nome}`,
      contactId,
      stageId: first.id,
      position: (top ?? 0) + 1,
      notes: d.mensagem,
    })
    .returning({ id: schema.deals.id });
  await db.insert(schema.activities).values({
    dealId: deal.id,
    contactId,
    type: "nota",
    body: `Lead recebido pelo site (${origem}${d.assunto ? ` · ${d.assunto}` : ""}):\n${d.mensagem}`,
  });

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, dealId: deal.id }, { status: 201 });
}
