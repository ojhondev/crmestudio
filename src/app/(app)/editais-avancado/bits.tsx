import { cn } from "@/lib/utils";
import { deadlineText, URGENT_DAYS } from "@/lib/editais/filters";
import { ESFERA_LABEL, KIND_SHORT, SCORE_HIGH, SCORE_MIN_DEFAULT, TRIAGE_LABEL, scoreLabel, type EditalKind, type EditalTriage, type Esfera } from "@/lib/editais/types";

/** Relevância 0–100: barra curta + rótulo (Alta / Boa / Possível). Cor por token, nunca fixa. */
export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const high = score >= SCORE_HIGH;
  const good = score >= SCORE_MIN_DEFAULT;
  return (
    <span
      title={`Relevância ${score} de 100`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        high ? "border-brand/40 bg-brand-soft text-brand" : good ? "border-border bg-muted text-foreground" : "border-dashed text-muted-foreground",
        className,
      )}
    >
      <span className="num tabular-nums">{score}</span>
      <span className="font-normal">{scoreLabel(score)}</span>
    </span>
  );
}

export function KindChip({ kind }: { kind: string }) {
  const k = kind as EditalKind;
  return <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">{KIND_SHORT[k] ?? "Outro"}</span>;
}

export function EsferaChip({ esfera }: { esfera: string | null }) {
  if (!esfera) return null;
  return <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">{ESFERA_LABEL[esfera as Esfera] ?? esfera}</span>;
}

/** Prazo: vermelho-terracota quando urgente (≤ 7 dias); apagado quando já encerrou. */
export function Deadline({ daysLeft, situation, compact }: { daysLeft: number | null; situation: string; compact?: boolean }) {
  const closed = situation !== "aberto";
  const urgent = !closed && daysLeft !== null && daysLeft <= URGENT_DAYS;
  const text = closed ? (situation === "suspenso" ? "Suspenso" : situation === "cancelado" ? "Cancelado" : "Encerrado") : deadlineText(daysLeft);
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] whitespace-nowrap", urgent ? "font-semibold text-brand" : closed ? "text-muted-foreground" : "text-foreground", compact && "text-xs")}>
      {urgent && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
      {text}
    </span>
  );
}

export function TriagePill({ triage }: { triage: string }) {
  const t = triage as EditalTriage;
  const tone =
    t === "novo"
      ? "border-brand/40 text-brand"
      : t === "interessante" || t === "em_analise" || t === "em_proposta"
        ? "border-foreground/30 bg-muted text-foreground"
        : t === "proposta_enviada" || t === "ganho"
          ? "border-foreground bg-foreground text-background"
          : "border-dashed text-muted-foreground";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone)}>{TRIAGE_LABEL[t] ?? t}</span>;
}
