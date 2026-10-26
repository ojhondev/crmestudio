"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Circle, CircleDot, ExternalLink, FileText, Loader2, Minus, Plus, Sheet as SheetIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { COFRE_SHORT, STEPS, type StepKey } from "@/lib/propostas/types";
import { MATRIX_LABEL, type MatrixSituation } from "@/lib/propostas/cofre";
import type { DossieView as View } from "@/lib/editais-app/redact";
import type { SuggestionDTO } from "@/lib/propostas/suggest";
import { addItemAction, assignItemAction, generateDocsFlowAction, removeItemAction, stepAssigneeAction, stepStatusAction, toggleItemAction } from "@/lib/editais-app/actions/propostas";
import { Button } from "@/components/ui/button";
import { Fold, Pill, type Tone } from "./primitives";

export type Person = { id: string; name: string; partner: boolean };

const dm = (d: string | null) => (d ? d.split("-").reverse().slice(0, 2).join("/") : null);
const STATUS_LABEL: Record<string, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", concluida: "Concluída", nao_se_aplica: "Não se aplica" };
const MATRIX_TONE: Record<MatrixSituation, Tone> = { ok: "good", ok_manual: "good", na: "mute", vence_antes: "warn", vencido: "bad", faltando: "bad" };

/** Onde cada etapa leva: um assistente (ou nada: marcar como concluída aqui mesmo). */
export function stepFlow(key: string, editalId: string): { href: string; cta: string } | null {
  const base = `/editais/propostas/${editalId}`;
  switch (key) {
    case "habilitacao":
      return { href: `${base}/habilitacao`, cta: "Conferir a habilitação" };
    case "tecnica":
      return { href: `${base}/tecnica`, cta: "Montar a proposta técnica" };
    case "preco":
      return { href: `${base}/preco`, cta: "Montar a proposta de preço" };
    case "revisao":
    case "envio":
      return { href: `${base}/envio`, cta: "Revisar e registrar o envio" };
    case "resultado":
      return { href: `${base}/resultado`, cta: "Registrar o resultado" };
    default:
      return null;
  }
}

