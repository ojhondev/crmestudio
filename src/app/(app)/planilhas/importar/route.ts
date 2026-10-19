import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser, has } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dealScope } from "@/lib/deals";
import { IMPORT_EXTS, MAX_IMPORT_BYTES, importFile, previewOf } from "@/lib/sheets/import";
import { insertSheet } from "@/lib/sheets/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /planilhas/importar (multipart): file, mode = "preview" | "commit", name?, dealId?
 * preview devolve o resumo das abas; commit cria a planilha e devolve { id }.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.mustChangePassword || !has(user, "planilhas", "edit")) return json({ error: "Sem permissão para importar." }, 403);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Não consegui ler o envio. Tente um arquivo menor." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return json({ error: "Escolha um arquivo." }, 400);
  if (file.size > MAX_IMPORT_BYTES) return json({ error: "O arquivo passa de 15 MB." }, 413);
  const ext = /\.[^.]+$/.exec(file.name.toLowerCase())?.[0] ?? "";
  if (!IMPORT_EXTS.includes(ext)) return json({ error: "Formato não suportado. Use .xlsx, .xls, .ods, .csv ou .tsv." }, 400);

  let result;
  try {
    result = await importFile(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Não consegui importar o arquivo." }, 422);
  }
  if (form.get("mode") !== "commit") return json({ preview: previewOf(result) });

  const name = String(form.get("name") ?? "").trim().slice(0, 160) || result.name;
  let dealId: string | null = null;
  let contactId: string | null = null;
  const dId = String(form.get("dealId") ?? "");
  if (dId) {
    const [d] = await db
      .select({ id: schema.deals.id, contactId: schema.deals.contactId })
      .from(schema.deals)
      .where(and(eq(schema.deals.id, dId), dealScope(user)))
      .limit(1);
    if (!d) return json({ error: "Negócio não encontrado." }, 400);
    dealId = d.id;
    contactId = d.contactId;
  }
  const sheet = await insertSheet({ name, ownerId: user.id, tabs: result.tabs, dealId, contactId, meta: { origem: "importada", arquivo: file.name } });
  await audit(user, "planilha_importada", `Importou “${file.name}” como planilha “${name}” (${result.tabs.length} aba(s))`, {
    entity: "planilha",
    entityId: sheet.id,
    meta: { arquivo: file.name, abas: result.tabs.length },
  });
  return json({ id: sheet.id, warnings: result.warnings });
}
