"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { parseLocalInput } from "@/lib/format";
import { pushEvent, removeEventEverywhere } from "@/lib/calendar/service";

/** Espera o envio ao Google por no máximo 8 s (o resto continua em segundo plano e a rodada periódica completa). */
const withTimeout = (p: Promise<unknown>) => Promise.race([p, new Promise((r) => setTimeout(r, 8000))]);

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "__none" ? s : null;
};

export async function saveEvent(_: unknown, form: FormData) {
  const user = await requireAccess("agenda", "edit");
  const id = str(form.get("id"));
  const title = String(form.get("title") || "").trim();
  if (!title) return { error: "Dê um título ao evento." };
  const date = String(form.get("date") || "");
  const allDay = form.get("allDay") === "on";
  const endDate = str(form.get("endDate")) ?? date;
  const startsAt = parseLocalInput(allDay ? date : `${date}T${form.get("start") || "09:00"}`);
  let endsAt = parseLocalInput(allDay ? endDate : `${endDate}T${form.get("end") || "10:00"}`);
  if (!startsAt || !endsAt) return { error: "Data inválida." };
  if (allDay) endsAt = new Date(endsAt.getTime() + 864e5 - 1000); // até 23:59:59 do último dia
  if (endsAt < startsAt) return { error: "O fim precisa ser depois do início." };

  const partner = user.ownOnly; // só os próprios: não escolhe responsável nem contato
  const values = {
    title,
    type: String(form.get("type") || "reuniao"),
    startsAt,
    endsAt,
    allDay,
    location: str(form.get("location")),
    description: str(form.get("description")),
    dealId: str(form.get("dealId")),
    contactId: partner ? null : str(form.get("contactId")),
    userId: partner ? user.id : (str(form.get("userId")) ?? user.id),
    updatedAt: new Date(),
  };
  // opções do Google Agenda: só chegam quando a pessoa tem o Google conectado (campo oculto "gcal")
  const google =
    form.get("gcal") === "1"
      ? { meet: form.get("meet") === "on", inviteGuests: form.get("inviteGuests") === "on", guestEmails: str(form.get("guestEmails")) }
      : {};

  if (id) {
    const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
    if (!ev || (partner && ev.userId !== user.id)) return { error: "Sem acesso a este evento." };
    // salvar de novo reativa um evento que tinha sido cancelado pelo Google Agenda
    await db.update(schema.events).set({ ...values, ...google, cancelledAt: null }).where(eq(schema.events.id, id));
    await withTimeout(pushEvent(id));
  } else {
    const [created] = await db.insert(schema.events).values({ ...values, ...google }).returning({ id: schema.events.id });
    await withTimeout(pushEvent(created.id));
    if (values.dealId)
      await db.insert(schema.activities).values({
        dealId: values.dealId,
        userId: user.id,
        type: values.type === "visita" ? "visita" : "reuniao",
        body: `Agendado: ${title}`,
      });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteEvent(id: string) {
  const user = await requireAccess("agenda", "edit");
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return;
  if (user.ownOnly && ev.userId !== user.id) return;
  await removeEventEverywhere(id); // apaga o espelho no Google Agenda antes
  await db.delete(schema.events).where(eq(schema.events.id, id));
  revalidatePath("/", "layout");
}
