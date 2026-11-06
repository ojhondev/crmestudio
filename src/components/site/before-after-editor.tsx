"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageField } from "./image-field";

export type BeforeAfterPair = { before: string; after: string; caption: string };

/** Pares de fotos antes/depois. No site viram um comparador que o visitante arrasta. */
export function BeforeAfterEditor({ value, onChange }: { value: BeforeAfterPair[]; onChange: (v: BeforeAfterPair[]) => void }) {
  const set = (i: number, patch: Partial<BeforeAfterPair>) => onChange(value.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="grid gap-3">
      <div>
        <h2 className="label">Antes e depois</h2>
        <p className="text-xs text-muted-foreground">Use fotos com o mesmo enquadramento. Só entram pares com as duas fotos.</p>
      </div>
      {value.map((p, i) => (
        <div key={i} className="grid gap-3 rounded-lg border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField label="Antes" value={p.before} onChange={(u) => set(i, { before: u })} />
            <ImageField label="Depois" value={p.after} onChange={(u) => set(i, { after: u })} />
          </div>
          <div className="flex items-center gap-2">
            <Input value={p.caption} onChange={(e) => set(i, { caption: e.target.value })} placeholder="Legenda (opcional)" maxLength={300} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remover par" className="max-md:size-11" onClick={() => onChange(value.filter((_, k) => k !== i))}>
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => onChange([...value, { before: "", after: "", caption: "" }])}>
          <Plus /> Adicionar par antes/depois
        </Button>
      </div>
    </div>
  );
}
