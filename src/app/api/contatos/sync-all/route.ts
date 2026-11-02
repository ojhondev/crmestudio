import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { bearer } from "@/lib/editais/oidc";
import { syncAllContacts } from "@/lib/contacts-import/service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Sincronização diária do Google Contatos (só quem ligou a sincronização automática). Autenticação por CRON_SECRET
 * (Vercel Cron). Também é chamada, em segundo plano, pela rodada diária /api/cron/automacoes (limite de crons do plano).
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = bearer(req) ?? "";
  const a = Buffer.from(secret ?? "");
  const b = Buffer.from(got);
  if (!secret || !got || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await syncAllContacts()) }, { headers: { "cache-control": "no-store" } });
}
export const GET = run;
export const POST = run;
