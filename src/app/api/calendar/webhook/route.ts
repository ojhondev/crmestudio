import { NextResponse } from "next/server";
import { connectionForChannel, syncConnection } from "@/lib/calendar/service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Notificações de push do Google Agenda (events.watch). O Google envia cabeçalhos X-Goog-*; só aceitamos se o id do canal
 * existir e o token secreto (que só nós e o Google conhecemos) bater. A notificação não traz dados: só dispara uma sincronização.
 */
export async function POST(req: Request) {
  const conn = await connectionForChannel(req.headers.get("x-goog-channel-id"), req.headers.get("x-goog-channel-token"));
  if (!conn) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const state = req.headers.get("x-goog-resource-state");
  if (state === "sync") return new NextResponse(null, { status: 200 }); // confirmação da criação do canal
  await syncConnection(conn.id, { deadlineMs: 45_000 });
  return new NextResponse(null, { status: 200 });
}
