"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin, Play, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { tours } from "@/lib/help";
import { useTour } from "./tour";

type Item = { slug: string; module: string; title: string; summary: string; text: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function HelpCenter({ items, faq }: { items: Item[]; faq: { q: string; a: string }[] }) {
  const [q, setQ] = useState("");
  const tour = useTour();

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return null;
    const words = t.split(/\s+/);
    return items.filter((i) => {
      const hay = norm(`${i.title} ${i.summary} ${i.text}`);
      return words.every((w) => hay.includes(w));
    });
  }, [q, items]);

  const modules = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.module, [...(m.get(i.module) ?? []), i]);
    return [...m.entries()];
  }, [items]);

  return (
    <div className="grid gap-8">
      <div className="relative max-w-xl">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: “agenda”, “parcelar”, “whatsapp”…" className="h-11 pl-9 text-[14px]" aria-label="Buscar na ajuda" />
      </div>

      {results ? (
        <section className="grid gap-2">
          <p className="label">{results.length} {results.length === 1 ? "resultado" : "resultados"}</p>
          {results.map((r) => (
            <Link key={r.slug} href={`/ajuda/${r.slug}`} className="grid gap-0.5 rounded-xl border bg-card p-4 hover:border-foreground/25">
              <span className="text-[14.5px] font-medium">{r.title}</span>
              <span className="text-[13px] text-muted-foreground">{r.summary}</span>
            </Link>
          ))}
          {!results.length && <p className="text-sm text-muted-foreground">Nada encontrado. Tente outra palavra.</p>}
        </section>
      ) : (
        <>
          <section className="grid gap-3">
            <h2 className="label">Tours guiados</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(tours).map(([id, t]) => (
                <button
                  key={id}
                  onClick={() => tour.launch(id)}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-brand/40"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">{id === "welcome" ? <Play className="size-4" /> : <MapPin className="size-4" />}</span>
                  <span className="grid leading-tight">
                    <span className="text-[13.5px] font-medium">{t.label}</span>
                    <span className="text-[12px] text-muted-foreground">{t.steps.length} passos</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground">Dentro de qualquer tela, o botão “?” → Tour desta tela refaz o roteiro dela.</p>
          </section>

          {modules.map(([module, list]) => (
            <section key={module} className="grid gap-3">
              <h2 className="label">{module}</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((a) => (
                  <Link key={a.slug} href={`/ajuda/${a.slug}`} className="grid content-start gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/25">
                    <span className="text-[14.5px] font-medium">{a.title}</span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{a.summary}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <section className="grid max-w-3xl gap-3">
            <h2 className="label">Dúvidas frequentes</h2>
            <div className="grid divide-y rounded-xl border bg-card">
              {faq.map((f) => (
                <details key={f.q} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-medium">
                    {f.q}
                    <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function TourButton({ id, label = "Fazer o tour desta tela" }: { id: string; label?: string }) {
  const tour = useTour();
  return (
    <Button variant="outline" onClick={() => tour.launch(id)}>
      <MapPin /> {label}
    </Button>
  );
}