export function DossieBlocks({
  v,
  mode,
  canEdit,
  canContribute,
  meId,
  people,
  suggestions,
}: {
  v: View;
  mode: "staff" | "partner";
  canEdit: boolean;
  canContribute: boolean;
  meId: string;
  people: Person[];
  suggestions: SuggestionDTO[];
}) {
  const staff = mode === "staff";
  const editalId = v.dossie.editalId;
  const open = v.dossie.status === "andamento";
  const current = v.progress.currentStep;
  const curStep = v.steps.find((s) => s.key === current);
  const flow = current ? stepFlow(current, editalId) : null;
  const curDef = current ? STEPS.find((s) => s.key === current) : null;
  const router = useRouter();
  const [pending, start] = useTransition();

  function setStatus(key: string, status: string) {
    start(async () => {
      const r = await stepStatusAction(editalId, key, status);
      if ("error" in r) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {/* próximo passo */}
      {open && curDef && staff && canEdit && (
        <section aria-labelledby="prox" className="ed-card grid gap-3 border-brand/30 bg-brand-soft/40 p-5">
          <p className="label text-brand">Próximo passo</p>
          <h2 id="prox" className="ed-title text-2xl">
            {curDef.label}
          </h2>
          <p className="text-[15px] text-muted-foreground">
            {current === "habilitacao" && v.matrixSummary.total > 0 ? `${v.matrixSummary.ok} de ${v.matrixSummary.total} exigências em dia${v.matrixSummary.problems ? ` · ${v.matrixSummary.problems} precisam de atenção` : ""}.` : curDef.hint}
          </p>
          <div className="flex flex-wrap gap-3">
            {flow ? (
              <Button asChild className="h-14 w-full rounded-2xl text-base sm:w-auto sm:min-w-72">
                <Link href={flow.href}>
                  {flow.cta} <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button className="h-14 w-full rounded-2xl text-base sm:w-auto sm:min-w-72" disabled={pending} onClick={() => setStatus(current as string, "concluida")}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />} Marcar como concluída
              </Button>
            )}
            {flow && current !== "resultado" && (
              <Button variant="outline" className="h-14 rounded-2xl px-6 text-base" disabled={pending} onClick={() => setStatus(current as string, "nao_se_aplica")}>
                Não se aplica
              </Button>
            )}
          </div>
        </section>
      )}

      {/* linha do tempo */}
      <section aria-labelledby="linha" className="grid gap-3">
        <h2 id="linha" className="ed-title text-xl">
          Etapas
        </h2>
        <ol className="ed-card divide-y overflow-hidden">
          {v.steps.map((s, i) => {
            const def = STEPS[i];
            const done = s.status === "concluida";
            const na = s.status === "nao_se_aplica";
            const isCurrent = open && s.key === current;
            const f = stepFlow(s.key, editalId);
            const mine = !staff && s.assigneeId === meId && canContribute && s.key !== "envio" && s.key !== "resultado";
            return (
              <li key={s.key}>
                <details className="group" open={isCurrent && false}>
                  <summary className={cn("flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none select-none focus-visible:bg-muted sm:px-5 [&::-webkit-details-marker]:hidden", isCurrent && "bg-brand-soft/50")}>
                    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full border-2", done ? "border-brand bg-brand text-on-brand" : isCurrent ? "border-brand text-brand" : "border-border text-muted-foreground")}>
                      {done ? <Check className="size-4" strokeWidth={3} /> : na ? <Minus className="size-4" /> : isCurrent ? <CircleDot className="size-4" /> : <Circle className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] font-medium", (done || na) && "text-muted-foreground")}>{def?.label ?? s.key}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {STATUS_LABEL[s.status]}
                        {s.dueDay && !done && !na ? ` · até ${dm(s.dueDay)}` : ""}
                        {s.assigneeName ? ` · ${s.assigneeName.split(" ")[0]}` : ""}
                        {s.itemsTotal ? ` · ${s.itemsDone}/${s.itemsTotal}` : ""}
                      </span>
                    </span>
                    {s.overdue && <Pill tone="bad">Atrasada</Pill>}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                  </summary>
                  <div className="grid gap-3 border-t bg-muted/30 px-4 py-4 sm:px-5">
                    <p className="text-[14px] text-muted-foreground">{def?.hint}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {staff && canEdit && f && (
                        <Button asChild size="sm" className="min-h-11 rounded-full px-4 md:min-h-9">
                          <Link href={f.href}>
                            {f.cta} <ArrowRight />
                          </Link>
                        </Button>
                      )}
                      {((staff && canEdit) || mine) && (
                        <>
                          {!done && (
                            <Button size="sm" variant="outline" className="min-h-11 rounded-full md:min-h-9" disabled={pending} onClick={() => setStatus(s.key, "concluida")}>
                              <Check /> Concluir
                            </Button>
                          )}
                          {s.status === "a_fazer" && (
                            <Button size="sm" variant="outline" className="min-h-11 rounded-full md:min-h-9" disabled={pending} onClick={() => setStatus(s.key, "em_andamento")}>
                              Começar
                            </Button>
                          )}
                          {(done || na) && (
                            <Button size="sm" variant="outline" className="min-h-11 rounded-full md:min-h-9" disabled={pending} onClick={() => setStatus(s.key, "a_fazer")}>
                              Reabrir
                            </Button>
                          )}
                          {staff && !na && !done && (
                            <Button size="sm" variant="ghost" className="min-h-11 rounded-full md:min-h-9" disabled={pending} onClick={() => setStatus(s.key, "nao_se_aplica")}>
                              Não se aplica
                            </Button>
                          )}
                        </>
                      )}
                      {staff && canEdit && (
                        <label className="ml-auto flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Responsável</span>
                          <select
                            defaultValue={s.assigneeId ?? ""}
                            onChange={(e) =>
                              start(async () => {
                                const r = await stepAssigneeAction(editalId, s.key, e.target.value || null);
                                if ("error" in r) return void toast.error(r.error);
                                router.refresh();
                              })
                            }
                            className="h-11 rounded-xl border bg-card px-2 text-base md:h-9 md:text-sm"
                          >
                            <option value="">Ninguém</option>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {p.partner ? " (parceiro)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
        {curStep?.overdue && <p className="text-sm text-muted-foreground">A etapa atual passou do prazo planejado. Os prazos podem ser recalculados em “Dados da proposta”.</p>}
      </section>

      {/* blocos recolhíveis */}
      <div className="grid gap-3">
        <Fold title="Checklist" hint="Tudo o que precisa ser feito, por etapa" count={`${v.progress.doneItems}/${v.progress.totalItems}`} defaultOpen={!staff}>
          <Checklist v={v} staff={staff} canEdit={canEdit} canContribute={canContribute} meId={meId} people={people} />
        </Fold>

        {staff && (
          <Fold title="Habilitação" hint="Documentos exigidos × o que há no cofre" count={v.matrixSummary.total ? `${v.matrixSummary.ok}/${v.matrixSummary.total} em dia` : undefined}>
            {v.matrix.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem exigências listadas.</p>
            ) : (
              <ul className="divide-y">
                {v.matrix.map((m) => (
                  <li key={m.req.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                    <span className="min-w-0 flex-1 text-[15px]">
                      {m.req.title}
                      {m.doc && <span className="block truncate text-[13px] text-muted-foreground">{m.doc.title}</span>}
                      {!m.doc && m.req.cofreType && <span className="block text-[13px] text-muted-foreground">{COFRE_SHORT[m.req.cofreType] ?? ""}</span>}
                    </span>
                    <Pill tone={MATRIX_TONE[m.situation]}>{MATRIX_LABEL[m.situation]}</Pill>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && open && (
              <Button asChild variant="outline" className="mt-4 min-h-11 rounded-full">
                <Link href={`/editais/propostas/${editalId}/habilitacao`}>
                  Conferir a habilitação <ArrowRight />
                </Link>
              </Button>
            )}
          </Fold>
        )}

        {(staff || v.docs.length > 0 || v.cofre.length > 0) && (
          <Fold title="Documentos" hint={staff ? "Gerados nesta proposta" : "Compartilhados com você"} count={v.docs.length || undefined}>
            <Docs v={v} staff={staff} canEdit={canEdit} open={open} />
          </Fold>
        )}

        {(staff || v.sheet) && (
          <Fold title="Planilha de preços" hint={staff ? "Composição, BDI e cronograma" : "Compartilhada com você"}>
            {v.sheet ? (
              <div className="flex flex-wrap items-center gap-3">
                <SheetIcon className="size-5 text-brand" aria-hidden />
                <span className="text-[15px]">{v.sheet.name}</span>
                {staff && (
                  <Button asChild variant="outline" size="sm" className="ml-auto min-h-11 rounded-full md:min-h-9">
                    <Link href={`/planilhas/${v.sheet.id}`}>
                      Abrir a planilha <ExternalLink />
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">Ainda não há planilha.</p>
                {canEdit && open && (
                  <Button asChild variant="outline" className="min-h-11 w-fit rounded-full">
                    <Link href={`/editais/propostas/${editalId}/preco`}>
                      Montar a proposta de preço <ArrowRight />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </Fold>
        )}

        {staff && (
          <Fold title="Atestados sugeridos" hint="Obras do acervo que combinam com o objeto" count={suggestions.length || undefined}>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma obra do acervo combina com este objeto. <Link href="/editais/acervo/obra/nova" className="font-medium text-brand underline underline-offset-2">Cadastre uma obra</Link>.
              </p>
            ) : (
              <ul className="divide-y">
                {suggestions.slice(0, 6).map((s) => (
                  <li key={s.id} className="py-3">
                    <p className="text-[15px] font-medium">{s.title}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {[s.client, s.year].filter(Boolean).join(" · ")}
                      {s.why.length ? ` — ${s.why.slice(0, 3).join(", ")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && open && (
              <Button asChild variant="outline" className="mt-4 min-h-11 rounded-full">
                <Link href={`/editais/propostas/${editalId}/tecnica`}>
                  Montar a proposta técnica <ArrowRight />
                </Link>
              </Button>
            )}
          </Fold>
        )}
      </div>
    </div>
  );
}

function Docs({ v, staff, canEdit, open }: { v: View; staff: boolean; canEdit: boolean; open: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      {v.docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{staff ? "Nenhum documento gerado ainda." : "Nenhum documento compartilhado."}</p>
      ) : (
        <ul className="divide-y">
          {v.docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-[15px]">{d.title}</span>
              <Pill tone={d.status === "rascunho" ? "mute" : "good"}>{d.status === "rascunho" ? "Rascunho" : d.status === "enviado" ? "Enviado" : d.status === "aceito" ? "Aceito" : d.status}</Pill>
              {staff && (
                <Link href={`/documentos/${d.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand underline underline-offset-2">
                  Abrir <ExternalLink className="size-3.5" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {!staff && v.cofre.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Do cofre, liberados para você</p>
          <ul className="grid gap-2">
            {v.cofre.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-[15px]">
                <span className="min-w-0 flex-1">
                  {c.title}
                  {c.validUntil && <span className="block text-[13px] text-muted-foreground">Validade {c.validUntil.split("-").reverse().join("/")}</span>}
                </span>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand underline underline-offset-2">
                    Abrir <ExternalLink className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {staff && canEdit && open && (
        <Button
          variant="outline"
          className="min-h-11 w-fit rounded-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await generateDocsFlowAction(v.dossie.editalId);
              if ("error" in r) return void toast.error(r.error);
              toast.success(r.created ? `${r.created} documento(s) gerado(s)` : "Os documentos já estavam gerados");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Gerar documentos padrão
        </Button>
      )}
    </div>
  );
}

function Checklist({ v, staff, canEdit, canContribute, meId, people }: { v: View; staff: boolean; canEdit: boolean; canContribute: boolean; meId: string; people: Person[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [stepKey, setStepKey] = useState<StepKey>("habilitacao");
  const groups = STEPS.map((s) => ({ s, items: v.items.filter((i) => i.stepKey === s.key) })).filter((g) => g.items.length);

  function toggle(id: string, done: boolean) {
    setBusy(id);
    start(async () => {
      const r = await toggleItemAction(id, done);
      setBusy(null);
      if ("error" in r) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      {groups.length === 0 && <p className="text-sm text-muted-foreground">O checklist está vazio.</p>}
      {groups.map(({ s, items }) => (
        <div key={s.key}>
          <h3 className="mb-1 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{s.short}</h3>
          <ul className="divide-y">
            {items.map((i) => {
              const mine = i.assigneeId === meId;
              const can = (staff && canEdit) || (!staff && canContribute && mine);
              return (
                <li key={i.id} className="flex items-start gap-3 py-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={i.done}
                    aria-label={`${i.done ? "Reabrir" : "Concluir"}: ${i.title}`}
                    disabled={!can || (pending && busy === i.id)}
                    onClick={() => toggle(i.id, !i.done)}
                    className="grid size-11 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                  >
                    <span className={cn("grid size-6 place-items-center rounded-md border-2", i.done ? "border-brand bg-brand text-on-brand" : "border-input bg-background", !can && "opacity-50")}>{busy === i.id ? <Loader2 className="size-3.5 animate-spin" /> : i.done ? <Check className="size-4" strokeWidth={3} /> : null}</span>
                  </button>
                  <div className="min-w-0 flex-1 pt-2">
                    <p className={cn("text-[15px] leading-snug", i.done && "text-muted-foreground line-through")}>{i.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                      {i.dueDay && <span className={cn(i.overdue && "font-medium text-red-700 dark:text-red-400")}>{i.overdue ? "Atrasado · " : "Até "}{dm(i.dueDay)}</span>}
                      {staff && canEdit ? (
                        <select
                          aria-label={`Responsável por ${i.title}`}
                          defaultValue={i.assigneeId ?? ""}
                          onChange={(e) =>
                            start(async () => {
                              const r = await assignItemAction(i.id, e.target.value || null);
                              if ("error" in r) return void toast.error(r.error);
                              toast.success(e.target.value ? "Atribuído" : "Sem responsável");
                              router.refresh();
                            })
                          }
                          className="h-8 max-w-44 rounded-lg border bg-card px-1.5 text-[13px]"
                        >
                          <option value="">Sem responsável</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name.split(" ")[0]}
                              {p.partner ? " (parceiro)" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        i.assigneeName && <span>{mine ? "Você" : i.assigneeName.split(" ")[0]}</span>
                      )}
                    </p>
                  </div>
                  {staff && canEdit && (
                    <button
                      type="button"
                      aria-label={`Remover: ${i.title}`}
                      className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        start(async () => {
                          const r = await removeItemAction(i.id);
                          if ("error" in r) return void toast.error(r.error);
                          router.refresh();
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {staff && canEdit && (
        <form
          className="flex flex-wrap gap-2 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            start(async () => {
              const r = await addItemAction(v.dossie.editalId, stepKey, text);
              if ("error" in r) return void toast.error(r.error);
              setText("");
              router.refresh();
            });
          }}
        >
          <select aria-label="Etapa do novo item" value={stepKey} onChange={(e) => setStepKey(e.target.value as StepKey)} className="h-11 rounded-xl border bg-card px-2 text-base md:h-10 md:text-sm">
            {STEPS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.short}
              </option>
            ))}
          </select>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Novo item do checklist" aria-label="Novo item do checklist" maxLength={200} className="h-11 min-w-0 flex-1 basis-48 rounded-xl border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-10 md:text-sm" />
          <Button type="submit" disabled={pending || !text.trim()} className="min-h-11 rounded-xl md:min-h-10">
            <Plus /> Adicionar
          </Button>
        </form>
      )}
    </div>
  );
}
