import { Clock, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { KIND_SHORT, TRIAGE_LABEL, type EditalKind, type EditalTriage } from "@/lib/editais/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/* Cores semânticas com contraste alto em claro e escuro (texto escuro sobre fundo claro; texto claro sobre fundo translúcido). */
export const TONE = {
  good: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  bad: "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300",
  brand: "bg-brand-soft text-brand",
  mute: "bg-muted text-muted-foreground",
} as const;
export type Tone = keyof typeof TONE;

export function Pill({ tone = "mute", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5", TONE[tone], className)}>
      {children}
    </span>
  );
}

/** Relevância legível: texto + ícone + cor (nunca só cor). */
export function Relevance({ score, className }: { score: number; className?: string }) {
  const high = score >= 70;
  const mid = score >= 50;
  const Icon = high ? SignalHigh : mid ? SignalMedium : SignalLow;
  return (
    <Pill tone={high ? "good" : mid ? "warn" : "mute"} className={className} title={`Relevância ${score} de 100`}>
      <Icon aria-hidden />
      Relevância {high ? "alta" : mid ? "média" : "baixa"}
    </Pill>
  );
}

export function KindPill({ kind }: { kind: string }) {
  return <Pill tone="mute">{KIND_SHORT[kind as EditalKind] ?? "Outro"}</Pill>;
}

const TRIAGE_TONE: Record<string, Tone> = { novo: "info", interessante: "brand", em_analise: "brand", em_proposta: "good", proposta_enviada: "good", descartado: "mute", ganho: "good", perdido: "bad" };
export function TriagePill({ triage }: { triage: string }) {
  return <Pill tone={TRIAGE_TONE[triage] ?? "mute"}>{TRIAGE_LABEL[triage as EditalTriage] ?? triage}</Pill>;
}

/** Dias restantes com cor de urgência. */
export function urgencyTone(d: number | null): Tone {
  if (d === null) return "mute";
  if (d < 0) return "mute";
  if (d <= 3) return "bad";
  if (d <= 7) return "warn";
  return "mute";
}
export function daysText(d: number | null) {
  if (d === null) return "Sem prazo informado";
  if (d < 0) return `Encerrou há ${-d} ${-d === 1 ? "dia" : "dias"}`;
  if (d === 0) return "Encerra hoje";
  if (d === 1) return "Encerra amanhã";
  return `${d} dias restantes`;
}
export function DaysLeft({ days, className }: { days: number | null; className?: string }) {
  const tone = urgencyTone(days);
  return (
    <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold", TONE[tone], className)}>
      <Clock className="size-3.5" aria-hidden />
      {daysText(days)}
    </span>
  );
}

export function Person({ name, size = "sm" }: { name: string | null | undefined; size?: "sm" | "md" }) {
  if (!name) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground" title={name}>
      <Avatar className={size === "sm" ? "size-6" : "size-8"}>
        <AvatarFallback className="bg-secondary text-[10px] font-semibold">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name.split(" ")[0]}</span>
    </span>
  );
}

export function PageWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full px-4 pt-5 sm:px-6 lg:px-10", className)}>{children}</div>;
}

export function PageTitle({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="ed-title text-[28px] sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon: React.ElementType; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <p className="ed-title text-xl">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

/** Seção recolhível (HTML nativo: acessível por teclado e sem JS). */
export function Fold({ title, hint, count, defaultOpen, children, id }: { title: string; hint?: string; count?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode; id?: string }) {
  return (
    <details id={id} open={defaultOpen} className="group ed-card scroll-mt-20 open:shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          {hint && <span className="block truncate text-[13px] text-muted-foreground">{hint}</span>}
        </span>
        {count !== undefined && <span className="shrink-0 text-[13px] text-muted-foreground">{count}</span>}
        <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </summary>
      <div className="border-t px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}
