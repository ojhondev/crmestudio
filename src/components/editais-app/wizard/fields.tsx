"use client";

import { useEffect, useId, useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const underline =
  "w-full rounded-none border-0 border-b-2 border-border bg-transparent px-0 py-3 text-2xl leading-tight outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-brand sm:text-3xl";

/** Campo grande, de uma linha só (estilo formulário de uma pergunta por vez). */
export function BigInput({ label, value, onChange, placeholder, type = "text", inputMode, autoFocus = true, maxLength = 200, hint, suffix, min, step }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "url" | "date" | "datetime-local" | "number" | "tel";
  inputMode?: "text" | "decimal" | "numeric" | "email" | "url" | "tel";
  autoFocus?: boolean;
  maxLength?: number;
  hint?: string;
  suffix?: string;
  min?: string | number;
  step?: string | number;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex items-baseline gap-2">
        <input id={id} data-autofocus={autoFocus ? "" : undefined} className={underline} type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} autoComplete="off" min={min} step={step} />
        {suffix && <span className="shrink-0 text-xl text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function BigTextarea({ label, value, onChange, placeholder, rows = 5, maxLength = 4000, hint, autoFocus = true }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number; hint?: string; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        data-autofocus={autoFocus ? "" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full resize-y rounded-2xl border-2 bg-card px-4 py-3 text-lg leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-brand"
      />
      <p className="text-sm text-muted-foreground">{hint ?? "Dica: Ctrl + Enter avança."}</p>
    </div>
  );
}

export type Choice = { value: string; label: string; hint?: string | null; badge?: string; tone?: "bad" | "warn" | "good" };

/**
 * Lista de escolhas grandes. Teclas 1–9 escolhem; ↑↓ navegam; Enter confirma. `multi` permite várias.
 * Com `onPick` (escolha única) a pergunta pode avançar sozinha.
 */
export function ChoiceList({ options, value, onChange, multi, onPick, label }: { options: Choice[]; value: string | string[]; onChange: (v: string | string[]) => void; multi?: boolean; onPick?: () => void; label: string }) {
  const sel = Array.isArray(value) ? value : value ? [value] : [];
  const ref = useRef<HTMLDivElement>(null);

  function toggle(v: string) {
    if (multi) onChange(sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
    else {
      onChange(v);
      if (onPick) setTimeout(onPick, 220);
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && options[n - 1]) {
        e.preventDefault();
        toggle(options[n - 1].value);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, value]);

  return (
    <div ref={ref} role={multi ? "group" : "radiogroup"} aria-label={label} className="grid gap-2.5">
      {options.map((o, i) => {
        const on = sel.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            data-autofocus={i === 0 && !sel.length && !multi ? "" : undefined}
            onClick={() => toggle(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
                const idx = items.indexOf(e.currentTarget);
                items[(idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
              }
            }}
            className={cn(
              "group flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "border-brand bg-brand-soft" : "bg-card hover:border-foreground/30",
            )}
          >
            <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold", on ? "border-brand bg-brand text-on-brand" : "bg-background text-muted-foreground")}>
              {on ? <Check className="size-4" /> : i < 9 ? i + 1 : ""}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] leading-snug font-medium">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-sm text-muted-foreground">{o.hint}</span>}
            </span>
            {o.badge && (
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", o.tone === "bad" ? "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300" : o.tone === "warn" ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300" : o.tone === "good" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Sim / Não grande. */
export function YesNo({ value, onChange, yes = "Sim", no = "Não", label, onPick }: { value: boolean | null; onChange: (v: boolean) => void; yes?: string; no?: string; label: string; onPick?: () => void }) {
  return (
    <ChoiceList
      label={label}
      options={[
        { value: "y", label: yes },
        { value: "n", label: no },
      ]}
      value={value === null ? "" : value ? "y" : "n"}
      onChange={(v) => onChange(v === "y")}
      onPick={onPick}
    />
  );
}
