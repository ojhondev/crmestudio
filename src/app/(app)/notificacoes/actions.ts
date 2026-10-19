"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NOTIF_TYPE_KEYS, isNotifType } from "@/lib/notifications-types";
import { getPrefs } from "@/lib/notifications";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Marca avisos como lidos (só os da própria pessoa). */
export async function markRead(ids: string[]) {
  const user = await requireUser();
  const list = (Array.isArray(ids) ? ids : []).filter(isId).slice(0, 200);
  if (!list.length) return { ok: true };
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), inArray(schema.notifications.id, list), isNull(schema.notifications.readAt)));
  return { ok: true };
}

export async function markUnread(id: string) {
  const user = await requireUser();
  if (!isId(id)) return { error: "Aviso inválido." };
  await db.update(schema.notifications).set({ readAt: null }).where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.id, id)));
  return { ok: true };
}

/** Marca todos como lidos (opcionalmente só uma categoria). */
export async function markAllRead(type?: string) {
  const user = await requireUser();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, user.id),
        isNull(schema.notifications.readAt),
        isNull(schema.notifications.archivedAt),
        type && isNotifType(type) ? eq(schema.notifications.type, type) : undefined,
      ),
    );
  revalidatePath("/notificacoes");
  return { ok: true };
}

export async function archiveNotifications(ids: string[]) {
  const user = await requireUser();
  const list = (Array.isArray(ids) ? ids : []).filter(isId).slice(0, 200);
  if (!list.length) return { ok: true };
  const now = new Date();
  await db
    .update(schema.notifications)
    .set({ archivedAt: now, readAt: now })
    .where(and(eq(schema.notifications.userId, user.id), inArray(schema.notifications.id, list)));
  revalidatePath("/notificacoes");
  return { ok: true };
}

export async function archiveAllRead() {
  const user = await requireUser();
  await db
    .update(schema.notifications)
    .set({ archivedAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.archivedAt), isNotNull(schema.notifications.readAt)));
  revalidatePath("/notificacoes");
  return { ok: true };
}

/** Preferências: silenciar tudo e/ou desligar categorias. Avisos novos dessas categorias chegam já arquivados. */
export async function savePrefs(input: { muted: boolean; disabledTypes: string[] }) {
  const user = await requireUser();
  const disabled = [...new Set((Array.isArray(input.disabledTypes) ? input.disabledTypes : []).filter((t) => NOTIF_TYPE_KEYS.includes(t as never)))];
  await db
    .insert(schema.notificationPrefs)
    .values({ userId: user.id, muted: !!input.muted, disabledTypes: disabled })
    .onConflictDoUpdate({ target: schema.notificationPrefs.userId, set: { muted: !!input.muted, disabledTypes: disabled, updatedAt: new Date() } });
  revalidatePath("/notificacoes");
  return { ok: true, prefs: await getPrefs(user.id) };
}
