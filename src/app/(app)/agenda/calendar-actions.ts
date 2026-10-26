"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { EVENT_TYPES } from "@/lib/constants";
import { disconnect, getConnection, isLive, syncConnection } from "@/lib/calendar/service";

/** Sincroniza agora o Google Agenda da própria pessoa. */
export async function syncNow() {
  const user = await requireAccess("agenda");
  const c = await getConnection(user.id);
  if (!isLive(c)) return { ok: false, error: "O Google Agenda não está conectado." };
  const r = await syncConnection(c.id, { deadlineMs: 50_000 });
  revalidatePath("/", "layout");
  if (r.skipped === "ocupado") return { ok: true, busy: true, changes: 0 };
  if (!r.ok) return { ok: false, error: r.error ?? "Não foi possível sincronizar." };
  return { ok: true, changes: r.created + r.updated + r.cancelled + r.pushed + r.removed, summary: r };
}

/** Desconecta o Google Agenda da própria pessoa; `removeEvents` apaga do Google os eventos criados pelo CRM. */
export async function disconnectGoogle(removeEvents: boolean) {
  const user = await requireAccess("agenda");
  const r = await disconnect(user.id, !!removeEvents);
  await audit(user, "agenda_google_desconectada", `Desconectou o Google Agenda${removeEvents ? ` e removeu ${r.removed} evento(s) do Google` : " (eventos mantidos no Google)"}`, { entity: "agenda" });
  revalidatePath("/", "layout");
  return { ok: true, removed: r.removed };
}

/** Escolhe quais tipos de evento do CRM vão para o Google (vazio = todos). */
export async function saveSyncTypes(types: string[]) {
  const user = await requireAccess("agenda");
  const c = await getConnection(user.id);
  if (!isLive(c)) return { ok: false, error: "O Google Agenda não está conectado." };
  const valid = Object.keys(EVENT_TYPES);
  const clean = [...new Set(types)].filter((t) => valid.includes(t));
  const syncTypes = clean.length === 0 || clean.length === valid.length ? null : clean;
  await db.update(schema.calendarConnections).set({ syncTypes, updatedAt: new Date() }).where(eq(schema.calendarConnections.id, c.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
