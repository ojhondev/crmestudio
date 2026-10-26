"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CircleAlert, CircleCheck, CircleHelp, Clock, ExternalLink, FileText, ImageIcon, Landmark, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moneyShort } from "@/lib/format";
import { validityText, type Validity } from "@/lib/propostas/cofre";
import { COFRE_LABEL, COFRE_SHORT, COFRE_TYPES, PORTFOLIO_KIND_LABEL, TOMBAMENTO_LABEL } from "@/lib/propostas/types";
import { deleteCofreDocAction } from "@/app/(app)/editais-avancado/cofre-actions";
import { deletePortfolioAction } from "@/app/(app)/editais-avancado/portfolio-actions";
import { Button } from "@/components/ui/button";
import { PillSelect } from "./pill-select";
import { Empty, Pill, type Tone } from "./primitives";

export type CofreItem = { id: string; type: string; title: string; number: string | null; issuer: string | null; validUntil: string | null; url: string | null; validity: { status: Validity; daysLeft: number | null } };
export type ObraItem = { id: string; title: string; client: string | null; year: number | null; valueCents: number | null; kind: string; tags: string[]; tombamento: string | null; description: string | null; links: { name: string; url: string }[] };

const SEMAFORO: Record<Validity, { tone: Tone; icon: React.ElementType; label: string }> = {
  valido: { tone: "good", icon: CircleCheck, label: "Válido" },
  vence_30: { tone: "warn", icon: Clock, label: "Vence em breve" },
  vencido: { tone: "bad", icon: CircleAlert, label: "Vencido" },
  sem_validade: { tone: "mute", icon: CircleHelp, label: "Sem validade" },
};

const isImg = (u: string) => /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(u);

