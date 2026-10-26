"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListTree, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TocItem = { id: string; n: number; title: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Índice fixo (lateral no computador, recolhível e fixo no topo no celular), busca simples e seção ativa.
 * A busca esconde as seções (e as perguntas) que não têm o termo: tudo no navegador, sem consultar nada.
 */
export function ComoUsarNav({ items }: { items: TocItem[] }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [found, setFound] = useState<string[] | null>(null);
  const mobile = useRef<HTMLDetailsElement>(null);

  // seção ativa conforme a rolagem: a última cuja parte de cima já passou da barra fixa
  useEffect(() => {
    let timer = 0;
    const calc = () => {
      timer = 0;
      let cur = items[0]?.id ?? "";
      for (const i of items) {
        const el = document.getElementById(i.id);
        if (el && !el.hidden && el.getBoundingClientRect().top <= 220) cur = i.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const last = [...items].reverse().find((i) => !document.getElementById(i.id)?.hidden);
        if (last) cur = last.id;
      }
      setActive(cur);
    };
    const on = () => {
      if (!timer) timer = window.setTimeout(calc, 60);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (timer) window.clearTimeout(timer);
    };
  }, [items]);

  // busca: esconde seções e perguntas sem o termo
  useEffect(() => {
    const term = norm(q.trim());
    const secs = [...document.querySelectorAll<HTMLElement>("[data-sec]")];
    const faqs = [...document.querySelectorAll<HTMLElement>("[data-faq]")];
    if (term.length < 2) {
      secs.forEach((s) => (s.hidden = false));
      faqs.forEach((f) => (f.hidden = false));
      document.getElementById("como-usar-vazio")?.setAttribute("hidden", "");
      const t = window.setTimeout(() => setFound(null), 0);
      return () => window.clearTimeout(t);
    }
    faqs.forEach((f) => {
      const hit = norm(f.textContent ?? "").includes(term);
      f.hidden = !hit;
      if (hit && f instanceof HTMLDetailsElement) f.open = true;
    });
    const ids: string[] = [];
    secs.forEach((s) => {
      const hasFaq = s.querySelector("[data-faq]");
      const title = norm(s.querySelector("h2")?.textContent ?? "");
      const visibleFaq = hasFaq ? [...s.querySelectorAll<HTMLElement>("[data-faq]")].some((f) => !f.hidden) : false;
      const hit = hasFaq ? title.includes(term) || visibleFaq : norm(s.textContent ?? "").includes(term);
      s.hidden = !hit;
      if (hasFaq && title.includes(term)) s.querySelectorAll<HTMLElement>("[data-faq]").forEach((f) => (f.hidden = false));
      if (hit) ids.push(s.id);
    });
    document.getElementById("como-usar-vazio")?.toggleAttribute("hidden", ids.length > 0);
    const t = window.setTimeout(() => setFound(ids), 0);
    return () => window.clearTimeout(t);
  }, [q]);

  const go = () => {
    if (mobile.current) mobile.current.open = false;
  };

  const list = (
    <ol className="grid gap-0.5">
      {items.map((i) => {
        const off = found !== null && !found.includes(i.id);
        return (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              onClick={go}
              aria-current={active === i.id ? "location" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] leading-snug lg:min-h-9",
                active === i.id ? "bg-brand-soft font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                off && "opacity-40",
              )}
            >
              <span aria-hidden className="num grid size-5 shrink-0 place-items-center rounded-full border text-[11px]">
                {i.n}
              </span>
              <span className="min-w-0">{i.title}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );

  const search = (
    <div className="relative" data-tour="como-usar-busca">
      <Search aria-hidden className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar nesta página…"
        aria-label="Buscar nesta página"
        enterKeyHint="search"
        className="h-11 w-full rounded-lg border bg-background [&::-webkit-search-cancel-button]:hidden pr-9 pl-8 text-base outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 lg:h-9 lg:text-sm"
      />
      {q && (
        <button type="button" onClick={() => setQ("")} aria-label="Limpar busca" className="absolute top-1/2 right-0.5 grid size-10 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground lg:size-8">
          <X className="size-4" />
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* celular: fixo logo abaixo da barra do módulo, recolhível */}
      <details ref={mobile} data-tour="como-usar-indice" className="group sticky top-[9.3rem] z-10 -mx-4 border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
          <ListTree aria-hidden className="size-4 text-brand" />
          <span className="min-w-0 flex-1 truncate">Índice e busca</span>
          <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid max-h-[60dvh] gap-2 overflow-y-auto overscroll-contain pb-3">
          {search}
          <nav aria-label="Índice da página">{list}</nav>
        </div>
      </details>

      {/* computador: lateral e fixo */}
      <aside data-tour="como-usar-indice" className="sticky top-[10.5rem] hidden max-h-[calc(100dvh-12rem)] w-64 shrink-0 gap-3 self-start overflow-y-auto overscroll-contain lg:grid xl:w-72">
        {search}
        <nav aria-label="Índice da página">{list}</nav>
      </aside>
    </>
  );
}
