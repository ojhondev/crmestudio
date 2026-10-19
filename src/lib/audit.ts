import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";

type Actor = { id: string; name: string } | null;

/** Registra na trilha de auditoria. Nunca derruba a operação principal. */
export async function audit(
  actor: Actor,
  action: string,
  summary: string,
  opts: { entity?: string; entityId?: string; meta?: Record<string, unknown> } = {},
) {
  try {
    await db.insert(schema.auditLog).values({
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      action,
      summary,
      entity: opts.entity ?? null,
      entityId: opts.entityId ?? null,
      meta: opts.meta ?? null,
    });
  } catch (e) {
    console.error("[audit] falha ao registrar", action, e);
  }
}

const WINDOW_MIN = 15;
const MAX_FAILS = 8;

/** Bloqueio simples de tentativas: muitas falhas do mesmo e-mail em 15 minutos. */
export async function tooManyLoginFailures(email: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [row] = await db
    .select({ n: count() })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, "login_falhou"), eq(schema.auditLog.entityId, email), gt(schema.auditLog.at, since)));
  return (row?.n ?? 0) >= MAX_FAILS;
}
