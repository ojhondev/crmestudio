import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser, has } from "@/lib/auth";
import { loadTabs, sheetScope } from "@/lib/sheets/server";
import { printHtml } from "@/lib/sheets/print";

export const runtime = "nodejs";

/** GET /planilhas/[id]/imprimir?aba=<id> — página limpa para imprimir ou salvar como PDF (Ctrl+P). */
export async function GET(req: Request, { params }: RouteContext<"/planilhas/[id]/imprimir">) {
  const { id } = await params;
  const user = await getUser();
  if (!user || user.mustChangePassword || !has(user, "planilhas", "view")) return new Response("Sem acesso", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Planilha não encontrada", { status: 404 });
  const [sheet] = await db
    .select()
    .from(schema.sheets)
    .where(and(eq(schema.sheets.id, id), sheetScope(user)))
    .limit(1);
  if (!sheet) return new Response("Planilha não encontrada", { status: 404 });
  const tabs = await loadTabs(id);
  const only = tabs.find((t) => t.id === new URL(req.url).searchParams.get("aba"));
  return new Response(printHtml(sheet.name, only ? [only] : tabs, tabs), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
}
