import { cn } from "@/lib/utils";
import { countdownText, URGENCY_LABEL, type Urgency } from "@/lib/propostas/progress";
import { DOSSIE_STATUS_LABEL, STEP_BY_KEY, type DossieStatus, type StepKey } from "@/lib/propostas/types";

/** Contagem regressiva: terracota cheia quando falta menos de 1 dia ou venceu; contorno em até 3 dias; suave em até 7. */
export function Countdown({ daysLeft, urgency, className }: { daysLeft: number | null; urgency: Urgency; className?: string }) {
  const tone =
    urgency === "vencido" || urgency === "d1"
      ? "border-brand bg-brand text-on-brand"
      : urgency === "d3"
        ? "border-brand text-brand"
        : urgency === "d7"
          ? "border-brand/40 bg-brand-soft text-brand"
          : "border-border bg-muted text-foreground";
  return (
    <span title={URGENCY_LABEL[urgency]} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap", tone, className)}>
      {countdownText(daysLeft)}
    </span>
  );
}

export function ProgressBar({ pct, label, className }: { pct: number; label?: string; className?: string }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Andamento da proposta"} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = status as DossieStatus;
  const tone = s === "ganhou" ? "border-foreground bg-foreground text-background" : s === "andamento" ? "border-foreground/30 bg-muted text-foreground" : "border-dashed text-muted-foreground";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone)}>{DOSSIE_STATUS_LABEL[s] ?? status}</span>;
}

export const stepLabelOf = (k: string | null) => (k && k in STEP_BY_KEY ? STEP_BY_KEY[k as StepKey].label : "—");
