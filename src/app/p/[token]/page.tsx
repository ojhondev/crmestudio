import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Check, Download } from "lucide-react";
import { db, schema } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { getPublic, logEvent } from "@/lib/docs/server";
import { DOC_CSS } from "@/lib/docs/doc-css";
import type { DeckContent, DocContent } from "@/lib/docs/types";
import { fmtDateTime } from "@/lib/format";
import { ScaledSlide } from "@/components/docs/scaled-slide";
import { AcceptPanel } from "./accept-panel";

export const metadata: Metadata = { title: "Documento", robots: { index: false, follow: false } };

/** Conta uma visualização por visitante a cada 30 min; ignora a própria equipe logada. */
async function trackView(documentId: string) {
  try {
    if (await getUser()) return;
    const [last] = await db
      .select({ at: schema.documentEvents.at })
      .from(schema.documentEvents)
      .where(and(eq(schema.documentEvents.documentId, documentId), eq(schema.documentEvents.type, "visualizado")))
      .orderBy(desc(schema.documentEvents.at))
      .limit(1);
    if (last && Date.now() - last.at.getTime() < 30 * 60 * 1000) return;
    await logEvent(documentId, "visualizado");
  } catch (e) {
    console.error("[p] falha ao registrar visualização", e);
  }
}

export default async function PublicDocument({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const pub = await getPublic(token);
  if (!pub) notFound();
  const { doc, map } = pub;
  const content = pub.content as DocContent;
  await trackView(doc.id);
  const studioName = (doc.snapshot as { studioName?: string } | null)?.studioName ?? "Estúdio Restaura";

  return (
    <div className="rs-doc min-h-dvh bg-[#f5f4f3] px-3 py-6 sm:px-6 sm:py-10">
      <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
      <header className="mx-auto mb-5 flex w-full max-w-[794px] items-center justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt={studioName} className="h-8 w-auto object-contain" />
        <a
          href={`/p/${token}/pdf`}
          className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3.5 py-1.5 text-[13px] text-[#1c1c1c] hover:border-[#1c1c1c]/40"
          style={{ fontFamily: "var(--sans)" }}
        >
          <Download className="size-3.5" /> Baixar PDF
        </a>
      </header>

      {content.kind === "contrato" ? (
        <article className="rs-paper mx-auto overflow-hidden rounded-md shadow-sm ring-1 ring-black/10" dangerouslySetInnerHTML={{ __html: content.html }} />
      ) : (
        <div className="mx-auto grid max-w-[1000px] gap-4">
          {(content as DeckContent).slides.map((s, i, all) => (
            <div key={s.id} className="overflow-hidden rounded-xl shadow-md ring-1 ring-black/10">
              <ScaledSlide slide={s} map={map} index={i} total={all.length} studioName={studioName} />
            </div>
          ))}
        </div>
      )}

      {doc.status === "enviado" && <AcceptPanel token={token} kind={doc.kind} />}
      {doc.status === "aceito" && (
        <section className="mx-auto mt-8 w-full max-w-[794px] rounded-2xl border border-[#2f7d4f]/30 bg-white p-5 shadow-sm sm:p-7" style={{ fontFamily: "var(--sans)" }}>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-[#2f7d4f]">
            <Check className="size-5" /> {doc.kind === "contrato" ? "Contrato aceito" : "Proposta aceita"}
          </p>
          <p className="mt-2 text-[13.5px] text-[#444]">
            Aceito por <strong>{doc.acceptedName}</strong>
            {doc.acceptedDocument ? ` (${doc.acceptedDocument})` : ""} em {fmtDateTime(doc.acceptedAt)}. O estúdio já foi avisado.
          </p>
        </section>
      )}
      <p className="mx-auto mt-6 max-w-[794px] text-center text-[11.5px] text-[#6a6a6a]" style={{ fontFamily: "var(--sans)" }}>
        {doc.number} · {studioName}
      </p>
    </div>
  );
}
