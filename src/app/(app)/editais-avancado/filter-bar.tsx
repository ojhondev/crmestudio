"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetCloseBtn } from "@/components/touch-close";
import { Field, SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { DEFAULT_FILTERS, filtersToQuery, type EditalFilters } from "@/lib/editais/filters";
import { ESFERA_LABEL, KIND_LABEL, KINDS, TRIAGE_LABEL, TRIAGES, UFS, type EditalKind } from "@/lib/editais/types";

type Person = { id: string; name: string };

/** Quantos filtros (fora a busca e a ordem) estão ligados. */
export function activeCount(f: EditalFilters) {
  const d = DEFAULT_FILTERS;
  return [f.tipos.length > 0, !!f.esfera, f.ufs.length > 0, !!f.city, f.vmin !== null, f.vmax !== null, f.prazo > 0, f.situacao !== d.situacao, !!f.triagem, f.rel !== d.rel, !!f.owner].filter(Boolean).length;
}

export function useGo() {
  const router = useRouter();
  const pathname = usePathname();
  return (f: Partial<EditalFilters>) => {
    const qs = filtersToQuery({ ...f, page: f.page ?? 1 });
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[13px] whitespace-nowrap transition-colors max-md:min-h-11",
        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Busca, filtros (gaveta) e ordem — tudo vai para a URL. */
export function ToolbarFilters({ filters, team }: { filters: EditalFilters; team: Person[] }) {
  const go = useGo();
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const n = activeCount(filters);
  return (
    <>
      <form
        data-tour="edital-search"
        className="relative w-52 shrink-0 sm:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          go({ ...filters, q: q.trim() });
        }}
      >
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar objeto, órgão, cidade…" aria-label="Buscar editais" className="h-9 pl-8 max-md:h-11" enterKeyHint="search" />
      </form>
      <Button type="button" variant="outline" size="sm" data-tour="edital-filters" className="relative max-md:h-11" onClick={() => setOpen(true)}>
        <ListFilter /> Filtros
        {n > 0 && <span className="ml-0.5 grid min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[11px] leading-4.5 font-semibold text-on-brand">{n}</span>}
      </Button>
      <div className="w-36 shrink-0">
        <SimpleSelect
          value={filters.sort}
          onValueChange={(v) => go({ ...filters, sort: v as EditalFilters["sort"] })}
          options={[
            { value: "prazo", label: "Ordem: prazo" },
            { value: "relevancia", label: "Ordem: relevância" },
            { value: "valor", label: "Ordem: valor" },
            { value: "recentes", label: "Ordem: recentes" },
          ]}
        />
      </div>
      <FilterSheet open={open} onOpenChange={setOpen} filters={filters} team={team} />
    </>
  );
}

function FilterSheet({ open, onOpenChange, filters, team }: { open: boolean; onOpenChange: (o: boolean) => void; filters: EditalFilters; team: Person[] }) {
  const go = useGo();
  const [f, setF] = useState(filters);
  const set = <K extends keyof EditalFilters>(k: K, v: EditalFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const apply = () => {
    go(f);
    onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) setF(filters);
        onOpenChange(o);
      }}
    >
      <SheetContent className="flex flex-col gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-md" showCloseButton={false}>
        <SheetCloseBtn />
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>O padrão mostra só editais abertos e com boa relevância. Os filtros ficam na URL: dá para copiar e compartilhar.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-4 pb-4">
          <Field label="Tipo de contratação">
            <div className="flex flex-wrap gap-1.5">
              {KINDS.filter((k) => k !== "outro").map((k) => (
                <Chip key={k} active={f.tipos.includes(k)} onClick={() => set("tipos", toggle<EditalKind>(f.tipos, k))}>
                  {KIND_LABEL[k]}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">“Projeto” e “Execução” também trazem os editais de projeto + execução.</p>
          </Field>
          <Field label="Relevância mínima">
            <SimpleSelect
              value={String(f.rel)}
              onValueChange={(v) => set("rel", Number(v))}
              options={[
                { value: "70", label: "Alta (70+) — só o que é restauro de fato" },
                { value: "50", label: "Boa (50+) — padrão" },
                { value: "35", label: "Possível (35+) — inclui duvidosos" },
                { value: "0", label: "Tudo" },
              ]}
            />
          </Field>
          <Field label="Situação do edital">
            <SimpleSelect
              value={f.situacao}
              onValueChange={(v) => set("situacao", v as EditalFilters["situacao"])}
              options={[
                { value: "aberto", label: "Abertos (recebendo propostas)" },
                { value: "encerrado", label: "Encerrados" },
                { value: "suspenso", label: "Suspensos" },
                { value: "cancelado", label: "Cancelados / revogados" },
                { value: "todos", label: "Todos" },
              ]}
            />
          </Field>
          <Field label="Prazo de propostas">
            <SimpleSelect
              value={String(f.prazo)}
              onValueChange={(v) => set("prazo", Number(v))}
              options={[
                { value: "0", label: "Qualquer prazo" },
                { value: "3", label: "Encerra em até 3 dias" },
                { value: "7", label: "Encerra em até 7 dias" },
                { value: "15", label: "Encerra em até 15 dias" },
                { value: "30", label: "Encerra em até 30 dias" },
                { value: "60", label: "Encerra em até 60 dias" },
              ]}
            />
          </Field>
          <Field label="Triagem da equipe">
            <SimpleSelect
              value={f.triagem || "__padrao"}
              onValueChange={(v) => set("triagem", (v === "__padrao" ? "" : v) as EditalFilters["triagem"])}
              options={[
                { value: "__padrao", label: "Todos, menos descartados" },
                { value: "ativos", label: "Em andamento (novo, interessante, análise, proposta)" },
                ...TRIAGES.map((t) => ({ value: t, label: TRIAGE_LABEL[t] })),
                { value: "todos", label: "Tudo, inclusive descartados" },
              ]}
            />
          </Field>
          <Field label="Responsável">
            <SimpleSelect
              value={f.owner || "__todos"}
              onValueChange={(v) => set("owner", v === "__todos" ? "" : v)}
              options={[{ value: "__todos", label: "Qualquer" }, { value: "me", label: "Eu" }, { value: "sem", label: "Sem responsável" }, ...team.map((u) => ({ value: u.id, label: u.name }))]}
            />
          </Field>
          <Field label="Esfera">
            <SimpleSelect
              value={f.esfera || "__todas"}
              onValueChange={(v) => set("esfera", v === "__todas" ? "" : v)}
              options={[{ value: "__todas", label: "Federal, estadual e municipal" }, ...Object.entries(ESFERA_LABEL).map(([value, label]) => ({ value, label }))]}
            />
          </Field>
          <Field label="Estados (UF)">
            <div className="flex flex-wrap gap-1.5">
              {UFS.map((u) => (
                <Chip key={u} active={f.ufs.includes(u)} onClick={() => set("ufs", toggle(f.ufs, u))} className="min-w-12 justify-center px-2">
                  {u}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Município">
            <Input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Ex.: Ouro Preto" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor mínimo (R$)">
              <Input type="number" inputMode="numeric" min={0} value={f.vmin ?? ""} onChange={(e) => set("vmin", e.target.value === "" ? null : Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Valor máximo (R$)">
              <Input type="number" inputMode="numeric" min={0} value={f.vmax ?? ""} onChange={(e) => set("vmax", e.target.value === "" ? null : Number(e.target.value))} placeholder="sem limite" />
            </Field>
          </div>
        </div>
        <div className="flex gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            onClick={() => {
              go({ ...DEFAULT_FILTERS, q: filters.q, sort: filters.sort });
              onOpenChange(false);
            }}
          >
            <X /> Limpar
          </Button>
          <Button type="button" className="flex-1 max-md:h-11" onClick={apply}>
            Aplicar filtros
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
