import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/crm/section";
import { Deadline, KindChip, ScoreBadge } from "@/app/(app)/editais/bits";
import { moneyShort } from "@/lib/format";
import type { EditalDTO } from "@/lib/editais/queries";

type Data = { novos: EditalDTO[]; encerrando: EditalDTO[]; countNovos: number; countAbertos: number };

function Row({ e }: { e: EditalDTO }) {
  return (
    <li>
      <Link href={`/editais?id=${e.id}`} className="grid gap-1 rounded-lg border px-3 py-2.5 transition-colors hover:border-foreground/25 max-md:min-h-11">
        <span className="line-clamp-2 text-[13.5px] leading-snug font-medium break-words">{e.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <ScoreBadge score={e.score} />
          <KindChip kind={e.kind} />
          <span>{[e.city, e.uf].filter(Boolean).join("/")}</span>
          {e.valueCents ? <span className="num tabular-nums">{moneyShort(e.valueCents)}</span> : null}
          <Deadline daysLeft={e.daysLeft} situation={e.situation} compact />
        </span>
      </Link>
    </li>
  );
}

/** Bloco do Painel: editais de restauro novos e os que encerram em 7 dias (só para quem tem o módulo Editais). */
export function EditaisCard({ data }: { data: Data }) {
  if (!data.novos.length && !data.encerrando.length) return null;
  return (
    <Section
      tour="dash-editais"
      title="Oportunidades de restauro"
      action={
        <Link href="/editais" className="flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-md:min-h-11 max-md:items-center">
          {data.countAbertos} abertos <ArrowRight className="size-3" />
        </Link>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <h3 className="label">Novos e relevantes ({data.countNovos})</h3>
          {data.novos.length ? <ul className="grid gap-2">{data.novos.map((e) => <Row key={e.id} e={e} />)}</ul> : <p className="text-[13px] text-muted-foreground">Nenhum edital novo com relevância alta.</p>}
        </div>
        <div className="grid content-start gap-2">
          <h3 className="label">Encerram em até 7 dias</h3>
          {data.encerrando.length ? <ul className="grid gap-2">{data.encerrando.map((e) => <Row key={e.id} e={e} />)}</ul> : <p className="text-[13px] text-muted-foreground">Nada vencendo nesta semana.</p>}
        </div>
      </div>
    </Section>
  );
}
