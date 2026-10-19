import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser, has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { loadTabs, sheetScope } from "@/lib/sheets/server";
import { toCsv, toXlsx, type CsvKind } from "@/lib/sheets/export";

export const runtime = "nodejs";
export const maxDuration = 60;

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "planilha";

/** GET /planilhas/[id]/exportar?formato=xlsx|csv-br|csv-us|tsv&aba=<id da aba> */
export async function GET(req: Request, { params }: RouteContext<"/planilhas/[id]/exportar">) {
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

  const url = new URL(req.url);
  const formato = url.searchParams.get("formato") ?? "xlsx";
  const tabs = await loadTabs(id);
  const base = slug(sheet.name);
  await audit(user, "planilha_exportada", `Exportou a planilha “${sheet.name}” (${formato})`, { entity: "planilha", entityId: id });

  if (formato === "xlsx") {
    const buf = await toXlsx(sheet.name, tabs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${base}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  }
  const kind: CsvKind = formato === "csv-us" ? "us" : formato === "tsv" ? "tsv" : "br";
  const tab = tabs.find((t) => t.id === url.searchParams.get("aba")) ?? tabs[0];
  const ext = kind === "tsv" ? "tsv" : "csv";
  return new Response(toCsv(tab, kind, tabs), {
    headers: {
      "content-type": `${kind === "tsv" ? "text/tab-separated-values" : "text/csv"}; charset=utf-8`,
      "content-disposition": `attachment; filename="${base}-${slug(tab.name)}-${kind}.${ext}"`,
      "cache-control": "no-store",
    },
  });
}
