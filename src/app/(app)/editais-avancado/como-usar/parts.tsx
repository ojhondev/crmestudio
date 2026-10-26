import { Children } from "react";
import Link from "next/link";
import { ArrowUpRight, Lightbulb, Target, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Peças de texto da página "Como usar" (Editais). Só servidor, sem estado: o conteúdo mora em content.tsx.
 * Padrão de cada seção: Para que serve → Passo a passo (numerado) → Dica → Cuidado.
 */

/** Seção ancorada. O índice lateral aponta para o `id`. */
export function Sec({ id, n, title, lead, children }: { id: string; n: number; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} data-sec aria-labelledby={`${id}-t`} className="scroll-mt-[13.5rem] lg:scroll-mt-[10.5rem]">
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden className="num mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[14px] font-semibold text-brand">
          {n}
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="h-section text-[20px] leading-snug sm:text-[22px]">
            {title}
          </h2>
          {lead && <p className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{lead}</p>}
        </div>
      </div>
      <div className="grid gap-5 text-[14.5px] leading-relaxed">{children}</div>
    </section>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="h-section pt-1 text-[16px]">{children}</h3>;
}

/** “Para que serve” */
export function Why({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-card p-3.5">
      <Target aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="min-w-0">
        <p className="label mb-0.5">Para que serve</p>
        <div className="grid gap-2">{children}</div>
      </div>
    </div>
  );
}

/** “Passo a passo” numerado */
export function Steps({ title = "Passo a passo", children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2.5">
      <p className="label">{title}</p>
      <ol className="grid gap-2.5">
        {Children.toArray(children).map((c, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand">
              {i + 1}
            </span>
            <span className="min-w-0">{c}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Bullets({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      {title && <p className="label">{title}</p>}
      <ul className="grid gap-1.5 pl-5">
        {Children.toArray(children).map((c, i) => (
          <li key={i} className="list-disc marker:text-brand/70">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-brand/25 bg-brand-soft p-3.5">
      <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="min-w-0">
        <strong className="font-semibold">Dica: </strong>
        {children}
      </div>
    </div>
  );
}

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3.5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <strong className="font-semibold">Cuidado: </strong>
        {children}
      </div>
    </div>
  );
}

/** Nome de botão, aba ou campo exatamente como aparece na tela. */
export function UI({ children }: { children: React.ReactNode }) {
  return <strong className="rounded bg-muted px-1.5 py-0.5 text-[0.93em] font-semibold text-foreground">{children}</strong>;
}

/** Link no texto, para uma tela real do CRM. */
export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-foreground underline decoration-brand/50 underline-offset-[3px] hover:decoration-brand">
      {children}
    </Link>
  );
}

/** Botão-link grande (alvo de toque ≥ 44px) para abrir uma tela. */
export function Go({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-card px-3.5 py-2 text-[13.5px] font-medium hover:border-foreground/30 hover:bg-muted/60", className)}
    >
      {children}
      <ArrowUpRight aria-hidden className="size-4 text-brand" />
    </Link>
  );
}

/** Pergunta frequente (recolhível). */
export function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details data-faq className="group rounded-xl border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14.5px] font-medium [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{q}</span>
        <span aria-hidden className="shrink-0 text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="grid gap-2 border-t px-4 py-3 text-[14px] leading-relaxed">{children}</div>
    </details>
  );
}

/** Item do glossário. */
export function Term({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div data-faq className="grid gap-0.5 rounded-xl border bg-card px-4 py-3">
      <dt className="font-semibold">{t}</dt>
      <dd className="text-[14px] text-muted-foreground">{children}</dd>
    </div>
  );
}
