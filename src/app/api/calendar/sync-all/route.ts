import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { bearer, oidcConfig, verifyGithubOidc } from "@/lib/editais/oidc";
import { syncAll } from "@/lib/calendar/service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function cronSecretOk(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = bearer(req) ?? "";
  const a = Buffer.from(secret ?? "");
  const b = Buffer.from(got);
  return !!secret && !!got && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Sincroniza o Google Agenda de todas as pessoas conectadas.
 * Chamado a cada 15 min pelo GitHub Actions (token OIDC, workflow calendar-sync.yml, mesmo padrão dos Editais)
 * e, como reserva diária, pelo Vercel Cron (CRON_SECRET).
 */
async function run(req: Request) {
  const token = bearer(req);
  // `job_workflow_ref` precisa ser o calendar-sync.yml: o token do workflow de Editais não serve aqui
  const oidc = await verifyGithubOidc(token, oidcConfig({ ...process.env, EDITAIS_WORKFLOW_FILE: "calendar-sync.yml" }));
  if (!oidc.ok && !cronSecretOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await syncAll()) }, { headers: { "cache-control": "no-store" } });
}

export const GET = run;
export const POST = run;
