import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { DOSSIE_STATUS_LABEL, type DossieStatus } from "@/lib/propostas/types";
import { countdownText } from "@/lib/propostas/progress";
import { suggestAtestadosFor } from "@/lib/propostas/suggest";
import { nowMs } from "@/lib/editais-app/clock";
import { requireEditais } from "@/lib/editais-app/session";
import { dossieView, assignablePeople } from "@/lib/editais-app/propostas";
import { listComments } from "@/lib/editais-app/radar";
import { mentionablesFor } from "@/lib/editais-app/collab";
import { activePartners } from "@/lib/editais-app/partners";
import { CommentsPanel } from "@/components/editais-app/comments-panel";
import { DossieActions } from "@/components/editais-app/dossie-header";
import { DossieBlocks } from "@/components/editais-app/dossie-view";
import { PageWrap, Pill, Relevance, urgencyTone } from "@/components/editais-app/primitives";
import { Progress } from "@/components/editais-app/propostas-view";

export const metadata: Metadata = { title: "Proposta" };

export default async function PropostaPage({ params }: PageProps<"/editais/propostas/[id]">) {
  const { actor } = await requireEditais();
  const { id } = await params;
  const dv = await dossieView(actor, id);
  if (!dv) notFound(); // sem acesso (ou sem proposta) = não existe
  const { view: v, vis } = dv;
  const staff = actor.kind === "staff";
  const canEdit = staff && atLeast(actor.level, "edit");
  const e = v.edital;
  const [people, comments, mentionables, suggestions, partners, shares, team] = await Promise.all([
    staff ? assignablePeople(id) : Promise.resolve([]),
    listComments(actor, id),
    mentionablesFor(id, actor),
    staff ? suggestAtestadosFor(id, 8) : Promise.resolve([]),
    staff ? activePartners() : Promise.resolve([]),
    staff
      ? db
          .select({ id: schema.editalShares.id, partnerId: schema.editalShares.partnerId, partnerName: schema.users.name, role: schema.editalShares.role, scope: schema.editalShares.scope })
          .from(schema.editalShares)
          .innerJoin(schema.users, eq(schema.editalShares.partnerId, schema.users.id))
          .where(and(eq(schema.editalShares.editalId, id)))
      : Promise.resolve([]),
    staff ? db.select({ id: schema.users.id, name: schema.users.name, profile: schema.users.profile }).from(schema.users).where(eq(schema.users.active, true)) : Promise.resolve([]),
  ]);
  const now = nowMs();
  const place = [e.city, e.uf].filter(Boolean).join(" / ");

  return (
    <PageWrap className="max-w-5xl pb-6">
      <Link href="/editais/propostas" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" /> Propostas
      </Link>

      <header className="mb-5 grid gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4" aria-hidden /> {place ? `${place} · ` : ""}
          {e.organ}
        </p>
        <h1 className="ed-title text-[26px] sm:text-4xl">{e.object}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {v.dossie.status === "andamento" ? (
            <Pill tone={urgencyTone(v.daysLeft)}>{countdownText(v.daysLeft)}</Pill>
          ) : (
            <Pill tone={v.dossie.status === "ganhou" ? "good" : v.dossie.status === "desistiu" ? "mute" : "bad"}>{DOSSIE_STATUS_LABEL[v.dossie.status as DossieStatus]}</Pill>
          )}
          {staff && <Relevance score={e.score} />}
          {v.dossie.ownerName && staff && <Pill tone="mute">Responsável: {v.dossie.ownerName.split(" ")[0]}</Pill>}
          <Link href={`/editais/radar/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand underline underline-offset-2">
            Ver o edital <ExternalLink className="size-3.5" />
          </Link>
        </div>
        {v.dossie.status === "andamento" && (
          <div className="max-w-md">
            <Progress pct={v.progress.pct} label={`Progresso da proposta: ${v.progress.pct}%`} />
          </div>
        )}
        {canEdit && (
          <DossieActions
            editalId={id}
            shares={shares.map((s) => ({ ...s, role: s.role === "contribuir" ? "contribuir" : "ver" }))}
            partners={partners.map((p) => ({ id: p.id, name: p.name, company: p.company }))}
            team={team.filter((u) => u.profile !== "parceiro_editais").map((u) => ({ id: u.id, name: u.name }))}
            data={{ numero: v.dossie.numero ?? "", processo: v.dossie.processo ?? "", sessionLocal: v.dossie.sessionLocal, ownerId: v.dossie.ownerId ?? "" }}
          />
        )}
      </header>

      {v.dossie.status !== "andamento" && staff && (
        <section className="ed-card mb-5 grid gap-1 p-5">
          <p className="label">Resultado</p>
          <p className="ed-title text-2xl">{DOSSIE_STATUS_LABEL[v.dossie.status as DossieStatus]}</p>
          {v.dossie.resultReason && <p className="text-[15px] text-muted-foreground">{v.dossie.resultReason}</p>}
          {v.dossie.resultNotes && <p className="text-[15px]">{v.dossie.resultNotes}</p>}
          {canEdit && (
            <Link href={`/editais/propostas/${id}/resultado`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-2">
              Corrigir o resultado
            </Link>
          )}
        </section>
      )}

      <DossieBlocks v={v} mode={staff ? "staff" : "partner"} canEdit={canEdit} canContribute={vis.contribute} meId={actor.id} people={people} suggestions={suggestions} />

      <section aria-labelledby="conversa" className="mt-8 grid gap-3">
        <h2 id="conversa" className="ed-title text-xl">
          Conversa
        </h2>
        <CommentsPanel editalId={id} comments={comments} people={mentionables} isStaff={staff} canPost={vis.contribute} now={now} />
      </section>
    </PageWrap>
  );
}
