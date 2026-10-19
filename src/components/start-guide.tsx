"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp, Compass, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Action = { href: string; t: string; d: string };
type State = "open" | "collapsed" | "hidden";
const KEY = "restaura-start-guide";

// localStorage com try/catch (pode falhar em janela privada) + cópia em memória
let memory: State | null = null;
const listeners = new Set<() => void>();
const read = (): State => {
  if (memory) return memory;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "open" || v === "collapsed" || v === "hidden") return v;
  } catch {}
  return "open";
};
const write = (s: State) => {
  memory = s;
  try {
    window.localStorage.setItem(KEY, s);
  } catch {}
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** “Por onde começar”: pode ser recolhido (some o conteúdo) ou fechado (vira um botão pequeno). A escolha fica salva neste aparelho. */
export function StartGuide({ actions }: { actions: Action[] }) {
  const state = useSyncExternalStore(subscribe, read, () => "open" as State);
  const set = useCallback((s: State) => write(s), []);

  if (state === "hidden") {
    return (
      <button
        type="button"
        onClick={() => set("open")}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-3.5 py-2 text-[13px] text-muted-foreground hover:border-brand hover:text-foreground"
      >
        <Compass className="size-4 text-brand" /> Mostrar “Por onde começar”
      </button>
    );
  }

  const open = state === "open";
  return (
    <section aria-labelledby="start-title" className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
        <Compass className="size-4.5 shrink-0 text-brand" />
        <h2 id="start-title" className="min-w-0 flex-1 text-[15px] font-semibold">
          Por onde começar
        </h2>
        <button
          type="button"
          onClick={() => set(open ? "collapsed" : "open")}
          aria-expanded={open}
          aria-controls="start-body"
          className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:size-9"
          title={open ? "Recolher" : "Expandir"}
        >
          <span className="sr-only">{open ? "Recolher guia" : "Expandir guia"}</span>
          {open ? <ChevronUp className="size-4.5" /> : <ChevronDown className="size-4.5" />}
        </button>
        <button
          type="button"
          onClick={() => set("hidden")}
          className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:size-9"
          title="Fechar (dá para reabrir depois)"
        >
          <span className="sr-only">Fechar guia</span>
          <X className="size-4.5" />
        </button>
      </div>
      <div id="start-body" className={cn("border-t px-4 pb-4 pt-3 sm:px-5", !open && "hidden")}>
        <p className="text-[13px] text-muted-foreground">Atalhos para o que mais se faz no dia a dia. Dúvidas? O botão “?” no topo faz um tour e abre a ajuda.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((a) => (
            <Link key={a.href} href={a.href} className="group rounded-lg border bg-background p-3 hover:border-brand hover:bg-brand-soft">
              <span className="flex items-center justify-between text-[13.5px] font-semibold">
                {a.t} <ArrowRight className="size-3.5 text-brand transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[12.5px] text-muted-foreground">{a.d}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
