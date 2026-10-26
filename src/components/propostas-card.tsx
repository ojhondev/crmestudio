import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Section } from "@/components/crm/section";
import { Countdown, ProgressBar, stepLabelOf } from "@/app/(app)/editais-avancado/proposta-bits";
import type { dashboardPropostas } from "@/lib/propostas/server";

type Data = Awaited<ReturnType<typeof dashboardPropostas>>;

/** Bloco do Painel: propostas de edital em andamento, a mais urgente primeiro (só para quem tem o módulo Editais). */
export function PropostasCard({ data }: { data: Data }) {
  if (!data.rows.length) return null;
  const { kpis, rate } = data;
  return (
    <Section
      tour="dash-propostas"
      title="Propostas em andamento"
      action={
        <Link href="/editais/propostas" className="flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-md:min-h-11 max-md:items-center">
          {kpis.andamento} em andamento <ArrowRight className="size-3" />
        </Link>
      }
    >
      <div className="grid gap-3">
        <ul className="grid gap-2 lg:grid-cols-2">
          {data.rows.map((r) => (
            <li key={r.editalId}>
              <Link href={`/editais/propostas/${r.editalId}`} className="grid gap-1.5 rounded-lg border px-3 py-2.5 transition-colors hover:border-foreground/25 max-md:min-h-11">
                <span className="line-clamp-2 text-[13.5px] leading-snug font-medium break-words">{r.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Countdown daysLeft={r.daysLeft} urgency={r.urgency} />
                  <span className="text-xs text-muted-foreground">{stepLabelOf(r.currentStep)}</span>
                  {r.matrix.problems > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                      <AlertTriangle className="size-3.5" /> {r.matrix.problems} na habilitação
                    </span>
                  )}
                </span>
                <ProgressBar pct={r.progress.pct} />
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {kpis.urgentes ? `${kpis.urgentes} com sessão em até 7 dias · ` : ""}
          {kpis.etapasAtrasadas ? `${kpis.etapasAtrasadas} etapa(s) atrasada(s) · ` : ""}
          {rate.total ? `taxa de êxito ${rate.rate}% (${rate.won}/${rate.total})` : "ainda sem resultados registrados"}
        </p>
      </div>
    </Section>
  );
}
