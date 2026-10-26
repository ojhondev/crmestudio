import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, CircleCheck, Handshake, ListChecks } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { STEP_BY_KEY, type StepKey } from "@/lib/propostas/types";
import { ROLE_LABEL } from "@/lib/editais-app/access";
import { partnerHome } from "@/lib/editais-app/partners";
import { requireEditais } from "@/lib/editais-app/session";
import { DaysLeft, Empty, PageTitle, PageWrap, Pill } from "@/components/editais-app/primitives";

export const metadata: Metadata = { title: "Início" };

/**
 * /editais — para a equipe, o Radar (e leva os links antigos ?id= e ?aba=propostas para o lugar novo);
 * para o parceiro, o painel dele: compartilhados, tarefas e prazos.
 */
export default async function EditaisHome({ searchParams }: PageProps<"/editais">) {
  const { actor, user } = await requireEditais();
  const sp = await searchParams;
  if (actor.kind === "staff") {
    const id = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : null;
    if (id) redirect(`/editais/radar/${id}`);
    if (sp.aba === "propostas") redirect("/editais/propostas");
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "aba") qs.set(k, v);
    redirect(`/editais/radar${qs.size ? `?${qs}` : ""}`);
  }

  const h = await partnerHome(actor);
  const first = user.name.split(" ")[0];
  const upcoming = h.shared.filter((s) => s.daysLeft !== null && s.daysLeft >= 0).slice(0, 4);
  return (
    <PageWrap className="max-w-5xl">
      <PageTitle title={`Olá, ${first}`} sub="O que a equipe do Estúdio compartilhou com você." />

      {h.shared.length === 0 ? (
        <Empty icon={Handshake} title="Nada compartilhado ainda">
          Assim que a equipe compartilhar um edital, ele aparece aqui e você recebe um aviso no sino.
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="comp" className="grid content-start gap-3">
            <h2 id="comp" className="ed-title text-xl">
              Compartilhados comigo <span className="text-base text-muted-foreground">({h.shared.length})</span>
            </h2>
            <ul className="grid gap-3">
              {h.shared.map((s) => (
                <li key={s.editalId}>
                  <Link href={`/editais/radar/${s.editalId}`} className="ed-card group grid gap-2 p-4 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                    <p className="text-[13px] text-muted-foreground">
                      {s.uf ? `${s.uf} · ` : ""}
                      {s.organ}
                    </p>
                    <p className="line-clamp-2 text-[16px] leading-snug font-medium">{s.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <DaysLeft days={s.daysLeft} />
                      <Pill tone={s.role === "contribuir" ? "brand" : "mute"}>{ROLE_LABEL[s.role]}</Pill>
                      {s.hasDossie && <Pill tone="good">Com proposta</Pill>}
                      <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid content-start gap-6">
            <section aria-labelledby="tarefas" className="grid gap-3">
              <h2 id="tarefas" className="ed-title flex items-center gap-2 text-xl">
                <ListChecks className="size-5 text-brand" aria-hidden /> Minhas tarefas
              </h2>
              {h.tasks.length === 0 ? (
                <p className="ed-card flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <CircleCheck className="size-4" aria-hidden /> Nenhuma tarefa atribuída a você.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {h.tasks.map((t) => (
                    <li key={t.itemId}>
                      <Link href={`/editais/propostas/${t.editalId}`} className="ed-card grid gap-1 p-3.5 outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="text-[15px] font-medium">{t.title}</span>
                        <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                          {STEP_BY_KEY[t.stepKey as StepKey]?.short ?? t.stepKey} · <span className="truncate">{t.editalTitle.slice(0, 40)}</span>
                          {t.dueAt && <Pill tone={t.overdue ? "bad" : "mute"}>{t.overdue ? "Atrasada · " : "Até "}{fmtDateTime(t.dueAt)}</Pill>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="prazos" className="grid gap-3">
              <h2 id="prazos" className="ed-title flex items-center gap-2 text-xl">
                <CalendarClock className="size-5 text-brand" aria-hidden /> Próximos prazos
              </h2>
              {upcoming.length === 0 ? (
                <p className="ed-card p-4 text-sm text-muted-foreground">Sem prazos à vista.</p>
              ) : (
                <ul className="grid gap-2">
                  {upcoming.map((s) => (
                    <li key={s.editalId} className="ed-card flex items-center justify-between gap-3 p-3.5">
                      <span className="line-clamp-2 text-sm">{s.title}</span>
                      <DaysLeft days={s.daysLeft} className="shrink-0" />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </PageWrap>
  );
}
