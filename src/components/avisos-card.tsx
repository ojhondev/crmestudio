"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Avisos } from "@/lib/avisos";

type State = "open" | "collapsed";
const KEY = "restaura-avisos";

// localStorage com try/catch (pode falhar em janela privada) + cópia em memória
let memory: State | null = null;
const listeners = new Set<() => void>();
const read = (): State => {
  if (memory) return memory;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "open" || v === "collapsed") return v;
  } catch {}
  // sem escolha salva: no celular começa recolhido (o resumo continua visível no cabeçalho)
  return window.innerWidth < 1024 ? "collapsed" : "open";
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

const TONE = {
  bad: "text-red-700 dark:text-red-300",
  warn: "text-amber-800 dark:text-amber-300",
  info: "text-foreground",
} as const;

/** AVISOS do painel: resumo do que o sistema mapeou (atrasos, prazos, leads parados, ações da equipe). Recolhível; a escolha fica neste aparelho. */
export function AvisosCard({ data }: { data: Avisos }) {
  const state = useSyncExternalStore(subscribe, read, () => "open" as State);
  const set = useCallback((s: State) => write(s), []);
  const open = state === "open";
  const active = data.items.filter((i) => i.count > 0);

  return (
    <section aria-labelledby="avisos-title" data-tour="dash-avisos" className="w-full min-w-0 rounded-xl border bg-card lg:w-[27rem] lg:shrink-0 xl:w-[31rem]">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Bell className="size-4.5 shrink-0 text-brand" />
        <div className="grid min-w-0 flex-1 leading-tight">
          <h2 id="avisos-title" className="label">
            Avisos {data.team ? <span className="normal-case tracking-normal text-muted-foreground">· visão da equipe</span> : null}
          </h2>
          {!open && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{active.length ? active.slice(0, 3).map((i) => `${i.count} ${i.short}`).join(" · ") : "Tudo em dia"}</p>
          )}
        </div>
        {data.total > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand">{data.total}</span>}
        <button
          type="button"
          onClick={() => set(open ? "collapsed" : "open")}
          aria-expanded={open}
          aria-controls="avisos-body"
          className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:size-9"
          title={open ? "Recolher" : "Expandir"}
        >
          <span className="sr-only">{open ? "Recolher avisos" : "Expandir avisos"}</span>
          {open ? <ChevronUp className="size-4.5" /> : <ChevronDown className="size-4.5" />}
        </button>
      </div>

      <div id="avisos-body" className={cn("grid gap-3 border-t px-4 pb-4 pt-3", !open && "hidden")}>
        {active.length ? (
          <ul className="grid grid-cols-2 gap-2">
            {active.map((i) => (
              <li key={i.key} className="min-w-0">
                <Link href={i.href} className="flex h-full min-h-14 items-center gap-2.5 rounded-lg border bg-background px-3 py-2 hover:border-brand">
                  <span className={cn("num text-[22px] leading-none font-semibold", TONE[i.tone])}>{i.count}</span>
                  <span className="min-w-0 text-[12.5px] leading-tight break-words text-muted-foreground">{i.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-3 text-[13px] text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> Tudo em dia: nada atrasado, parado ou perto do prazo.
          </p>
        )}

        {data.recent.length > 0 && (
          <div className="grid gap-1.5">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ações recentes</h3>
            <ul className="grid gap-0.5">
              {data.recent.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <Link href={r.href} className="flex items-baseline gap-2 rounded-md py-1.5 text-[12.5px] leading-snug hover:text-brand max-md:min-h-10">
                    <span className="min-w-0 flex-1 break-words">
                      <b className="font-medium">{r.who.split(" ")[0]}</b> {r.text}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.ago}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href="/notificacoes" className="w-fit text-[13px] text-brand underline-offset-2 hover:underline max-md:py-1.5">
          Ver todos os avisos
        </Link>
      </div>
    </section>
  );
}
