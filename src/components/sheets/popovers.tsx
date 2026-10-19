"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PALETTE } from "./model";

/* ------------------------------- seletor de cor ------------------------------- */

export function ColorPicker({
  children,
  onPick,
  label,
  allowNone,
  onClosed,
}: {
  children: React.ReactNode;
  onPick: (color: string | null) => void;
  label: string;
  allowNone?: boolean;
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onClosed?.();
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto gap-2 p-2"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed?.();
        }}
        aria-label={label}
      >
        <div className="grid gap-1">
          {PALETTE.map((row, i) => (
            <div key={i} className="flex gap-1">
              {row.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={c}
                  onClick={() => {
                    onPick(c);
                    setOpen(false);
                  }}
                  className="size-5 rounded-sm border border-black/10 max-md:size-7"
                  style={{ background: c }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          {allowNone && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
            >
              Sem cor
            </Button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Personalizada
            <input
              type="color"
              className="h-6 w-8 cursor-pointer rounded border bg-transparent"
              onChange={(e) => onPick(e.target.value)}
              onBlur={() => setOpen(false)}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------- filtro de coluna ------------------------------- */

export function FilterPopover({
  anchor,
  values,
  allowed,
  onApply,
  onSort,
  onClose,
}: {
  anchor: DOMRect;
  values: string[];
  /** valores marcados (undefined = todos) */
  allowed: string[] | undefined;
  onApply: (allowed: string[] | null) => void;
  onSort: (asc: boolean) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(allowed ?? values));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const shown = useMemo(() => values.filter((v) => (v || "(Vazias)").toLowerCase().includes(q.toLowerCase())), [values, q]);
  const allShown = shown.length > 0 && shown.every((v) => checked.has(v));
  const left = Math.min(anchor.left, window.innerWidth - 270);
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 380);

  return (
    <div ref={ref} className="fixed z-[60] grid w-64 gap-2 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10" style={{ left: Math.max(8, left), top: Math.max(8, top) }} role="dialog" aria-label="Filtrar coluna">
      <div className="flex gap-1.5">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { onSort(true); onClose(); }}>
          <ArrowDownAZ /> A → Z
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { onSort(false); onClose(); }}>
          <ArrowUpAZ /> Z → A
        </Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar valores…" className="h-8" aria-label="Buscar valores" />
      <label className="flex cursor-pointer items-center gap-2 px-1 text-[13px] font-medium">
        <input
          type="checkbox"
          checked={allShown}
          onChange={() => {
            const n = new Set(checked);
            for (const v of shown) {
              if (allShown) n.delete(v);
              else n.add(v);
            }
            setChecked(n);
          }}
        />
        Selecionar tudo
      </label>
      <div className="thin-scroll max-h-52 overflow-y-auto">
        {shown.slice(0, 400).map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-muted max-md:py-2">
            <input
              type="checkbox"
              checked={checked.has(v)}
              onChange={() => {
                const n = new Set(checked);
                if (n.has(v)) n.delete(v);
                else n.add(v);
                setChecked(n);
              }}
            />
            <span className="truncate">{v || "(Vazias)"}</span>
          </label>
        ))}
        {shown.length > 400 && <p className="px-1 py-1 text-xs text-muted-foreground">Mostrando 400 de {shown.length}. Use a busca para refinar.</p>}
        {!shown.length && <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum valor.</p>}
      </div>
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => { onApply(null); onClose(); }}>
          Limpar
        </Button>
        <Button type="button" size="sm" onClick={() => { onApply(checked.size >= values.length ? null : values.filter((v) => checked.has(v))); onClose(); }}>
          <Check /> Aplicar
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- menu de contexto ------------------------------- */

export type CtxItem = { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; sep?: boolean; shortcut?: string };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const el = ref.current;
    if (el) setPos({ left: Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 4)), top: Math.max(4, Math.min(y, window.innerHeight - el.offsetHeight - 4)) });
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  }, [x, y, onClose]);
  return (
    <div ref={ref} role="menu" className="fixed z-[70] min-w-52 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10" style={pos}>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="my-1 h-px bg-border" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className={`flex w-full items-center justify-between gap-6 rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-40 max-md:py-2.5 ${it.danger ? "text-destructive" : ""}`}
          >
            <span>{it.label}</span>
            {it.shortcut && <span className="text-xs text-muted-foreground">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
