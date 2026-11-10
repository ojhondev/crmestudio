import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Download, ExternalLink, Mail, MessageCircle, Plane } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { TALENT_STATUS_TONE } from "@/lib/talentos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/page-header";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { deleteTalent } from "../actions";
import { TalentStatusForm } from "../talent-status-form";

export const metadata: Metadata = { title: "Talento" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (!v) return null;
  return (
    <div className="grid gap-0.5 border-t py-3 first:border-t-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-[14px] break-words">{v}</dd>
    </div>
  );
}

export default async function TalentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAccess("contatos");
  if (user.ownOnly || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canEdit = has(user, "contatos", "edit");
  const canDelete = has(user, "contatos", "manage");

  const t = schema.talentos;
  // o conteúdo do currículo (cvBase64) fica de fora: é baixado pela rota /api/talentos/[id]/cv
  const [r] = await db
    .select({
      id: t.id,
      nome: t.nome,
      email: t.email,
      telefone: t.telefone,
      cidade: t.cidade,
      uf: t.uf,
      link: t.link,
      areas: t.areas,
      areaOutra: t.areaOutra,
      formacao: t.formacao,
      anosExperiencia: t.anosExperiencia,
      regimes: t.regimes,
      disponibilidade: t.disponibilidade,
      viaja: t.viaja,
      viajaAte: t.viajaAte,
      equipe: t.equipe,
      equipeNota: t.equipeNota,
      faixaSalarial: t.faixaSalarial,
      experiencias: t.experiencias,
      cvNome: t.cvNome,
      cvBytes: t.cvBytes,
      status: t.status,
      notas: t.notas,
      createdAt: t.createdAt,
    })
    .from(t)
    .where(eq(t.id, id))
    .limit(1);
  if (!r) notFound();

  const phone = r.telefone.replace(/\D/g, "");
  const wa = phone.length <= 11 ? `55${phone}` : phone;

  return (
    <PageBody className="pt-5">
      <div className="mx-auto grid max-w-5xl gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/contatos/talentos" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Banco de Talentos
            </Link>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 text-xl font-semibold tracking-tight">
              {r.nome}
              <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-medium", TALENT_STATUS_TONE[r.status] ?? "bg-muted")}>{r.status}</span>
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {r.cidade}/{r.uf} · cadastrado em {fmtDateTime(r.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <a href={`/api/talentos/${r.id}/cv`}>
                <Download /> Currículo ({Math.max(1, Math.round(r.cvBytes / 1024))} KB)
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`mailto:${r.email}`}>
                <Mail /> E-mail
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
            {canDelete && (
              <ConfirmButton
                action={deleteTalent.bind(null, r.id)}
                title="Excluir este cadastro?"
                description="O cadastro e o currículo serão apagados definitivamente (inclusive se a pessoa pedir a exclusão pela LGPD)."
              />
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="grid gap-6">
            <section className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="mb-2 text-sm font-semibold">Perfil</h2>
              <dl>
                <Row k="E-mail" v={<a className="hover:underline" href={`mailto:${r.email}`}>{r.email}</a>} />
                <Row k="Telefone" v={r.telefone} />
                <Row
                  k="Link"
                  v={
                    r.link && (
                      <a className="inline-flex items-center gap-1 hover:underline" href={r.link} target="_blank" rel="noreferrer">
                        {r.link.replace(/^https?:\/\//, "").slice(0, 60)} <ExternalLink className="size-3.5" />
                      </a>
                    )
                  }
                />
                <Row
                  k="Área de atuação"
                  v={
                    <span className="flex flex-wrap gap-1.5">
                      {r.areas.map((a) => (
                        <span key={a} className="rounded-full border px-2.5 py-0.5 text-[12.5px]">
                          {a}
                        </span>
                      ))}
                      {r.areaOutra && <span className="rounded-full border border-dashed px-2.5 py-0.5 text-[12.5px]">Outra: {r.areaOutra}</span>}
                    </span>
                  }
                />
                <Row k="Formação" v={r.formacao} />
                <Row k="Experiência na área" v={r.anosExperiencia} />
              </dl>
            </section>

            <section className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="mb-2 text-sm font-semibold">Condições de trabalho</h2>
              <dl>
                <Row k="Regime de contratação" v={r.regimes.join(", ")} />
                <Row k="Início" v={r.disponibilidade} />
                <Row k="Pretensão salarial" v={r.faixaSalarial} />
                <Row
                  k="Viagens"
                  v={
                    <span className="inline-flex items-center gap-1.5">
                      <Plane className="size-3.5 text-muted-foreground" />
                      {r.viaja ? `Viaja${r.viajaAte ? ` — ${r.viajaAte}` : ""}` : "Não tem disponibilidade para viajar"}
                    </span>
                  }
                />
                <Row k="Trabalho em equipe" v={r.equipe} />
                <Row k="Situação em equipe" v={r.equipeNota && <span className="whitespace-pre-wrap">{r.equipeNota}</span>} />
              </dl>
            </section>

            <section className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold">Últimas experiências</h2>
              <ol className="grid gap-4">
                {r.experiencias.map((e, i) => (
                  <li key={i} className="border-l-2 pl-4">
                    <p className="text-[14px] font-medium">
                      {e.cargo || "Cargo não informado"} <span className="font-normal text-muted-foreground">· {e.empresa}</span>
                    </p>
                    {e.periodo && <p className="text-xs text-muted-foreground">{e.periodo}</p>}
                    {e.atividades && <p className="mt-1.5 text-[13.5px] whitespace-pre-wrap text-foreground/85">{e.atividades}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="self-start rounded-xl border bg-card p-4 sm:p-5 lg:sticky lg:top-32">
            <h2 className="mb-3 text-sm font-semibold">Acompanhamento</h2>
            <TalentStatusForm id={r.id} status={r.status} notas={r.notas ?? ""} canEdit={canEdit} />
          </aside>
        </div>
      </div>
    </PageBody>
  );
}
