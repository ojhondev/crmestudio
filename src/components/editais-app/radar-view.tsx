"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, Download, Ellipsis, Inbox, Loader2, Search, SlidersHorizontal, SearchX, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ESFERA_LABEL, ESFERAS, KIND_LABEL, KINDS, UFS } from "@/lib/editais/types";
import { RADAR_TABS, tabOfTriage, type RadarTab } from "@/lib/editais-app/access";
import { interestAction, radarMoreAction, restoreAction } from "@/lib/editais-app/actions/radar";
import { DECIDED_TABS, extraFilterCount, radarQuery, type RadarFilters } from "@/lib/editais-app/radar-filters";
import type { RadarCard } from "@/lib/editais-app/radar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DiscardDialog, ShareDialog, type SharePartner } from "./dialogs";
import { EditalCard } from "./edital-card";
import { PillSelect } from "./pill-select";
import { Empty } from "./primitives";
import { ScanControl } from "./scan-button";

type Props = {
  initial: { rows: RadarCard[]; total: number; counts: Record<RadarTab, number>; hasMore: boolean };
  filters: RadarFilters;
  ufCounts: { uf: string; n: number }[];
  mode: "staff" | "partner";
  canEdit: boolean;
  canScan: boolean;
  canExport: boolean;
  lastFinishedAt: string | null;
  scanBusy: boolean;
  owners: { id: string; name: string }[];
  partners: SharePartner[];
};

const PRAZO = [
  { value: "0", label: "Qualquer" },
  { value: "3", label: "até 3 dias" },
  { value: "7", label: "até 7 dias" },
  { value: "15", label: "até 15 dias" },
  { value: "30", label: "até 30 dias" },
];
/** o padrão da aba vem primeiro (a pílula só acende quando foge dele) */
const relOptions = (decided: boolean) =>
  decided
    ? [{ value: "0", label: "Todas" }, { value: "50", label: "Média ou alta" }, { value: "70", label: "Só alta" }]
    : [{ value: "50", label: "Média ou alta" }, { value: "0", label: "Todas" }, { value: "70", label: "Só alta" }];
const SORT = [
  { value: "prazo", label: "Prazo" },
  { value: "relevancia", label: "Relevância" },
  { value: "valor", label: "Valor" },
  { value: "recentes", label: "Mais recentes" },
];

