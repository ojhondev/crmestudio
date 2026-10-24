import { NextResponse } from "next/server";
import { pendingForGithub } from "@/lib/editais/ingest";
import { bearer, oidcConfig, verifyGithubOidc } from "@/lib/editais/oidc";

export const maxDuration = 30;

/**
 * O workflow agendado (a cada 30 min) pergunta aqui se alguém clicou em “Buscar oportunidades” (pedido pendente)
 * ou se há uma rodada parcial para retomar. Autenticado só pelo token OIDC do GitHub.
 */
export async function GET(req: Request) {
  const auth = await verifyGithubOidc(bearer(req), oidcConfig());
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado", reason: auth.reason }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await pendingForGithub()) }, { headers: { "cache-control": "no-store" } });
}
