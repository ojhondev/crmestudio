"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      <Label htmlFor={htmlFor} className="text-[12.5px] font-medium text-foreground/80">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Opt = { value: string; label: string; hint?: string | null };

/** Select do shadcn que funciona dentro de <form> (envia `name`). */
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
  return (
    <Select
      name={name}
      defaultValue={defaultValue ?? (allowNone ? "__none" : undefined)}
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowNone && <SelectItem value="__none">{noneLabel}</SelectItem>}
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {o.hint && <span className="text-muted-foreground"> · {o.hint}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
