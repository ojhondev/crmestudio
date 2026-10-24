import { NextResponse } from "next/server";
import { getUser, has } from "@/lib/auth";
import { sweepStaleRuns } from "@/lib/editais/ingest";
import { recentRuns } from "@/lib/editais/queries";

/** Estado das rodadas para o polling leve da tela de Editais (só quem vê o módulo). */
export async function GET() {
  const user = await getUser();
  if (!user || user.mustChangePassword || !has(user, "editais", "view")) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  await sweepStaleRuns();
  return NextResponse.json({ runs: await recentRuns(6) }, { headers: { "cache-control": "no-store" } });
}
