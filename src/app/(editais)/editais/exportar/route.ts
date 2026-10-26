import { audit } from "@/lib/audit";
import { ESFERA_LABEL, KIND_LABEL, SITUATION_LABEL, TRIAGE_LABEL, type EditalKind, type EditalSituation, type EditalTriage, type Esfera } from "@/lib/editais/types";
import { fmtDateTime, todayISO } from "@/lib/format";
import { getEditaisSession } from "@/lib/editais-app/session";
import { parseRadar } from "@/lib/editais-app/radar-filters";
import { radarExport } from "@/lib/editais-app/radar";

/** GET /editais/exportar?<mesmos filtros do Radar> — CSV para Excel (Brasil: ";" e vírgula decimal). Só equipe. */
export async function GET(req: Request) {
  const s = await getEditaisSession();
  if (!s || s.actor.kind !== "staff") return new Response("Sem acesso", { status: 403 });
  const f = parseRadar(new URL(req.url).searchParams);
  const rows = await radarExport(s.actor, f);

  const cell = (v: unknown) => {
    const t = String(v ?? "").replace(/\r?\n/g, " ").trim();
    return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["Relevância", "Tipo", "Título", "Órgão", "Esfera", "UF", "Município", "Modalidade", "Valor estimado (R$)", "Publicado em", "Abertura das propostas", "Encerramento das propostas", "Situação", "Triagem", "Responsável", "Link PNCP", "Portal de origem", "Nº de controle PNCP", "Objeto"];
  const lines = [head.join(";")];
  for (const e of rows) {
    lines.push(
      [
        e.score,
        KIND_LABEL[e.kind as EditalKind] ?? e.kind,
        e.title,
        e.organ,
        e.esfera ? ESFERA_LABEL[e.esfera as Esfera] : "",
        e.uf,
        e.city,
        e.modalidade,
        e.valueCents ? (e.valueCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
        e.publishedAt ? fmtDateTime(e.publishedAt) : "",
        e.openAt ? fmtDateTime(e.openAt) : "",
        e.closeAt ? fmtDateTime(e.closeAt) : "",
        SITUATION_LABEL[e.situation as EditalSituation] ?? e.situation,
        TRIAGE_LABEL[e.triage as EditalTriage] ?? e.triage,
        e.ownerName,
        e.url,
        e.sourceUrl,
        e.externalId,
        e.object,
      ]
        .map(cell)
        .join(";"),
    );
  }
  await audit({ id: s.user.id, name: s.user.name }, "editais_exportado", `Exportou ${rows.length} edital(is) em CSV`, { entity: "edital", meta: { count: rows.length } });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="editais-restauro-${todayISO()}.csv"`, "cache-control": "no-store" },
  });
}
