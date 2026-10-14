"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseLocalInput } from "@/lib/format";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "__none" ? s : null;
};

export async function saveEvent(_: unknown, form: FormData) {
  const user = await requireUser();
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

  const partner = user.role === "parceiro";
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
  };

  if (id) {
    const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
    if (!ev || (partner && ev.userId !== user.id)) return { error: "Sem acesso a este evento." };
    await db.update(schema.events).set(values).where(eq(schema.events.id, id));
  } else {
    await db.insert(schema.events).values(values);
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
  const user = await requireUser();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return;
  if (user.role === "parceiro" && ev.userId !== user.id) return;
  await db.delete(schema.events).where(eq(schema.events.id, id));
  revalidatePath("/", "layout");
}
