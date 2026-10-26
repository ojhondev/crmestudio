"use client";

import Link from "next/link";
import { ArrowRight, Check, ClipboardList, Eye, Handshake, MapPin, RotateCcw, Share2, Star, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { moneyShort } from "@/lib/format";
import type { RadarCard } from "@/lib/editais-app/radar";
import { Button } from "@/components/ui/button";
import { DaysLeft, KindPill, Person, Pill, Relevance, TriagePill } from "./primitives";

export type CardHandlers = {
  onInterest: (e: RadarCard) => void;
  onDiscard: (e: RadarCard) => void;
  onShare: (e: RadarCard) => void;
  onRestore: (e: RadarCard) => void;
};

export function EditalCard({
  e,
  mode,
  canEdit,
  busy,
  handlers,
  selecting,
  selected,
  onSelect,
}: {
  e: RadarCard;
  mode: "staff" | "partner";
  canEdit: boolean;
  busy: boolean;
  handlers: CardHandlers;
  selecting: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const href = `/editais/radar/${e.id}`;
  const staff = mode === "staff";
  const place = [e.city, e.uf].filter(Boolean).join(" / ");
  const interested = ["interessante", "em_analise"].includes(e.triage);
  const inProposta = ["em_proposta", "proposta_enviada", "ganho", "perdido"].includes(e.triage) || !!e.dossie;

  return (
    <article
      className={cn(
        "ed-card group relative grid gap-3 p-4 transition-shadow hover:shadow-md sm:p-5",
        selected && "border-brand ring-2 ring-brand/30",
        busy && "opacity-60",
        e.triage === "descartado" && staff && "bg-muted/40",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {place ? `${place} · ` : ""}
            {e.organ}
          </span>
        </p>
        <Relevance score={e.score} className="shrink-0" />
      </header>

      <h3 className="text-[17px] leading-snug font-medium sm:text-lg">
        <Link href={href} className="line-clamp-3 outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {e.object}
        </Link>
      </h3>

      <div className="flex flex-wrap items-center gap-1.5">
        <KindPill kind={e.kind} />
        {e.valueCents ? <Pill tone="mute">{moneyShort(e.valueCents)}</Pill> : <Pill tone="mute">Valor não informado</Pill>}
        {staff && <TriagePill triage={e.triage} />}
        {e.dossie && <Pill tone="good">Proposta {e.dossie.status === "andamento" ? `${e.dossie.pct}%` : "encerrada"}</Pill>}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DaysLeft days={e.daysLeft} />
        {staff && e.ownerName && <Person name={e.ownerName} />}
        {staff && e.sharedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground" title={e.sharedNames.join(", ")}>
            <Handshake className="size-3.5" aria-hidden />
            Compartilhado com {e.sharedCount} {e.sharedCount === 1 ? "parceiro" : "parceiros"}
          </span>
        )}
        {!staff && e.myRole && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Eye className="size-3.5" aria-hidden />
            {e.myRole === "contribuir" ? "Você pode contribuir" : "Você pode acompanhar"}
          </span>
        )}
      </footer>

      {selecting && staff ? (
        <button
          type="button"
          onClick={() => onSelect(e.id)}
          aria-pressed={selected}
          className={cn("relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? "border-brand bg-brand text-on-brand" : "hover:bg-muted")}
        >
          {selected ? <Check className="size-4" /> : null}
          {selected ? "Selecionado" : "Selecionar"}
        </button>
      ) : staff && canEdit ? (
        <div className="relative z-10 flex flex-wrap gap-2 border-t pt-3">
          {e.triage === "descartado" ? (
            <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => handlers.onRestore(e)}>
              <RotateCcw /> Restaurar
            </Button>
          ) : inProposta ? (
            <Button asChild className="min-h-11 flex-1 sm:flex-none">
              <Link href={e.dossie ? `/editais/propostas/${e.id}` : `/editais/participar/${e.id}`}>
                <ClipboardList /> {e.dossie ? "Abrir proposta" : "Vou participar"}
              </Link>
            </Button>
          ) : interested ? (
            <Button asChild className="min-h-11 flex-1 sm:flex-none">
              <Link href={`/editais/participar/${e.id}`}>
                <ArrowRight /> Vou participar
              </Link>
            </Button>
          ) : (
            <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => handlers.onInterest(e)}>
              <Star /> Tenho interesse
            </Button>
          )}
          {e.triage !== "descartado" && !inProposta && (
            <Button variant="outline" className="min-h-11" onClick={() => handlers.onDiscard(e)}>
              <ThumbsDown /> Descartar
            </Button>
          )}
          <Button variant="outline" className="min-h-11" onClick={() => handlers.onShare(e)} aria-label="Compartilhar com parceiros">
            <Share2 /> <span className="max-sm:sr-only">Compartilhar</span>
          </Button>
        </div>
      ) : !staff && e.myRole === "contribuir" ? (
        <div className="relative z-10 flex gap-2 border-t pt-3">
          <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => handlers.onInterest(e)}>
            <Star /> Tenho interesse
          </Button>
        </div>
      ) : null}
    </article>
  );
}
