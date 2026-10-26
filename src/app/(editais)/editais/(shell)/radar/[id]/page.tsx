import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarClock, ExternalLink, FileText, Landmark, Lightbulb, MapPin, Wallet } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { fmtDateTime, money } from "@/lib/format";
import { ESFERA_LABEL, KIND_LABEL, type EditalKind, type Esfera } from "@/lib/editais/types";
import { nowMs } from "@/lib/editais-app/clock";
import { requireEditais } from "@/lib/editais-app/session";
import { radarDetail, relevanceWhy } from "@/lib/editais-app/radar";
import { mentionablesFor } from "@/lib/editais-app/collab";
import { activePartners } from "@/lib/editais-app/partners";
import { CommentsPanel } from "@/components/editais-app/comments-panel";
import { NextStep } from "@/components/editais-app/detail-actions";
import { NotesBox } from "@/components/editais-app/notes-box";
import { DaysLeft, Fold, KindPill, PageWrap, Pill, Relevance, TriagePill } from "@/components/editais-app/primitives";

export const metadata: Metadata = { title: "Edital" };

function Fact({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="ed-card flex gap-3 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <div className="mt-0.5 text-[15px] font-medium break-words">{children}</div>
      </div>
    </div>
  );
}

export default async function EditalPage({ params }: PageProps<"/editais/radar/[id]">) {
  const { actor } = await requireEditais();
  const { id } = await params;
  const d = await radarDetail(actor, id);
  if (!d) notFound(); // sem acesso = não existe (não confirma que o edital existe)
  const { card: e, vis } = d;
  const staff = actor.kind === "staff";
  const canEdit = staff && atLeast(actor.level, "edit");
  const [people, partners, team] = await Promise.all([
    mentionablesFor(id, actor),
    staff ? activePartners() : Promise.resolve([]),
    staff ? db.select({ id: schema.users.id, name: schema.users.name, profile: schema.users.profile }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)) : Promise.resolve([]),
  ]);
  const place = [e.city, e.uf].filter(Boolean).join(" / ");
  const now = nowMs();

  return (
    <PageWrap className="max-w-5xl pb-6">
      <Link href="/editais/radar" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" /> Radar
      </Link>

      <header className="mb-5 grid gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4" aria-hidden /> {place ? `${place} · ` : ""}
          {e.organ}
        </p>
        <h1 className="ed-title text-[26px] sm:text-4xl">{e.object}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Relevance score={e.score} />
          <KindPill kind={e.kind} />
          {staff && <TriagePill triage={e.triage} />}
          {e.situation !== "aberto" && <Pill tone="mute">{e.situation === "encerrado" ? "Encerrado no portal" : e.situation === "suspenso" ? "Suspenso" : "Cancelado"}</Pill>}
          <DaysLeft days={e.daysLeft} />
        </div>
      </header>

      <div className="grid gap-5">
        <NextStep
          editalId={e.id}
          triage={e.triage}
          hasDossie={d.hasDossie && vis.proposta}
          mode={staff ? "staff" : "partner"}
          canEdit={canEdit}
          canContribute={vis.contribute}
          proposalVisible={vis.proposta && d.hasDossie}
          partners={partners.map((p) => ({ id: p.id, name: p.name, company: p.company }))}
          shares={d.shares}
          ownerId={e.ownerId}
          team={team.filter((u) => u.profile !== "parceiro_editais").map((u) => ({ id: u.id, name: u.name }))}
        />

        <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fact icon={CalendarClock} label="Prazo das propostas">
            {e.closeAt ? fmtDateTime(e.closeAt) : "Não informado"}
            {e.openAt && <span className="block text-[13px] font-normal text-muted-foreground">Abertura: {fmtDateTime(e.openAt)}</span>}
          </Fact>
          <Fact icon={Wallet} label="Valor estimado">
            {e.valueCents ? money(e.valueCents) : "Não informado"}
          </Fact>
          <Fact icon={Building2} label="Órgão">
            {e.organ}
            {e.unit && <span className="block text-[13px] font-normal text-muted-foreground">{e.unit}</span>}
          </Fact>
          <Fact icon={Landmark} label="Modalidade e esfera">
            {e.modalidade ?? "—"}
            {e.esfera && <span className="block text-[13px] font-normal text-muted-foreground">{ESFERA_LABEL[e.esfera as Esfera] ?? e.esfera}</span>}
          </Fact>
          <Fact icon={FileText} label="Tipo">
            {KIND_LABEL[e.kind as EditalKind] ?? "Outro"}
          </Fact>
          <Fact icon={ExternalLink} label="Links oficiais">
            <span className="flex flex-col gap-1">
              {e.url ? (
                <a className="inline-flex min-h-8 items-center gap-1 text-brand underline underline-offset-2" href={e.url} target="_blank" rel="noreferrer noopener">
                  Edital no PNCP <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              {e.sourceUrl ? (
                <a className="inline-flex min-h-8 items-center gap-1 text-brand underline underline-offset-2" href={e.sourceUrl} target="_blank" rel="noreferrer noopener">
                  Portal de origem <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              {!e.url && !e.sourceUrl && <span className="font-normal text-muted-foreground">Sem link</span>}
            </span>
          </Fact>
        </section>

        <section className="ed-card flex gap-3 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            <Lightbulb className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold">Por que está no Radar</h2>
            <p className="mt-0.5 text-[15px] text-muted-foreground">{relevanceWhy(e)}</p>
          </div>
        </section>

        <section aria-labelledby="conversa" className="grid gap-3">
          <h2 id="conversa" className="ed-title text-xl">
            Conversa
          </h2>
          <CommentsPanel editalId={e.id} comments={d.comments} people={people} isStaff={staff} canPost={vis.contribute} now={now} />
        </section>

        {staff && (
          <div className="grid gap-3">
            <Fold title="Anotações da equipe" hint="Só a equipe vê">
              <NotesBox editalId={e.id} initial={e.notes ?? ""} canEdit={canEdit} />
            </Fold>
            <Fold title="Histórico" count={d.events.length}>
              {d.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <ol className="grid gap-2.5">
                  {d.events.map((v) => (
                    <li key={v.id} className="flex gap-3 text-sm">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">{fmtDateTime(v.at)}</span>
                      <span className="min-w-0 break-words">
                        {v.body}
                        {v.userName && <span className="text-muted-foreground"> — {v.userName}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Fold>
          </div>
        )}
      </div>
    </PageWrap>
  );
}