export function RadarView({ initial, filters, ufCounts, mode, canEdit, canScan, canExport, lastFinishedAt, scanBusy, owners, partners }: Props) {
  const router = useRouter();
  const staff = mode === "staff";
  const [navPending, startNav] = useTransition();
  const [rows, setRows] = useState(initial.rows);
  const [counts, setCounts] = useState(initial.counts);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discard, setDiscard] = useState<RadarCard | null>(null);
  const [share, setShare] = useState<{ ids: string[]; hasDossie: boolean } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(() => extraFilterCount(filters) > 0);
  const [q, setQ] = useState(filters.q);
  const first = useRef(true);

  const base = (patch: Partial<RadarFilters>) => ({ ...filters, ...patch, page: 1 });
  const url = (f: Partial<RadarFilters>) => {
    const qs = radarQuery(f, { partner: !staff });
    return `/editais/radar${qs ? `?${qs}` : ""}`;
  };
  const go = (patch: Partial<RadarFilters>) => startNav(() => router.replace(url(base(patch)), { scroll: false }));

  // busca com atraso (a tecla Enter envia na hora)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (q === filters.q) return;
    const t = setTimeout(() => go({ q }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useMemo(() => radarQuery({ ...filters, page: 1 }, { partner: !staff }), [filters, staff]);
  const extras = extraFilterCount(filters);

  function tabHref(tab: RadarTab) {
    const f2: RadarFilters = { ...filters, tab, page: 1 };
    const decided = DECIDED_TABS.includes(tab);
    if (decided !== DECIDED_TABS.includes(filters.tab)) {
      f2.situacao = decided ? "todos" : "aberto";
      f2.rel = decided ? 0 : 50;
    }
    return url(f2);
  }

  async function loadMore() {
    setMore(true);
    const r = await radarMoreAction(query, page + 1);
    setMore(false);
    if ("error" in r) return void toast.error(r.error);
    setRows((l) => [...l, ...r.rows.filter((x) => !l.some((y) => y.id === x.id))]);
    setHasMore(r.hasMore);
    setPage((p) => p + 1);
  }

  /** muda a triagem na tela sem recarregar: a linha sai da aba se não pertence mais a ela */
  function moved(id: string, newTriage: string) {
    const cur = rows.find((r) => r.id === id);
    if (!cur) return;
    const from = tabOfTriage(cur.triage);
    const to = tabOfTriage(newTriage);
    setCounts((c) => ({ ...c, ...(from ? { [from]: Math.max(0, c[from] - 1) } : {}), ...(to ? { [to]: c[to] + 1 } : {}) }));
    setRows((l) => (filters.tab === "todos" ? l.map((r) => (r.id === id ? { ...r, triage: newTriage } : r)) : l.filter((r) => r.id !== id)));
  }

  async function interest(e: RadarCard) {
    setBusyId(e.id);
    const r = await interestAction(e.id);
    setBusyId(null);
    if ("error" in r) return void toast.error(r.error);
    if (staff) {
      moved(e.id, "interessante");
      toast.success("Marcado como interessante", { description: "Quando decidir, toque em Vou participar.", action: { label: "Vou participar", onClick: () => router.push(`/editais/participar/${e.id}`) } });
    } else toast.success("Interesse registrado", { description: "A equipe foi avisada." });
  }

  async function restore(e: RadarCard) {
    setBusyId(e.id);
    const r = await restoreAction(e.id);
    setBusyId(null);
    if ("error" in r) return void toast.error(r.error);
    moved(e.id, "novo");
    toast.success("Voltou para Novos");
  }

  const hasFilters = !!(filters.q || filters.ufs.length || filters.tipos.length || filters.prazo || extras || (filters.rel !== 0 && filters.rel !== 50) );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* topo: busca + buscar oportunidades */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-64"
          onSubmit={(ev) => {
            ev.preventDefault();
            go({ q });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            aria-label="Buscar no Radar"
            placeholder="Buscar por objeto, órgão ou cidade"
            className="h-12 w-full rounded-full border bg-card pr-4 pl-10 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-11"
          />
        </form>
        {canScan && <ScanControl lastFinishedAt={lastFinishedAt} initialBusy={scanBusy} />}
      </div>

      {/* abas */}
      {staff && (
        <div role="tablist" aria-label="Situação dos editais" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {RADAR_TABS.map((t) => {
            const on = filters.tab === t.key;
            return (
              <Link
                key={t.key}
                role="tab"
                aria-selected={on}
                href={tabHref(t.key)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10",
                  on ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("rounded-full px-2 text-xs tabular-nums", on ? "bg-background/20" : "bg-background")}>{counts[t.key]}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* filtros enxutos */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <PillSelect label="UF" value={filters.ufs[0] ?? ""} onChange={(v) => go({ ufs: v ? [v] : [] })} options={[{ value: "", label: "Todas" }, ...(ufCounts.length ? ufCounts.map((u) => ({ value: u.uf, label: `${u.uf} (${u.n})` })) : UFS.map((u) => ({ value: u, label: u })))]} />
          <PillSelect label="Tipo" value={filters.tipos[0] ?? ""} onChange={(v) => go({ tipos: v ? [v as never] : [] })} options={[{ value: "", label: "Todos" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
          <PillSelect label="Prazo" value={String(filters.prazo)} onChange={(v) => go({ prazo: Number(v) })} options={PRAZO} />
          <PillSelect label="Relevância" value={String(filters.rel)} onChange={(v) => go({ rel: Number(v) })} options={relOptions(DECIDED_TABS.includes(filters.tab) || !staff)} />
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
            className={cn("inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9", extras ? "border-brand bg-brand-soft" : "bg-card hover:bg-muted")}
          >
            <SlidersHorizontal className="size-4" /> Mais filtros{extras ? ` (${extras})` : ""}
          </button>
        </div>

        {showMore && (
          <MoreFilters
            key={query}
            filters={filters}
            owners={owners}
            staff={staff}
            onApply={(patch) => go(patch)}
            onClear={() => go({ esfera: "", city: "", vmin: null, vmax: null, owner: "", mod: "", situacao: DECIDED_TABS.includes(filters.tab) ? "todos" : "aberto" })}
          />
        )}
      </div>

      {/* contagem + ordenação + menu */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {navPending ? "Atualizando…" : `${initial.total} ${initial.total === 1 ? "edital" : "editais"}`}
        </p>
        <div className="flex items-center gap-2">
          <PillSelect label="Ordenar" value={filters.sort} onChange={(v) => go({ sort: v as never })} options={SORT} />
          {staff && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full" aria-label="Mais opções">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {canEdit && (
                  <DropdownMenuItem
                    onClick={() => {
                      setSelecting((s) => !s);
                      setSelected([]);
                    }}
                  >
                    <CheckSquare /> {selecting ? "Sair da seleção" : "Selecionar vários"}
                  </DropdownMenuItem>
                )}
                {canExport && (
                  <DropdownMenuItem asChild>
                    <a href={`/editais/exportar${query ? `?${query}` : ""}`} download>
                      <Download /> Exportar lista (CSV)
                    </a>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* lista */}
      <div className={cn("grid gap-3 transition-opacity lg:grid-cols-2 2xl:grid-cols-3", navPending && "pointer-events-none opacity-50")} aria-busy={navPending}>
        {rows.map((e) => (
          <EditalCard
            key={e.id}
            e={e}
            mode={mode}
            canEdit={canEdit}
            busy={busyId === e.id}
            selecting={selecting}
            selected={selected.includes(e.id)}
            onSelect={(id) => setSelected((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))}
            handlers={{
              onInterest: interest,
              onDiscard: (x) => setDiscard(x),
              onShare: (x) => setShare({ ids: [x.id], hasDossie: !!x.dossie }),
              onRestore: restore,
            }}
          />
        ))}
      </div>

      {rows.length === 0 && (
        <Empty
          icon={hasFilters || filters.tab !== "novos" ? SearchX : Inbox}
          title={!staff ? "Nada foi compartilhado com você ainda" : hasFilters ? "Nada com esses filtros" : emptyTitle(filters.tab)}
          action={
            hasFilters ? (
              <Button variant="outline" onClick={() => startNav(() => router.replace(url({ tab: filters.tab, page: 1, sort: filters.sort }), { scroll: false }))}>
                <X /> Limpar filtros
              </Button>
            ) : null
          }
        >
          {!staff ? "Quando a equipe compartilhar um edital, ele aparece aqui e você recebe um aviso." : hasFilters ? "Tente afrouxar um filtro ou limpar a busca." : emptyText(filters.tab, canScan)}
        </Empty>
      )}

      {hasMore && (
        <div className="grid place-items-center pt-1">
          <Button variant="outline" size="lg" className="min-h-12 rounded-full px-8" onClick={loadMore} disabled={more}>
            {more ? <Loader2 className="animate-spin" /> : null} Carregar mais
          </Button>
        </div>
      )}

      {/* barra de seleção em lote */}
      {selecting && (
        <div className="ed-safe-bottom fixed inset-x-0 bottom-16 z-30 border-t bg-card px-4 py-3 shadow-lg md:bottom-0 md:left-[84px]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-sm font-medium">{selected.length} selecionado{selected.length === 1 ? "" : "s"}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelecting(false)}>
                Cancelar
              </Button>
              <Button disabled={!selected.length} onClick={() => setShare({ ids: selected, hasDossie: false })}>
                <Share2 /> Compartilhar
              </Button>
            </div>
          </div>
        </div>
      )}

      {discard && (
        <DiscardDialog
          editalId={discard.id}
          open
          onOpenChange={(o) => !o && setDiscard(null)}
          onDone={() => {
            moved(discard.id, "descartado");
            setDiscard(null);
          }}
        />
      )}
      {share && (
        <ShareDialog
          editalIds={share.ids}
          partners={partners}
          hasDossie={share.hasDossie}
          open
          onOpenChange={(o) => !o && setShare(null)}
          onDone={() => {
            setSelecting(false);
            setSelected([]);
            setShare(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function emptyTitle(tab: RadarTab) {
  return { novos: "Nenhum edital novo", interessantes: "Nada marcado como interessante", proposta: "Nenhuma proposta em andamento", descartados: "Nenhum descartado", todos: "O Radar está vazio" }[tab];
}
function emptyText(tab: RadarTab, canScan: boolean) {
  return {
    novos: canScan ? "Toque em Buscar oportunidades para procurar editais de restauro no PNCP. A busca também roda sozinha todos os dias." : "A busca roda sozinha todos os dias. Volte mais tarde.",
    interessantes: "Em Novos, toque em Tenho interesse nos editais que valem uma olhada.",
    proposta: "Quando você tocar em Vou participar, a proposta aparece aqui.",
    descartados: "Os editais descartados ficam aqui, com o motivo, caso mude de ideia.",
    todos: canScan ? "Toque em Buscar oportunidades para começar." : "Ainda não há editais coletados.",
  }[tab];
}

function MoreFilters({ filters, owners, staff, onApply, onClear }: { filters: RadarFilters; owners: { id: string; name: string }[]; staff: boolean; onApply: (p: Partial<RadarFilters>) => void; onClear: () => void }) {
  const [esfera, setEsfera] = useState(filters.esfera);
  const [city, setCity] = useState(filters.city);
  const [vmin, setVmin] = useState(filters.vmin === null ? "" : String(filters.vmin));
  const [vmax, setVmax] = useState(filters.vmax === null ? "" : String(filters.vmax));
  const [owner, setOwner] = useState(filters.owner);
  const [mod, setMod] = useState(filters.mod);
  const [situacao, setSituacao] = useState<string>(filters.situacao);
  const num = (s: string) => (s.trim() && Number.isFinite(Number(s.replace(",", "."))) ? Number(s.replace(",", ".")) : null);
  const input = "h-11 w-full rounded-xl border bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-10 md:text-sm";
  return (
    <form
      className="ed-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ esfera, city, vmin: num(vmin), vmax: num(vmax), owner, mod, situacao: situacao as never });
      }}
    >
      <label className="grid gap-1 text-[13px] font-medium">
        Esfera
        <select value={esfera} onChange={(e) => setEsfera(e.target.value)} className={input}>
          <option value="">Todas</option>
          {ESFERAS.map((x) => (
            <option key={x} value={x}>
              {ESFERA_LABEL[x]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[13px] font-medium">
        Município
        <input value={city} onChange={(e) => setCity(e.target.value)} className={input} placeholder="Ex.: Itu" />
      </label>
      <label className="grid gap-1 text-[13px] font-medium">
        Modalidade
        <input value={mod} onChange={(e) => setMod(e.target.value)} className={input} placeholder="Ex.: Concorrência" />
      </label>
      <label className="grid gap-1 text-[13px] font-medium">
        Valor de (R$)
        <input value={vmin} onChange={(e) => setVmin(e.target.value)} inputMode="decimal" className={input} placeholder="0" />
      </label>
      <label className="grid gap-1 text-[13px] font-medium">
        Valor até (R$)
        <input value={vmax} onChange={(e) => setVmax(e.target.value)} inputMode="decimal" className={input} placeholder="Sem limite" />
      </label>
      <label className="grid gap-1 text-[13px] font-medium">
        Situação no portal
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={input}>
          <option value="aberto">Abertos</option>
          <option value="encerrado">Encerrados</option>
          <option value="suspenso">Suspensos</option>
          <option value="todos">Todos</option>
        </select>
      </label>
      {staff && (
        <label className="grid gap-1 text-[13px] font-medium">
          Responsável
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
            <option value="">Qualquer</option>
            <option value="me">Eu</option>
            <option value="sem">Sem responsável</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" className="min-h-11">
          Aplicar
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClear}>
          Limpar
        </Button>
      </div>
    </form>
  );
}
