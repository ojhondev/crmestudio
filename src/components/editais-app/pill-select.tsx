"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PillOption = { value: string; label: string };

/** Filtro em forma de pílula; por baixo é um <select> nativo (no celular abre o seletor do aparelho). */
export function PillSelect({ label, value, options, onChange, className }: { label: string; value: string; options: PillOption[]; onChange: (v: string) => void; className?: string }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const active = value !== options[0].value;
  return (
    <label
      className={cn(
        "relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border pr-8 pl-3.5 text-sm whitespace-nowrap transition-colors focus-within:ring-2 focus-within:ring-ring md:h-9",
        active ? "border-brand bg-brand-soft text-foreground" : "bg-card hover:bg-muted",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{current.label}</span>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
