import { gunzipSync } from "node:zlib";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser, has } from "@/lib/auth";
import { maybeSnapshot, sheetScope } from "@/lib/sheets/server";
import { sanitizeTab, splitTab } from "@/lib/sheets/sanitize";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /planilhas/[id]/salvar — autosave do editor.
 * Corpo (JSON, opcionalmente gzip com o cabeçalho x-gzip: 1): { base, order: string[], tabs: TabData[] (só as alteradas) }
 * Controle otimista: se `base` não for a versão atual, devolve 409 e nada é gravado.
 */
export async function POST(req: Request, { params }: RouteContext<"/planilhas/[id]/salvar">) {
  const { id } = await params;
  const user = await getUser();
  if (!user || user.mustChangePassword || !has(user, "planilhas", "edit")) return json({ error: "Sem permissão para editar." }, 403);
  if (!UUID.test(id)) return json({ error: "Planilha inválida." }, 404);

  let body: { base?: number; order?: unknown; tabs?: unknown };
  try {
    const raw = Buffer.from(await req.arrayBuffer());
    body = JSON.parse((req.headers.get("x-gzip") === "1" ? gunzipSync(raw) : raw).toString("utf8"));
  } catch {
    return json({ error: "Dados inválidos." }, 400);
  }
  const order = Array.isArray(body.order) ? body.order.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  if (!order.length) return json({ error: "A planilha precisa de ao menos uma aba." }, 400);
  if (new Set(order).size !== order.length) return json({ error: "Abas repetidas." }, 400);

  const [sheet] = await db
    .select()
    .from(schema.sheets)
    .where(and(eq(schema.sheets.id, id), sheetScope(user)))
    .limit(1);
  if (!sheet) return json({ error: "Planilha não encontrada." }, 404);
  if (typeof body.base !== "number" || sheet.version !== body.base) return json({ conflict: true, version: sheet.version }, 409);

  let tabs;
  try {
    tabs = (Array.isArray(body.tabs) ? body.tabs : []).map((t) => sanitizeTab(t));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Aba inválida." }, 400);
  }
  if (tabs.some((t) => !order.includes(t.id))) return json({ error: "Aba fora da ordem." }, 400);
  const names = new Set<string>();
  for (const t of tabs) {
    if (names.has(t.name.toLowerCase())) return json({ error: `Já existe uma aba chamada “${t.name}”.` }, 400);
    names.add(t.name.toLowerCase());
  }

  // reserva a versão (trava otimista): só um salvamento ganha
  const [bumped] = await db
    .update(schema.sheets)
    .set({ version: sql`${schema.sheets.version} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.sheets.id, id), eq(schema.sheets.version, body.base)))
    .returning({ version: schema.sheets.version });
  if (!bumped) return json({ conflict: true, version: sheet.version }, 409);

  await maybeSnapshot(id, user.id); // guarda o estado anterior se o último instantâneo for antigo
  for (const t of tabs) {
    const { grid, layout } = splitTab(t);
    await db
      .insert(schema.sheetTabs)
      .values({ id: t.id, sheetId: id, name: t.name, position: order.indexOf(t.id), grid, layout })
      .onConflictDoUpdate({ target: schema.sheetTabs.id, set: { name: t.name, position: order.indexOf(t.id), grid, layout }, setWhere: eq(schema.sheetTabs.sheetId, id) });
  }
  await db.delete(schema.sheetTabs).where(and(eq(schema.sheetTabs.sheetId, id), notInArray(schema.sheetTabs.id, order)));
  for (let i = 0; i < order.length; i++) {
    if (!tabs.some((t) => t.id === order[i])) await db.update(schema.sheetTabs).set({ position: i }).where(and(eq(schema.sheetTabs.id, order[i]), eq(schema.sheetTabs.sheetId, id)));
  }
  return json({ ok: true, version: bumped.version, savedAt: new Date().toISOString() });
}
