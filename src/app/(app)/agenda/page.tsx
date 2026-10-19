import type { Metadata } from "next";
import { headers } from "next/headers";
import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { dealScope } from "@/lib/deals";
import { todayISO } from "@/lib/format";
import { AgendaView } from "./agenda-view";
import { CalendarSync } from "./calendar-sync";

export const metadata: Metadata = { title: "Agenda" };

/** Grade mensal: domingo a sábado, sempre 6 semanas. Datas como "YYYY-MM-DD". */
function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 864e5);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10));
}

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const user = await requireAccess("agenda");
  const canEdit = has(user, "agenda", "edit");
  const canSeeContacts = has(user, "contatos") && !user.ownOnly;
  const sp = await searchParams;
  const h = await headers();
  const today = todayISO();
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const days = monthGrid(month);
  const from = new Date(`${days[0]}T00:00:00-03:00`);
  const to = new Date(new Date(`${days[41]}T00:00:00-03:00`).getTime() + 864e5);
  const partner = user.ownOnly;

  const [rows, deals, contacts, team, [me]] = await Promise.all([
    db
      .select({
        id: schema.events.id,
        title: schema.events.title,
        type: schema.events.type,
        startsAt: schema.events.startsAt,
        endsAt: schema.events.endsAt,
        allDay: schema.events.allDay,
        location: schema.events.location,
        description: schema.events.description,
        dealId: schema.events.dealId,
        contactId: schema.events.contactId,
        userId: schema.events.userId,
        dealTitle: schema.deals.title,
        userName: schema.users.name,
      })
      .from(schema.events)
      .leftJoin(schema.deals, eq(schema.events.dealId, schema.deals.id))
      .leftJoin(schema.users, eq(schema.events.userId, schema.users.id))
      .where(and(lt(schema.events.startsAt, to), gte(schema.events.endsAt, from), partner ? eq(schema.events.userId, user.id) : undefined))
      .orderBy(asc(schema.events.startsAt)),
    db.select({ id: schema.deals.id, name: schema.deals.title }).from(schema.deals).where(dealScope(user)).orderBy(asc(schema.deals.title)),
    !canSeeContacts ? [] : db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).orderBy(asc(schema.contacts.name)),
    partner
      ? []
      : db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(and(eq(schema.users.active, true), or(eq(schema.users.role, "admin"), eq(schema.users.role, "equipe")))),
    db.select({ token: schema.users.calendarToken }).from(schema.users).where(eq(schema.users.id, user.id)),
  ]);

  return (
    <>
      <AgendaView
        month={month}
        days={days}
        today={today}
        events={rows.map((e) => ({ ...e, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString() }))}
        deals={deals}
        contacts={contacts}
        team={team}
        userId={user.id}
        isPartner={partner}
        canEdit={canEdit}
        sync={<CalendarSync token={me.token} origin={`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`} />}
        openNew={sp.novo === "1"}
        presetDeal={typeof sp.deal === "string" ? sp.deal : undefined}
      />
    </>
  );
}
