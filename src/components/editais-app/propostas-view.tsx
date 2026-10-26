"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Handshake, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { moneyShort } from "@/lib/format";
import { STEP_BY_KEY, DOSSIE_STATUS_LABEL, type DossieStatus, type StepKey } from "@/lib/propostas/types";
import { BOARD_COLUMNS, type BoardColumn } from "@/lib/editais-app/access";
import type { BoardCard } from "@/lib/editais-app/propostas";
import { DaysLeft, Empty, KindPill, Person, Pill } from "./primitives";

export function Progress({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums">{pct}%</span>
    </div>
  );
}

const RESULT_TONE: Record<string, "good" | "bad" | "mute"> = { ganhou: "good", perdeu: "bad", desclassificada: "bad", desistiu: "mute" };

function PropostaCard({ c, staff }: { c: BoardCard; staff: boolean }) {
  const step = c.progress.currentStep ? STEP_BY_KEY[c.progress.currentStep as StepKey]?.short : null;
  return (
    <article className="ed-card group relative grid gap-3 p-4 transition-shadow hover:shadow-md">
      <p className="truncate text-[13px] text-muted-foreground">
        {c.place ? `${c.place} · ` : ""}
        {c.organ}
      </p>
      <h3 className="text-[16px] leading-snug font-medium">
        <Link href={`/editais/propostas/${c.editalId}`} className="line-clamp-3 outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {c.title}
        </Link>
      </h3>
      {c.status === "andamento" ? (
        <>
          <Progress pct={c.progress.pct} label={`Progresso: ${c.progress.pct}%`} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <DaysLeft days={c.daysLeft} />
            {step && <span className="text-[13px] text-muted-foreground">Agora: {step}</span>}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={RESULT_TONE[c.status] ?? "mute"}>{DOSSIE_STATUS_LABEL[c.status as DossieStatus] ?? c.status}</Pill>
          {c.resultReason && <span className="truncate text-[13px] text-muted-foreground">{c.resultReason}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <KindPill kind={c.kind} />
        {c.valueCents ? <span className="text-[13px] text-muted-foreground">{moneyShort(c.valueCents)}</span> : null}
        {staff && c.ownerName && <Person name={c.ownerName} />}
        {staff && c.partners.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground" title={c.partners.join(", ")}>
            <Handshake className="size-3.5" aria-hidden /> {c.partners.length}
          </span>
        )}
        {!staff && c.myRole && <span className="text-[13px] text-muted-foreground">{c.myRole === "contribuir" ? "Você contribui" : "Você acompanha"}</span>}
      </div>
    </article>
  );
}

export function PropostasView({ cards, counts, staff, hasMoreFinished, moreHref, initialView }: { cards: BoardCard[]; counts: Record<BoardColumn, number>; staff: boolean; hasMoreFinished: boolean; moreHref: string; initialView: "quadro" | "lista" }) {
  const [view, setView] = useState<"quadro" | "lista">(initialView);
  const first = (BOARD_COLUMNS.find((c) => counts[c.key] > 0) ?? BOARD_COLUMNS[0]).key;
  const [col, setCol] = useState<BoardColumn>(first);

  if (cards.length === 0) {
    return (
      <Empty icon={ClipboardList} title={staff ? "Nenhuma proposta ainda" : "Nenhuma proposta compartilhada com você"}>
        {staff ? "No Radar, abra um edital interessante e toque em Vou participar. A proposta aparece aqui, com prazos e etapas." : "Quando a equipe compartilhar uma proposta, ela aparece aqui."}
        {staff && (
          <div className="mt-4">
            <Link href="/editais/radar" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
              Ir para o Radar
            </Link>
          </div>
        )}
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Forma de ver" className="inline-flex rounded-full bg-muted p-1">
          {(
            [
              { k: "quadro", label: "Quadro", icon: LayoutGrid },
              { k: "lista", label: "Lista", icon: List },
            ] as const
          ).map(({ k, label, icon: Icon }) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", view === k ? "bg-card shadow-sm" : "text-muted-foreground")}>
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {counts.analisando + counts.preparando + counts.enviada} em andamento
        </p>
      </div>

      {view === "quadro" ? (
        <>
          {/* celular: uma coluna por vez */}
          <div role="tablist" aria-label="Etapa do quadro" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:hidden">
            {BOARD_COLUMNS.map((c) => (
              <button key={c.key} role="tab" aria-selected={col === c.key} onClick={() => setCol(c.key)} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", col === c.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                {c.label}
                <span className={cn("rounded-full px-2 text-xs tabular-nums", col === c.key ? "bg-background/20" : "bg-background")}>{counts[c.key]}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BOARD_COLUMNS.map((c) => {
              const list = cards.filter((x) => x.column === c.key);
              return (
                <section key={c.key} aria-labelledby={`col-${c.key}`} className={cn("grid content-start gap-3", col !== c.key && "max-md:hidden")}>
                  <header className="flex items-baseline justify-between gap-2 px-1">
                    <h2 id={`col-${c.key}`} className="ed-title text-lg">
                      {c.label}
                    </h2>
                    <span className="text-sm text-muted-foreground tabular-nums">{counts[c.key]}</span>
                  </header>
                  <p className="-mt-2 px-1 text-[13px] text-muted-foreground">{c.hint}</p>
                  {list.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nada aqui.</p> : list.map((x) => <PropostaCard key={x.editalId} c={x} staff={staff} />)}
                  {c.key === "resultado" && hasMoreFinished && (
                    <Link href={moreHref} scroll={false} className="grid min-h-11 place-items-center rounded-full border text-sm font-medium hover:bg-muted">
                      Carregar mais
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((x) => (
              <li key={x.editalId}>
                <PropostaCard c={x} staff={staff} />
              </li>
            ))}
          </ul>
          {hasMoreFinished && (
            <Link href={moreHref} scroll={false} className="mx-auto grid min-h-12 place-items-center rounded-full border px-8 text-sm font-medium hover:bg-muted">
              Carregar mais
            </Link>
          )}
        </>
      )}
    </div>
  );
}
