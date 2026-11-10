import "server-only";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { isoDateBR } from "@/lib/format";
import { db, schema } from "@/lib/db";
import { isNotifType, type NotifType } from "@/lib/notifications-types";

export type NotifPayload = {
  type: NotifType;
  title: string;
  body?: string | null;
  href?: string | null;
  entity?: "tarefa" | "negocio" | "edital" | null;
  entityId?: string | null;
  /** mesma chave + mesma pessoa = avisa uma única vez */
  dedupeKey?: string | null;
};

/**
 * Cria avisos para várias pessoas de uma vez. Idempotente: com `dedupeKey`, o mesmo fato nunca avisa a mesma pessoa duas vezes.
 * Quem silenciou tudo ou desligou a categoria recebe o aviso já arquivado e lido (a chave continua valendo,
 * então ligar de novo depois não despeja avisos antigos).
 * Devolve os ids de quem realmente recebeu um aviso novo (e visível).
 */
/** Limite duro de avisos por pessoa por dia (fuso do estúdio). Passou disso, vira um único aviso “limite atingido”. */
export const DAILY_CAP = 20;

export async function notifyUsers(userIds: string[], p: NotifPayload | ((userId: string) => NotifPayload)): Promise<string[]> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  const prefs = await db.select().from(schema.notificationPrefs).where(inArray(schema.notificationPrefs.userId, ids));
  const prefOf = new Map(prefs.map((x) => [x.userId, x]));
  const now = new Date();
  const day = isoDateBR(now);
  const counts = await db
    .select({ userId: schema.notifications.userId, n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(inArray(schema.notifications.userId, ids), gte(schema.notifications.createdAt, new Date(`${day}T00:00:00-03:00`)), isNull(schema.notifications.archivedAt)))
    .groupBy(schema.notifications.userId);
  const todayCount = new Map(counts.map((c) => [c.userId, c.n]));
  const capped = new Set(ids.filter((u) => (todayCount.get(u) ?? 0) >= DAILY_CAP));
  const rows = ids.map((userId) => {
    const pay0 = typeof p === "function" ? p(userId) : p;
    const pay: NotifPayload = capped.has(userId)
      ? { type: "sistema", title: "Limite diário de avisos atingido", body: `Você já recebeu ${DAILY_CAP} avisos hoje. O restante continua nas telas de Tarefas e Negócios; amanhã os avisos voltam a chegar.`, href: "/notificacoes", dedupeKey: `cap:${day}` }
      : pay0;
    const pref = prefOf.get(userId);
    const silenced = !!pref && (pref.muted || pref.disabledTypes.includes(pay.type));
    return {
      userId,
      type: pay.type,
      title: pay.title.slice(0, 200),
      body: pay.body ? pay.body.slice(0, 600) : null,
      href: pay.href ?? null,
      entity: pay.entity ?? null,
      entityId: pay.entityId ?? null,
      dedupeKey: pay.dedupeKey ?? null,
      readAt: silenced ? now : null,
      archivedAt: silenced ? now : null,
    };
  });
  const inserted = await db
    .insert(schema.notifications)
    .values(rows)
    .onConflictDoNothing()
    .returning({ userId: schema.notifications.userId });
  const visible = new Set(rows.filter((r) => !r.archivedAt && !capped.has(r.userId)).map((r) => r.userId));
  return inserted.map((r) => r.userId).filter((u) => visible.has(u));
}

export type NotifItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  at: string;
};

export type NotifQuery = { type?: string; unreadOnly?: boolean; limit?: number; before?: string };

export async function listNotifications(userId: string, q: NotifQuery = {}): Promise<NotifItem[]> {
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        isNull(schema.notifications.archivedAt),
        q.type && isNotifType(q.type) ? eq(schema.notifications.type, q.type) : undefined,
        q.unreadOnly ? isNull(schema.notifications.readAt) : undefined,
        q.before ? lt(schema.notifications.createdAt, new Date(q.before)) : undefined,
      ),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(Math.min(Math.max(q.limit ?? 30, 1), 100));
  return rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, href: r.href, read: !!r.readAt, at: r.createdAt.toISOString() }));
}

export async function unreadCount(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt), isNull(schema.notifications.archivedAt)));
  return r?.n ?? 0;
}

export async function getPrefs(userId: string) {
  const [p] = await db.select().from(schema.notificationPrefs).where(eq(schema.notificationPrefs.userId, userId));
  return { muted: p?.muted ?? false, disabledTypes: (p?.disabledTypes ?? []).filter(isNotifType) as NotifType[] };
}
