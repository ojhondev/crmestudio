import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { dealScope } from "@/lib/deals";

export type Option = { id: string; name: string; hint?: string | null };

/** Opções dos formulários. Parceiro só enxerga os contatos dos negócios dele. */
export async function getFormOptions(user: SessionUser) {
  const partner = user.role === "parceiro";
  const partnerContactIds = partner
    ? (await db.select({ id: schema.deals.contactId }).from(schema.deals).where(dealScope(user)))
        .map((r) => r.id)
        .filter((id): id is string => !!id)
    : [];
  const [users, contacts, stages] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.active, true))
      .orderBy(asc(schema.users.name)),
    db
      .select({ id: schema.contacts.id, name: schema.contacts.name, hint: schema.contacts.company })
      .from(schema.contacts)
      .where(partner ? inArray(schema.contacts.id, partnerContactIds.length ? partnerContactIds : ["00000000-0000-0000-0000-000000000000"]) : undefined)
      .orderBy(asc(schema.contacts.name)),
    db.select().from(schema.stages).orderBy(asc(schema.stages.position)),
  ]);
  return {
    team: users.filter((u) => u.role !== "parceiro").map(({ id, name }) => ({ id, name })),
    partners: users.filter((u) => u.role === "parceiro").map(({ id, name }) => ({ id, name })),
    contacts: contacts as Option[],
    stages,
  };
}

export type FormOptions = Awaited<ReturnType<typeof getFormOptions>>;
