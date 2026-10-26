"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Landmark, Loader2, Pencil, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetCloseBtn } from "@/components/touch-close";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { EmptyState } from "@/components/page-header";
import { Field, SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { centsToInput, moneyShort } from "@/lib/format";
import { searchPortfolio, suggestAtestados, type PortfolioLite } from "@/lib/propostas/portfolio";
import { PORTFOLIO_KINDS, PORTFOLIO_KIND_LABEL, SUGGESTED_TAGS, TOMBAMENTO, TOMBAMENTO_LABEL } from "@/lib/propostas/types";
import { deletePortfolioAction, savePortfolioAction } from "../portfolio-actions";

type Link = { name: string; url: string };
type Item = PortfolioLite & { links: Link[] };
type Form = { id: string; title: string; client: string; year: string; value: string; kind: string; tags: string[]; tombamento: string; responsible: string; description: string; links: Link[] };
const EMPTY: Form = { id: "", title: "", client: "", year: "", value: "", kind: "execucao", tags: [], tombamento: "nenhum", responsible: "", description: "", links: [] };

export function PortfolioClient({ items, canEdit, canManage }: { items: Item[]; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [sim, setSim] = useState("");
  const [showSim, setShowSim] = useState(false);

  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const shown = useMemo(() => searchPortfolio(items, q, tag), [items, q, tag]) as Item[];
  const simResult = useMemo(() => (sim.trim().length > 10 ? suggestAtestados({ title: "", object: sim, kind: /projeto|laudo/i.test(sim) && !/execu[cç][aã]o|obra/i.test(sim) ? "projeto" : "execucao" }, items, { limit: 6 }) : []), [sim, items]);

  const chip = (active: boolean) => cn("inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[13px] whitespace-nowrap max-md:min-h-11", active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30");
  const addTag = (t: string) => {
    const v = t.trim().toLowerCase();
    if (!v || !form || form.tags.includes(v)) return;
    setForm({ ...form, tags: [...form.tags, v].slice(0, 20) });
    setTagInput("");
  };
  const save = () =>
    start(async () => {
      if (!form) return;
      const r = await savePortfolioAction({ ...form, id: form.id || undefined });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Salvo no banco de atestados");
        setForm(null);
        router.refresh();
      }
    });

  return (
    <div className="grid gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[13px] text-muted-foreground">
          Obras e projetos que o estúdio já executou, com texto pronto para colar na proposta técnica. Com as <strong className="font-medium text-foreground">etiquetas</strong> certas, o CRM sugere os atestados mais aderentes a cada edital.
        </p>
        <div className="flex flex-wrap gap-2">
          {items.length > 0 && (
            <Button type="button" size="sm" variant="outline" className="max-md:h-11" onClick={() => setShowSim((v) => !v)} aria-expanded={showSim}>
              <Sparkles /> Testar com um edital
            </Button>
          )}
          {canEdit && (
            <Button type="button" size="sm" data-tour="portfolio-novo" className="max-md:h-11" onClick={() => setForm(EMPTY)}>
              <Plus /> Nova obra ou projeto
            </Button>
          )}
        </div>
      </div>

      {showSim && (
        <section className="grid gap-2 rounded-xl border bg-card p-4">
          <Field label="Cole aqui o objeto de um edital" hint="Mostra quais itens do portfólio o CRM sugeriria, do mais para o menos aderente.">
            <Textarea value={sim} onChange={(e) => setSim(e.target.value)} rows={3} className="text-base md:text-sm" placeholder="Ex.: Contratação de empresa para restauração do forro e dos retábulos da Igreja Matriz…" />
          </Field>
          {sim.trim().length > 10 &&
            (simResult.length ? (
              <ol className="grid gap-1 text-[13px]">
                {simResult.map((s, n) => (
                  <li key={s.item.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="num tabular-nums text-muted-foreground">{n + 1}.</span>
                    <span className="font-medium">{s.item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.score} pts — {s.why.join(", ")}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-muted-foreground">Nenhum item combina. Revise as etiquetas dos itens.</p>
            ))}
        </section>
      )}

      {items.length > 0 && (
        <div className="grid gap-2">
          <div className="relative max-w-md">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por obra, cliente, técnica…" aria-label="Buscar no portfólio" className="h-9 pl-8 max-md:h-11" />
          </div>
          {allTags.length > 0 && (
            <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
              <button type="button" className={chip(!tag)} onClick={() => setTag("")}>
                Todas
              </button>
              {allTags.map((t) => (
                <button key={t} type="button" className={chip(tag === t)} onClick={() => setTag(tag === t ? "" : t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={Landmark} title="Nenhuma obra cadastrada">
          Comece pelas <strong>3 obras mais fortes</strong> do estúdio: título, órgão ou cliente, ano, a técnica (etiquetas) e um parágrafo pronto para colar na proposta.
        </EmptyState>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-[13px] text-muted-foreground">Nada com essa busca.</p>
      ) : (
        <ul data-tour="portfolio-list" className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => (
            <li key={i.id} className="grid content-start gap-2 rounded-xl border bg-card px-4 py-3">
              <div>
                <p className="label">{[PORTFOLIO_KIND_LABEL[i.kind], i.year].filter(Boolean).join(" · ")}</p>
                <p className="text-[14px] leading-snug font-medium break-words">{i.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[i.client, i.valueCents ? moneyShort(i.valueCents) : null, i.tombamento && i.tombamento !== "nenhum" ? TOMBAMENTO_LABEL[i.tombamento] : null, i.responsible ? `Resp.: ${i.responsible}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {i.description && <p className="line-clamp-3 text-[13px] text-muted-foreground">{i.description}</p>}
              <div className="flex flex-wrap gap-1">
                {i.tags.map((t) => (
                  <span key={t} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {i.links.map((l) => (
                  <Button key={l.url} asChild size="sm" variant="outline" className="max-md:h-11">
                    <a href={l.url} target="_blank" rel="noreferrer">
                      <ExternalLink /> {l.name}
                    </a>
                  </Button>
                ))}
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="max-md:h-11"
                    onClick={() => setForm({ id: i.id, title: i.title, client: i.client ?? "", year: i.year ? String(i.year) : "", value: i.valueCents ? centsToInput(i.valueCents) : "", kind: i.kind, tags: i.tags, tombamento: i.tombamento ?? "nenhum", responsible: i.responsible ?? "", description: i.description ?? "", links: i.links })}
                  >
                    <Pencil /> Editar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <SheetContent className="flex flex-col gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-lg" showCloseButton={false}>
          <SheetCloseBtn />
          <SheetHeader>
            <SheetTitle>{form?.id ? "Editar obra ou projeto" : "Nova obra ou projeto"}</SheetTitle>
            <SheetDescription>Quanto mais claro o texto e as etiquetas, melhor a sugestão de atestados para os editais.</SheetDescription>
          </SheetHeader>
          {form && (
            <div className="grid flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-4 pb-6">
              <Field label="Título">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Restauração do forro da Igreja Matriz" maxLength={200} className="max-md:h-11" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cliente / órgão">
                  <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} maxLength={160} className="max-md:h-11" />
                </Field>
                <Field label="Ano">
                  <Input inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="2024" className="max-md:h-11" />
                </Field>
                <Field label="Valor (R$)">
                  <Input inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0,00" className="max-md:h-11" />
                </Field>
                <Field label="Tipo">
                  <SimpleSelect value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })} options={PORTFOLIO_KINDS.map((k) => ({ value: k.key, label: k.label }))} />
                </Field>
                <Field label="Tombamento">
                  <SimpleSelect value={form.tombamento} onValueChange={(v) => setForm({ ...form, tombamento: v })} options={TOMBAMENTO.map((k) => ({ value: k.key, label: k.label }))} />
                </Field>
                <Field label="Responsável técnico">
                  <Input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} maxLength={160} className="max-md:h-11" />
                </Field>
              </div>
              <Field label="Técnicas e bens (etiquetas)" hint="Ex.: restauração de forro, pintura mural, douramento, consolidação estrutural.">
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map((t) => (
                    <button key={t} type="button" onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground max-md:min-h-11" aria-label={`Remover etiqueta ${t}`}>
                      {t} ×
                    </button>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTag(tagInput);
                  }}
                >
                  <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Nova etiqueta" maxLength={40} className="max-md:h-11" />
                  <Button type="submit" size="sm" variant="outline" className="max-md:h-11">
                    Adicionar
                  </Button>
                </form>
                <div className="flex flex-wrap gap-1">
                  {SUGGESTED_TAGS.filter((t) => !form.tags.includes(t)).slice(0, 10).map((t) => (
                    <button key={t} type="button" onClick={() => addTag(t)} className="rounded-md border px-1.5 py-1 text-xs text-muted-foreground hover:border-foreground/30 max-md:min-h-11">
                      + {t}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Descrição pronta para a proposta" hint="Um parágrafo que possa ser colado como está: o que foi feito, área, técnicas, resultado.">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={6} maxLength={3000} className="text-base md:text-sm" />
              </Field>
              <Field label="Links (fotos, atestado, CAT)" hint="Links do Drive ou do site. O CRM não guarda arquivos.">
                <div className="grid gap-2">
                  {form.links.map((l, n) => (
                    <div key={n} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                      <Input value={l.name} onChange={(e) => setForm({ ...form, links: form.links.map((x, k) => (k === n ? { ...x, name: e.target.value } : x)) })} placeholder="Nome" maxLength={80} className="max-md:h-11" aria-label="Nome do link" />
                      <Input inputMode="url" value={l.url} onChange={(e) => setForm({ ...form, links: form.links.map((x, k) => (k === n ? { ...x, url: e.target.value } : x)) })} placeholder="https://" className="max-md:h-11" aria-label="Endereço do link" />
                      <Button type="button" size="sm" variant="ghost" className="max-md:h-11" onClick={() => setForm({ ...form, links: form.links.filter((_, k) => k !== n) })} aria-label="Remover link">
                        ×
                      </Button>
                    </div>
                  ))}
                  {form.links.length < 6 && (
                    <Button type="button" size="sm" variant="outline" className="w-fit max-md:h-11" onClick={() => setForm({ ...form, links: [...form.links, { name: "", url: "" }] })}>
                      <Plus /> Adicionar link
                    </Button>
                  )}
                </div>
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" disabled={pending} className="max-md:h-11" onClick={save}>
                  {pending && <Loader2 className="animate-spin" />} Salvar
                </Button>
                {form.id && canManage && (
                  <ConfirmButton
                    title="Remover do portfólio?"
                    description="O item deixa de ser sugerido nos editais. Propostas já escritas não mudam."
                    label="Remover"
                    action={async () => {
                      const r = await deletePortfolioAction(form.id);
                      if ("error" in r) toast.error(r.error);
                      else {
                        toast.success("Removido");
                        setForm(null);
                        router.refresh();
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
