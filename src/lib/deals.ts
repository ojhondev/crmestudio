import "server-only";
import { asc, desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

/** Filtro de visibilidade: parceiro só vê negócios dele. */
export const dealScope = (user: SessionUser) =>
  user.role === "parceiro" ? or(eq(schema.deals.partnerId, user.id), eq(schema.deals.ownerId, user.id)) : undefined;

export async function getBoard(user: SessionUser) {
  const [stages, rows] = await Promise.all([
    db.select().from(schema.stages).orderBy(asc(schema.stages.position)),
    db
      .select({
        id: schema.deals.id,
        title: schema.deals.title,
        stageId: schema.deals.stageId,
        position: schema.deals.position,
        valueCents: schema.deals.valueCents,
        service: schema.deals.service,
        property: schema.deals.property,
        location: schema.deals.location,
        expectedClose: schema.deals.expectedClose,
        updatedAt: schema.deals.updatedAt,
        contactName: schema.contacts.name,
        company: schema.contacts.company,
        ownerName: schema.users.name,
      })
      .from(schema.deals)
      .leftJoin(schema.contacts, eq(schema.deals.contactId, schema.contacts.id))
      .leftJoin(schema.users, eq(schema.deals.ownerId, schema.users.id))
      .where(dealScope(user))
      .orderBy(asc(schema.deals.position), desc(schema.deals.createdAt)),
  ]);
  return { stages, deals: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) };
}

export type BoardDeal = Awaited<ReturnType<typeof getBoard>>["deals"][number];
