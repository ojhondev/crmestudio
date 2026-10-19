import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { housekeeping, runTimeRules } from "@/lib/automations-engine";

export const maxDuration = 60;

/**
 * Rodada diária das automações baseadas em tempo (Vercel Cron, em vercel.json).
 * A Vercel envia `Authorization: Bearer $CRON_SECRET`. A rotina é idempotente: repetir não duplica avisos.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(secret ?? "");
  const b = Buffer.from(got);
  if (!secret || !got || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const result = await runTimeRules();
  await housekeeping().catch((e) => console.error("[cron] limpeza", e));
  return NextResponse.json({ ok: true, ...result });
}
