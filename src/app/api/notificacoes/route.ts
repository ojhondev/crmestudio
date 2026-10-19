import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listNotifications, unreadCount } from "@/lib/notifications";
import { scheduleLazyTick } from "@/lib/automations-engine";

/** Lista de avisos + contador de não lidos da pessoa logada (o sino consulta a cada ~60 s e ao voltar para a aba). */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const sp = new URL(req.url).searchParams;
  // quem abre o app também "acorda" as regras de tempo (no máximo uma rodada a cada 15 min, para todo mundo)
  scheduleLazyTick();
  const [unread, items] = await Promise.all([
    unreadCount(user.id),
    listNotifications(user.id, {
      type: sp.get("type") ?? undefined,
      unreadOnly: sp.get("unread") === "1",
      limit: Number(sp.get("limit")) || 20,
      before: sp.get("before") ?? undefined,
    }),
  ]);
  return NextResponse.json({ unread, items }, { headers: { "Cache-Control": "no-store" } });
}
