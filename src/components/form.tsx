"use client";

import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  children,
  className,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Opt = { value: string; label: string; hint?: string | null };

/**
 * Seletor NATIVO (<select>): abre na hora, não pesa na montagem do formulário e, no celular,
 * usa o seletor do próprio aparelho. Funciona dentro de <form> (envia `name`).
 */
export function SimpleSelect({
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  placeholder = "Selecione",
  allowNone,
  noneLabel = "—",
  className,
  id,
}: {
  name?: string;
  options: (Opt | string)[];
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  id?: string;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const initial = defaultValue ?? (allowNone ? "__none" : "");
  const controlled = value !== undefined ? { value } : { defaultValue: initial };
  return (
    <div className="relative w-full">
      <select
        id={id}
        name={name}
        {...controlled}
        onChange={onValueChange ? (e) => onValueChange(e.target.value) : undefined}
        className={cn(
          "h-9 max-md:h-10 w-full appearance-none truncate rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:h-8 md:text-sm dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
          className,
        )}
      >
        {!allowNone && !initial && value === undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {allowNone && <option value="__none">{noneLabel}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.hint ? ` · ${o.hint}` : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
