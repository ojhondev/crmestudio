"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Briefcase, CalendarClock, ClipboardList, ExternalLink, Loader2, Rocket, Star, Search as SearchIcon, Send, Trophy, XCircle, Ban, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetCloseBtn } from "@/components/touch-close";
import { Field, SimpleSelect } from "@/components/form";
import { centsToInput, fmtDate, fmtDateTime, money } from "@/lib/format";
import { DISCARD_REASONS, ESFERA_LABEL, KIND_LABEL, SITUATION_LABEL, TRIAGE_LABEL, type EditalKind, type EditalSituation, type EditalTriage, type Esfera } from "@/lib/editais/types";
import type { EditalDTO } from "@/lib/editais/queries";
import { Deadline, EsferaChip, KindChip, ScoreBadge, TriagePill } from "./bits";
import type { PropostaBrief } from "@/lib/propostas/server";
import { Countdown, ProgressBar } from "./proposta-bits";
import { participarAction } from "./proposta-actions";
import { addEventNote, createDealFromEdital, createTaskFromEdital, saveNotes, setOwner, setTriage } from "./actions";

type Person = { id: string; name: string };
export type DetailData = { edital: EditalDTO; events: { id: number; at: string; userName: string | null; type: string; body: string }[] };

export function EditalSheet({ data, brief, canEdit, canDeal, canTask, team }: { data: DetailData | null; brief: PropostaBrief | null; canEdit: boolean; canDeal: boolean; canTask: boolean; team: Person[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const close = () => {
    const p = new URLSearchParams(sp.toString());
    p.delete("id");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return (
    <Sheet open={!!data} onOpenChange={(o) => !o && close()}>
      <SheetContent className="overflow-y-auto overscroll-contain data-[side=right]:w-full data-[side=right]:sm:max-w-xl" showCloseButton={false}>
        <SheetCloseBtn />
        {data && <Body key={data.edital.id + data.edital.triage + (brief?.exists ? "p" : "")} data={data} brief={brief} canEdit={canEdit} canDeal={canDeal} canTask={canTask} team={team} />}
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="label">{label}</dt>
      <dd className="text-[13.5px] break-words">{children}</dd>
    </div>
  );
}

function Body({ data, brief, canEdit, canDeal, canTask, team }: { data: DetailData; brief: PropostaBrief | null; canEdit: boolean; canDeal: boolean; canTask: boolean; team: Person[] }) {
  const { edital: e, events } = data;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState(DISCARD_REASONS[0]);
  const [reasonExtra, setReasonExtra] = useState("");
  const [notes, setNotes] = useState(e.notes ?? "");
  const [more, setMore] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [dealForm, setDealForm] = useState({ title: e.title.slice(0, 120), organ: e.organ, value: e.valueCents ? centsToInput(e.valueCents) : "", location: [e.city, e.uf].filter(Boolean).join("/"), withTask: !!e.closeAt && canTask });
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ error?: string } | { ok: true } | { ok: true; dealId: string }>, okMsg?: string) =>
    start(async () => {
      const r = await fn();
      if ("error" in r && r.error) toast.error(r.error);
      else {
        if (okMsg) toast.success(okMsg);
        router.refresh();
      }
    });

  const tri = (t: EditalTriage, label: string, Icon: React.ElementType, variant: "default" | "outline" = "outline") => (
    <Button key={t} type="button" size="sm" variant={e.triage === t ? "default" : variant} disabled={pending || e.triage === t} className="max-md:h-11" onClick={() => run(() => setTriage(e.id, t), `Marcado como “${TRIAGE_LABEL[t].toLowerCase()}”`)}>
      <Icon /> {label}
    </Button>
  );

  const objectLong = e.object.length > 700;

  return (
    <div className="grid gap-5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <SheetHeader className="px-0">
        <SheetTitle className="pr-10 text-left text-[17px] leading-snug break-words">{e.title}</SheetTitle>
        <SheetDescription className="text-left">{e.organ}{e.unit ? ` — ${e.unit}` : ""}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        <ScoreBadge score={e.score} />
        <KindChip kind={e.kind} />
        <EsferaChip esfera={e.esfera} />
        <TriagePill triage={e.triage} />
        {e.situation !== "aberto" && <span className="rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground">{SITUATION_LABEL[e.situation as EditalSituation] ?? e.situation}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {e.url && (
          <Button asChild size="sm" variant="outline" className="max-md:h-11">
            <a href={e.url} target="_blank" rel="noreferrer">
              <ExternalLink /> Abrir no PNCP
            </a>
          </Button>
        )}
        {e.sourceUrl && (
          <Button asChild size="sm" variant="outline" className="max-md:h-11">
            <a href={e.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Portal de origem (proposta)
            </a>
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Local">{[e.city, e.uf].filter(Boolean).join(" · ") || "—"}</Fact>
        <Fact label="Esfera">{e.esfera ? ESFERA_LABEL[e.esfera as Esfera] : "—"}</Fact>
        <Fact label="Valor estimado">{e.valueCents ? money(e.valueCents) : "Não informado / sigiloso"}</Fact>
        <Fact label="Modalidade">{e.modalidade ?? "—"}</Fact>
        <Fact label="Publicado em">{fmtDate(e.publishedAt)}</Fact>
        <Fact label="Abertura das propostas">{fmtDateTime(e.openAt)}</Fact>
        <Fact label="Encerramento das propostas">
          <span className="grid">
            <span>{fmtDateTime(e.closeAt)}</span>
            <Deadline daysLeft={e.daysLeft} situation={e.situation} />
          </span>
        </Fact>
        <Fact label="Nº de controle PNCP">
          <span className="num text-xs break-all">{e.externalId}</span>
        </Fact>
      </dl>

      <section className="grid gap-1.5">
        <h3 className="label">Objeto</h3>
        <p className={`text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${objectLong && !more ? "line-clamp-6" : ""}`}>{e.object}</p>
        {objectLong && (
          <button type="button" className="w-fit text-[13px] underline underline-offset-2 max-md:min-h-11" onClick={() => setMore((v) => !v)}>
            {more ? "Mostrar menos" : "Ler o objeto completo"}
          </button>
        )}
      </section>

      <section className="grid gap-1.5 rounded-xl bg-muted/40 p-3">
        <h3 className="label">Por que apareceu aqui</h3>
        <div className="flex flex-wrap gap-1.5">
          {e.matched.length ? e.matched.map((m) => <span key={m} className="rounded-md border bg-card px-1.5 py-0.5 text-xs">{m}</span>) : <span className="text-xs text-muted-foreground">sem termos registrados</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Classificado como <strong className="font-medium text-foreground">{KIND_LABEL[e.kind as EditalKind] ?? e.kind}</strong>
          {e.kindWhy ? ` (${e.kindWhy})` : ""} · relevância {e.score}/100. Termos de patrimônio e de obra/projeto pesam; ruído como restauração dental, florestal ou de pavimento é descartado.
        </p>
      </section>

      <PropostaSection edital={e} brief={brief} canEdit={canEdit} canDeal={canDeal} canTask={canTask} />

      {canEdit && (
        <section className="grid gap-2.5" data-tour="edital-triage">
          <h3 className="label">Triagem</h3>
          <div className="flex flex-wrap gap-2">
            {tri("interessante", "Interessante", Star)}
            {tri("em_analise", "Em análise", SearchIcon)}
            {tri("proposta_enviada", "Proposta enviada", Send)}
            {tri("ganho", "Ganho", Trophy)}
            {tri("perdido", "Perdido", XCircle)}
            {e.triage === "descartado" || e.triage !== "novo" ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending} className="max-md:h-11" onClick={() => run(() => setTriage(e.id, "novo"), "Voltou para “novo”")}>
                <Undo2 /> Voltar para novo
              </Button>
            ) : null}
            {e.triage !== "descartado" && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} className="max-md:h-11" onClick={() => setDiscarding((v) => !v)}>
                <Ban /> Descartar…
              </Button>
            )}
          </div>
          {e.triage === "descartado" && e.discardReason && <p className="text-[13px] text-muted-foreground">Descartado: {e.discardReason}</p>}
          {discarding && (
            <div className="grid gap-2 rounded-xl border p-3">
              <Field label="Motivo do descarte">
                <SimpleSelect value={reason} onValueChange={setReason} options={DISCARD_REASONS} />
              </Field>
              {reason === "Outro" && <Input value={reasonExtra} onChange={(ev) => setReasonExtra(ev.target.value)} placeholder="Explique em poucas palavras" maxLength={120} />}
              <Button
                type="button"
                size="sm"
                disabled={pending}
                className="w-fit max-md:h-11"
                onClick={() =>
                  run(() => setTriage(e.id, "descartado", reason === "Outro" && reasonExtra.trim() ? `Outro: ${reasonExtra.trim()}` : reason), "Edital descartado")
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Ban />} Confirmar descarte
              </Button>
            </div>
          )}
        </section>
      )}

      {canEdit && (
        <section className="grid gap-3">
          <Field label="Responsável">
            <SimpleSelect
              value={e.ownerId ?? "__none"}
              onValueChange={(v) => run(() => setOwner(e.id, v === "__none" ? null : v), "Responsável atualizado")}
              options={[{ value: "__none", label: "Sem responsável" }, ...team.map((u) => ({ value: u.id, label: u.name }))]}
            />
          </Field>
          <Field label="Anotações" hint="Exigências de habilitação, atestados, ideias de preço, contatos do órgão…">
            <Textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} rows={4} maxLength={4000} className="text-base md:text-sm" />
          </Field>
          {notes !== (e.notes ?? "") && (
            <Button type="button" size="sm" disabled={pending} className="w-fit max-md:h-11" onClick={() => run(() => saveNotes(e.id, notes), "Anotações salvas")}>
              Salvar anotações
            </Button>
          )}
        </section>
      )}
      {!canEdit && e.notes && (
        <section className="grid gap-1.5">
          <h3 className="label">Anotações</h3>
          <p className="text-[13.5px] whitespace-pre-wrap">{e.notes}</p>
        </section>
      )}

      {canEdit && (
        <section className="grid gap-2.5" data-tour="edital-deal">
          <h3 className="label">Negócio e prazo</h3>
          {e.dealId ? (
            <Button asChild variant="outline" size="sm" className="w-fit max-md:h-11">
              <Link href={`/negocios/${e.dealId}`}>
                <Briefcase /> Abrir o negócio deste edital
              </Link>
            </Button>
          ) : canDeal ? (
            <>
              {!dealOpen ? (
                <Button type="button" size="sm" className="w-fit max-md:h-11" onClick={() => setDealOpen(true)}>
                  <Briefcase /> Criar negócio a partir do edital
                </Button>
              ) : (
                <div className="grid gap-3 rounded-xl border p-3">
                  <Field label="Nome do negócio">
                    <Input value={dealForm.title} onChange={(ev) => setDealForm({ ...dealForm, title: ev.target.value })} maxLength={200} />
                  </Field>
                  <Field label="Contato (órgão)" hint="Cria (ou reaproveita) um contato com o nome do órgão.">
                    <Input value={dealForm.organ} onChange={(ev) => setDealForm({ ...dealForm, organ: ev.target.value })} maxLength={200} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor (R$)">
                      <Input inputMode="decimal" value={dealForm.value} onChange={(ev) => setDealForm({ ...dealForm, value: ev.target.value })} placeholder="0,00" />
                    </Field>
                    <Field label="Local">
                      <Input value={dealForm.location} onChange={(ev) => setDealForm({ ...dealForm, location: ev.target.value })} maxLength={160} />
                    </Field>
                  </div>
                  {canTask && e.closeAt && (
                    <label className="flex items-center gap-2.5 text-[13px] max-md:min-h-11">
                      <Checkbox checked={dealForm.withTask} onCheckedChange={(v) => setDealForm({ ...dealForm, withTask: v === true })} />
                      Criar também a tarefa “Enviar proposta” com o prazo ({fmtDate(e.closeAt)})
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      className="max-md:h-11"
                      onClick={() =>
                        start(async () => {
                          const r = await createDealFromEdital(e.id, dealForm);
                          if ("error" in r && r.error) toast.error(r.error);
                          else {
                            toast.success("Negócio criado");
                            router.refresh();
                          }
                        })
                      }
                    >
                      {pending ? <Loader2 className="animate-spin" /> : <Briefcase />} Criar negócio
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="max-md:h-11" onClick={() => setDealOpen(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Criar negócio exige acesso de edição a Negócios e a Leads e contatos.</p>
          )}
          {canTask && e.closeAt && !e.taskId && (
            <Button type="button" size="sm" variant="outline" disabled={pending} className="w-fit max-md:h-11" onClick={() => run(() => createTaskFromEdital(e.id), "Tarefa criada com o prazo")}>
              <CalendarClock /> Criar tarefa com o prazo
            </Button>
          )}
          {e.taskId && (
            <Link href="/tarefas" className="w-fit text-[13px] underline underline-offset-2 max-md:min-h-11">
              Já existe uma tarefa com o prazo — abrir Tarefas
            </Link>
          )}
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="label">Histórico</h3>
        {canEdit && (
          <form
            className="flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!note.trim()) return;
              run(() => addEventNote(e.id, note), "Anotação registrada");
              setNote("");
            }}
          >
            <Input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Registrar algo (ligou para o órgão, pediu esclarecimento…)" maxLength={600} />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !note.trim()} className="max-md:h-11">
              Registrar
            </Button>
          </form>
        )}
        <ul className="grid gap-2">
          {events.map((v) => (
            <li key={v.id} className="grid gap-0.5 border-l-2 pl-3 text-[13px]">
              <span className="break-words">{v.body}</span>
              <span className="text-xs text-muted-foreground">
                {fmtDateTime(v.at)} · {v.userName ?? "sistema"}
              </span>
            </li>
          ))}
          <li className="grid gap-0.5 border-l-2 pl-3 text-[13px]">
            <span>Edital encontrado pela varredura do PNCP</span>
            <span className="text-xs text-muted-foreground">{fmtDateTime(e.firstSeenAt)}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

const CLOSED_TRIAGE = ["descartado", "ganho", "perdido"];

/** “Vou participar”: abre o dossiê da proposta (checklist, tarefas, matriz de habilitação) ou leva até ele. */
function PropostaSection({ edital: e, brief, canEdit, canDeal, canTask }: { edital: DetailData["edital"]; brief: PropostaBrief | null; canEdit: boolean; canDeal: boolean; canTask: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState(brief?.suggestedTemplate ?? "obra");
  const [withDeal, setWithDeal] = useState(canDeal && !e.dealId);
  const [withTasks, setWithTasks] = useState(canTask);
  if (!brief) return null;

  if (brief.exists) {
    return (
      <section className="grid gap-2.5 rounded-xl border border-brand/30 bg-brand-soft/50 p-3" data-tour="edital-proposta">
        <h3 className="label flex items-center gap-1.5">
          <ClipboardList className="size-3.5" /> Esteira de proposta
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {brief.status === "andamento" ? <Countdown daysLeft={brief.daysLeft} urgency={brief.urgency} /> : null}
          <span className="num text-[13px] tabular-nums">{brief.pct}% pronto</span>
        </div>
        <ProgressBar pct={brief.pct} />
        <Button asChild size="sm" className="w-fit max-md:h-11">
          <Link href={`/editais-avancado/proposta/${e.id}`}>
            <ClipboardList /> Abrir o dossiê da proposta
          </Link>
        </Button>
      </section>
    );
  }
  if (!canEdit || CLOSED_TRIAGE.includes(e.triage)) return null;

  const go = () =>
    start(async () => {
      const r = await participarAction(e.id, { templateKey, withDeal: withDeal && canDeal, withTasks: withTasks && canTask });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Dossiê criado: checklist, prazos e habilitação montados");
      for (const n of (r.notes as string[] | undefined) ?? []) toast.message(n);
      router.push(`/editais-avancado/proposta/${e.id}`);
    });

  return (
    <section className="grid gap-2.5 rounded-xl border border-brand/30 bg-brand-soft/50 p-3" data-tour="edital-proposta">
      <h3 className="label flex items-center gap-1.5">
        <Rocket className="size-3.5" /> Esteira de proposta
      </h3>
      {!open ? (
        <>
          <p className="text-[13px] text-muted-foreground">Decidiu participar? Um toque monta o checklist com prazos de trás para frente, as tarefas da equipe e a lista de documentos de habilitação.</p>
          <Button type="button" size="sm" className="w-fit max-md:h-11" onClick={() => setOpen(true)}>
            <Rocket /> Vou participar
          </Button>
        </>
      ) : (
        <div className="grid gap-3">
          <Field label="Modelo de checklist" hint="Sugerido pelo tipo do edital. Você pode trocar depois.">
            <SimpleSelect value={templateKey} onValueChange={setTemplateKey} options={brief.templates.map((t) => ({ value: t.key, label: t.name }))} />
          </Field>
          {canDeal && !e.dealId && (
            <label className="flex items-center gap-2.5 text-[13px] max-md:min-h-11">
              <Checkbox checked={withDeal} onCheckedChange={(v) => setWithDeal(v === true)} />
              Criar o negócio e o contato do órgão
            </label>
          )}
          {canTask ? (
            <label className="flex items-center gap-2.5 text-[13px] max-md:min-h-11">
              <Checkbox checked={withTasks} onCheckedChange={(v) => setWithTasks(v === true)} />
              Criar as tarefas no quadro “Editais”
            </label>
          ) : null}
          {!e.closeAt && <p className="text-xs text-brand">Este edital não tem data limite informada: os itens ficam sem prazo até você informar uma no dossiê.</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} className="max-md:h-11" onClick={go}>
              {pending ? <Loader2 className="animate-spin" /> : <Rocket />} Montar a proposta
            </Button>
            <Button type="button" size="sm" variant="ghost" className="max-md:h-11" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