export function CofreView({ items, canEdit, canManage }: { items: CofreItem[]; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [val, setVal] = useState("");
  const [pending, start] = useTransition();

  const list = useMemo(
    () =>
      items
        .filter((i) => (!tipo || i.type === tipo) && (!val || (val === "atencao" ? i.validity.status === "vencido" || i.validity.status === "vence_30" : i.validity.status === val)) && (!q || `${i.title} ${i.number ?? ""} ${i.issuer ?? ""}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => (a.validity.daysLeft ?? 99999) - (b.validity.daysLeft ?? 99999)),
    [items, q, tipo, val],
  );
  const alerts = items.filter((i) => i.validity.status === "vencido" || i.validity.status === "vence_30").length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-label="Buscar no cofre" placeholder="Buscar documento" className="h-12 w-full rounded-full border bg-card pr-4 pl-10 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-11" />
        </div>
        {canEdit && (
          <Button asChild className="min-h-12 rounded-full px-5 md:min-h-11">
            <Link href="/editais/acervo/documento/novo">
              <Plus /> Novo documento
            </Link>
          </Button>
        )}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <PillSelect label="Validade" value={val} onChange={setVal} options={[{ value: "", label: "Todas" }, { value: "atencao", label: `Pedem atenção (${alerts})` }, { value: "vencido", label: "Vencidos" }, { value: "vence_30", label: "Vencem em 30 dias" }, { value: "valido", label: "Válidos" }, { value: "sem_validade", label: "Sem validade" }]} />
        <PillSelect label="Tipo" value={tipo} onChange={setTipo} options={[{ value: "", label: "Todos" }, ...COFRE_TYPES.map((t) => ({ value: t.key, label: COFRE_SHORT[t.key] ?? t.label }))]} />
      </div>

      {items.length === 0 ? (
        <Empty icon={Archive} title="O cofre está vazio" action={canEdit ? <Button asChild className="h-12 rounded-full px-6"><Link href="/editais/acervo/documento/novo"><Plus /> Guardar o primeiro documento</Link></Button> : undefined}>
          Certidões, contrato social, balanço e declarações que se repetem em todo edital. Com a validade, o app avisa antes de vencer e já confere na habilitação.
        </Empty>
      ) : list.length === 0 ? (
        <Empty icon={Search} title="Nada com esses filtros" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((i) => {
            const sm = SEMAFORO[i.validity.status];
            return (
              <li key={i.id} className={cn("ed-card grid gap-2.5 border-l-4 p-4", i.validity.status === "vencido" ? "border-l-red-500" : i.validity.status === "vence_30" ? "border-l-amber-500" : i.validity.status === "valido" ? "border-l-emerald-500" : "border-l-border")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] text-muted-foreground">{COFRE_LABEL[i.type] ?? "Documento"}</p>
                    <p className="text-[17px] leading-snug font-medium">{i.title}</p>
                  </div>
                  <Pill tone={sm.tone} className="shrink-0">
                    <sm.icon aria-hidden /> {sm.label}
                  </Pill>
                </div>
                <p className="text-[14px] text-muted-foreground">
                  {validityText(i.validity)}
                  {i.validUntil ? ` · até ${i.validUntil.split("-").reverse().join("/")}` : ""}
                  {i.number ? ` · nº ${i.number}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  {i.url && (
                    <Button asChild variant="outline" size="sm" className="min-h-11 rounded-full md:min-h-9">
                      <a href={i.url} target="_blank" rel="noreferrer noopener">
                        <FileText /> Abrir <ExternalLink />
                      </a>
                    </Button>
                  )}
                  {canEdit && (
                    <Button asChild variant="outline" size="sm" className="min-h-11 rounded-full md:min-h-9">
                      <Link href={`/editais/acervo/documento/novo?id=${i.id}`}>
                        <Pencil /> {i.validity.status === "vencido" || i.validity.status === "vence_30" ? "Renovar" : "Editar"}
                      </Link>
                    </Button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      aria-label={`Excluir ${i.title}`}
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Remover “${i.title}” do cofre?`)) return;
                        start(async () => {
                          const r = await deleteCofreDocAction(i.id);
                          if ("error" in r) return void toast.error(r.error);
                          toast.success("Removido do cofre");
                          router.refresh();
                        });
                      }}
                      className="ml-auto grid size-11 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ObrasView({ items, canEdit, canManage }: { items: ObraItem[]; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const list = items.filter((i) => !q || `${i.title} ${i.client ?? ""} ${i.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-label="Buscar obras" placeholder="Buscar obra, cliente ou técnica" className="h-12 w-full rounded-full border bg-card pr-4 pl-10 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-11" />
        </div>
        {canEdit && (
          <Button asChild className="min-h-12 rounded-full px-5 md:min-h-11">
            <Link href="/editais/acervo/obra/nova">
              <Plus /> Nova obra
            </Link>
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Empty icon={Landmark} title="Nenhuma obra cadastrada" action={canEdit ? <Button asChild className="h-12 rounded-full px-6"><Link href="/editais/acervo/obra/nova"><Plus /> Cadastrar a primeira obra</Link></Button> : undefined}>
          As obras e projetos que o estúdio já fez viram atestados sugeridos nas propostas — o app escolhe os que combinam com cada edital.
        </Empty>
      ) : list.length === 0 ? (
        <Empty icon={Search} title="Nada com essa busca" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => {
            const cover = o.links.find((l) => isImg(l.url))?.url;
            return (
              <li key={o.id} className="ed-card grid overflow-hidden">
                <div className="relative grid aspect-[16/9] place-items-center bg-muted text-muted-foreground">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-8 opacity-50" aria-hidden />
                  )}
                  {o.year && <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-semibold">{o.year}</span>}
                </div>
                <div className="grid gap-2.5 p-4">
                  <div>
                    <p className="text-[17px] leading-snug font-medium">{o.title}</p>
                    <p className="text-[13px] text-muted-foreground">{[o.client, o.valueCents ? moneyShort(o.valueCents) : null, PORTFOLIO_KIND_LABEL[o.kind]].filter(Boolean).join(" · ")}</p>
                  </div>
                  {(o.tags.length > 0 || (o.tombamento && o.tombamento !== "nenhum")) && (
                    <div className="flex flex-wrap gap-1.5">
                      {o.tombamento && o.tombamento !== "nenhum" && <Pill tone="brand">{TOMBAMENTO_LABEL[o.tombamento]}</Pill>}
                      {o.tags.slice(0, 4).map((t) => (
                        <Pill key={t}>{t}</Pill>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    {o.links.slice(0, 2).map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand underline underline-offset-2">
                        {l.name || "Link"} <ExternalLink className="size-3.5" />
                      </a>
                    ))}
                    {canEdit && (
                      <Button asChild variant="outline" size="sm" className="ml-auto min-h-11 rounded-full md:min-h-9">
                        <Link href={`/editais/acervo/obra/nova?id=${o.id}`}>
                          <Pencil /> Editar
                        </Link>
                      </Button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        aria-label={`Excluir ${o.title}`}
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`Remover “${o.title}” do acervo?`)) return;
                          start(async () => {
                            const r = await deletePortfolioAction(o.id);
                            if ("error" in r) return void toast.error(r.error);
                            toast.success("Removida do acervo");
                            router.refresh();
                          });
                        }}
                        className="grid size-11 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
