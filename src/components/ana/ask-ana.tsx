"use client";

import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { useAna } from "./ana-provider";

const QUICK = ["Resumo do meu dia", "Quem precisa de follow-up?", "Como está o caixa do mês?"];

/** Atalho no painel: pergunta direto para a Ana. */
export function AskAna() {
  const ana = useAna();
  const [q, setQ] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-gradient-to-r from-brand-soft/70 to-white px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-brand">
        <Sparkles className="size-4" />
      </span>
      <form
        className="relative min-w-60 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ana.open(q.trim());
          setQ("");
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pergunte à Ana sobre clientes, funil, agenda ou caixa…"
          className="h-9 w-full rounded-full border border-black/5 bg-white pr-10 pl-4 text-[13.5px] outline-none placeholder:text-muted-foreground focus:border-brand/40"
        />
        <button aria-label="Perguntar" className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-brand text-white">
          <ArrowUp className="size-3.5" />
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((s) => (
          <button key={s} onClick={() => ana.open(s)} className="rounded-full border border-black/5 bg-white px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
