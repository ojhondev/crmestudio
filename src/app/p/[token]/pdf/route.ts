import { getPublic } from "@/lib/docs/server";
import { renderDocumentHtml, htmlToPdf, pdfResponse } from "@/lib/docs/pdf";
import type { DocContent } from "@/lib/docs/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: RouteContext<"/p/[token]/pdf">) {
  const { token } = await params;
  const pub = await getPublic(token);
  if (!pub) return new Response("Documento não encontrado.", { status: 404 });
  const content = pub.content as DocContent;
  const studioName = (pub.doc.snapshot as { studioName?: string } | null)?.studioName ?? "Estúdio Restaura";
  try {
    const html = await renderDocumentHtml({
      content,
      map: pub.map,
      contractHtml: content.kind === "contrato" ? content.html : undefined,
      title: pub.doc.title,
      number: pub.doc.number,
      studioName,
      origin: new URL(req.url).origin,
    });
    // ?formato=html devolve a mesma página sem converter: serve de versão para impressão se o PDF falhar
    if (new URL(req.url).searchParams.get("formato") === "html") return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
    const pdf = await htmlToPdf(html, pub.doc.kind, `${pub.doc.number ?? ""} · ${studioName}`);
    return pdfResponse(pdf, `${pub.doc.number ?? "documento"}.pdf`);
  } catch (e) {
    console.error("[pdf] falha", e);
    return new Response("Não foi possível gerar o PDF agora. Tente novamente em instantes.", { status: 500 });
  }
}
