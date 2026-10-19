import { requireAccess } from "@/lib/auth";
import { buildContext, getDoc, logEvent, renderContract } from "@/lib/docs/server";
import { renderDocumentHtml, htmlToPdf, pdfResponse } from "@/lib/docs/pdf";
import { valueMap } from "@/lib/docs/variables";
import type { DocContent } from "@/lib/docs/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: RouteContext<"/documentos/[id]/pdf">) {
  const { id } = await params;
  const user = await requireAccess("documentos");
  const doc = await getDoc(id, user);
  if (!doc) return new Response("Documento não encontrado.", { status: 404 });

  // enviado/aceito: o PDF é da versão congelada; rascunho: do texto atual
  const snap = doc.status !== "rascunho" ? ((doc.snapshot ?? null) as { content: DocContent; map: Record<string, string>; studioName?: string } | null) : null;
  let content = doc.content as DocContent;
  let map: Record<string, string>;
  let studioName: string;
  let contractHtml: string | undefined;
  if (snap) {
    content = snap.content;
    map = snap.map;
    studioName = snap.studioName ?? "Estúdio Restaura";
    contractHtml = content.kind === "contrato" ? content.html : undefined;
  } else {
    const ctx = await buildContext(doc);
    map = valueMap(ctx);
    studioName = ctx.studio.name;
    contractHtml = content.kind === "contrato" ? renderContract(content, map) : undefined;
  }

  try {
    const html = await renderDocumentHtml({ content, map, contractHtml, title: doc.title, number: doc.number, studioName, origin: new URL(req.url).origin });
    // ?formato=html devolve a mesma página sem converter: serve de versão para impressão se o PDF falhar
    if (new URL(req.url).searchParams.get("formato") === "html") return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
    const pdf = await htmlToPdf(html, doc.kind, `${doc.number ?? ""} · ${studioName}`);
    await logEvent(id, "pdf", { by: user.name });
    return pdfResponse(pdf, `${doc.number ?? "documento"}.pdf`);
  } catch (e) {
    console.error("[pdf] falha", e);
    return new Response("Não foi possível gerar o PDF agora. Tente novamente ou use a prévia e imprima pelo navegador.", { status: 500 });
  }
}
