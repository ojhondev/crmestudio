"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ExternalLink, FileText, Loader2, Pencil, Plus, RefreshCw, Sheet as SheetIcon, Trash2, Trophy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { fmtDate, money, moneyShort, todayISO } from "@/lib/format";
import type { Bundle, ItemDTO, StepDTO } from "@/lib/propostas/server";
import type { SuggestionDTO } from "@/lib/propostas/suggest";
import { MATRIX_LABEL, validityOf, validityText, type MatrixRow, type MatrixSituation } from "@/lib/propostas/cofre";
import { COFRE_SHORT, COFRE_TYPES, DOSSIE_STATUS_LABEL, LOSS_STATUSES, PORTFOLIO_KIND_LABEL, ROLE_LABEL, STEPS, STEP_BY_KEY, STEP_STATUS_LABEL, STEP_STATUSES, type StepKey } from "@/lib/propostas/types";
import { PROPOSTA_DOCS } from "@/lib/propostas/doc-templates";
import { KindChip, TriagePill } from "../../bits";
import { Countdown, ProgressBar, StatusPill } from "../../proposta-bits";
import {
  addItemAction,
  addRequirementAction,
  applyChecklistAction,
  applyMatrixAction,
  createPriceSheetAction,
  generateDocsAction,
  insertAtestadosAction,
  moveItemAction,
  recalcDeadlinesAction,
  removeItemAction,
  removeRequirementAction,
  setResultAction,
  setStepAction,
  syncTasksAction,
  toggleItemAction,
  updateDossieAction,
  updateItemAction,
  updateRequirementAction,
} from "../../proposta-actions";

type Person = { id: string; name: string };
type Opt = { key: string; name: string };
type Flags = { canEdit: boolean; canDocs: boolean; canSheets: boolean; canTasks: boolean; canCofre: boolean };
type Res = { error: string } | { ok: true; error?: undefined; [k: string]: unknown };

/** Executa uma ação do servidor com aviso de sucesso/erro e atualiza a tela. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, okMsg?: string, after?: (r: Extract<Res, { ok: true }>) => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        if (okMsg) toast.success(okMsg);
        after?.(r as Extract<Res, { ok: true }>);
        router.refresh();
      }
    });
  return { run, pending };
}

const SITUATION_TONE: Record<MatrixSituation, string> = {
  ok: "border-border bg-muted text-foreground",
  ok_manual: "border-border bg-muted text-foreground",
  na: "border-dashed text-muted-foreground",
  vence_antes: "border-brand bg-brand-soft text-brand",
  vencido: "border-brand bg-brand text-on-brand",
  faltando: "border-brand text-brand",
};

export function Dossie({ b, team, checklists, matrices, lossReasons, suggestions, flags }: { b: Bundle; team: Person[]; checklists: Opt[]; matrices: Opt[]; lossReasons: string[]; suggestions: SuggestionDTO[]; flags: Flags }) {
  const e = b.edital;
  const open = b.dossie.status === "andamento";
  const currentStep = b.progress.currentStep;
  return (
    <div className="grid gap-4 p-3 sm:p-5">
      <header className="grid gap-3 rounded-xl border bg-card p-4" data-tour="dossie-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[17px] leading-snug font-semibold break-words">{e.title}</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {e.organ}
              {e.unit ? ` — ${e.unit}` : ""} · {[e.city, e.uf].filter(Boolean).join("/") || "local não informado"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {open ? <Countdown daysLeft={b.daysLeft} urgency={b.urgency} /> : <StatusPill status={b.dossie.status} />}
            <KindChip kind={e.kind} />
            <TriagePill triage={e.triage} />
          </div>
        </div>
        <div className="grid gap-1">
          <ProgressBar pct={b.progress.pct} />
          <p className="text-xs text-muted-foreground">
            <span className="num font-medium text-foreground">{b.progress.pct}%</span> pronto · {b.progress.doneItems} de {b.progress.totalItems} itens do checklist
            {b.progress.overdueSteps ? <span className="font-medium text-brand"> · {b.progress.overdueSteps} etapa(s) atrasada(s)</span> : null}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
          <Fact label="Data limite">{b.deadlineDay ? fmtDate(b.deadlineDay) : "Informe nos dados da proposta"}</Fact>
          <Fact label="Valor estimado">{e.valueCents ? money(e.valueCents) : "Não informado"}</Fact>
          <Fact label="Modalidade">{e.modalidade ?? "—"}</Fact>
          <Fact label="Responsável">{b.dossie.ownerName ?? <span className="text-brand">Sem responsável</span>}</Fact>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="max-md:h-11">
            <Link href={`/editais?id=${e.id}`}>Ver o edital</Link>
          </Button>
          {e.url && (
            <Button asChild size="sm" variant="outline" className="max-md:h-11">
              <a href={e.url} target="_blank" rel="noreferrer">
                <ExternalLink /> PNCP
              </a>
            </Button>
          )}
          {e.sourceUrl && (
            <Button asChild size="sm" variant="outline" className="max-md:h-11">
              <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Portal de envio
              </a>
            </Button>
          )}
          {b.deal && (
            <Button asChild size="sm" variant="outline" className="max-md:h-11">
              <Link href={`/negocios/${b.deal.id}`}>Negócio: {b.deal.stageName}</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4">
          <section className="grid gap-3" data-tour="dossie-etapas">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Etapas e checklist</h2>
              {flags.canEdit && open && <ChecklistTools b={b} checklists={checklists} flags={flags} />}
            </div>
            {STEPS.map((def) => {
              const step = b.steps.find((s) => s.key === def.key);
              if (!step) return null;
              return <StepCard key={def.key} editalId={b.edital.id} step={step} items={b.items.filter((i) => i.stepKey === def.key)} team={team} canEdit={flags.canEdit} current={def.key === currentStep} />;
            })}
          </section>

          <MatrixSection b={b} matrices={matrices} canEdit={flags.canEdit} />
        </div>

        <div className="grid gap-4">
          <DataSection b={b} team={team} canEdit={flags.canEdit} checklists={checklists} />
          <DocsSection b={b} flags={flags} />
          <AtestadosSection b={b} suggestions={suggestions} flags={flags} />
          <ResultSection b={b} lossReasons={lossReasons} canEdit={flags.canEdit} />
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="label">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Card({ title, hint, children, tour, action }: { title: string; hint?: string; children: React.ReactNode; tour?: string; action?: React.ReactNode }) {
  return (
    <section data-tour={tour} className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* --------------------------------- checklist --------------------------------- */

function ChecklistTools({ b, checklists, flags }: { b: Bundle; checklists: Opt[]; flags: Flags }) {
  const { run, pending } = useRun();
  const missingTasks = b.items.filter((i) => !i.done && !i.taskId).length;
  return (
    <div className="flex flex-wrap gap-2">
      {flags.canTasks && missingTasks > 0 && (
        <Button type="button" size="sm" variant="outline" disabled={pending} className="max-md:h-11" onClick={() => run(() => syncTasksAction(b.edital.id), "Tarefas criadas no quadro “Editais”")}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Criar {missingTasks} tarefa(s)
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" disabled={pending} className="max-md:h-11" onClick={() => run(() => applyChecklistAction(b.edital.id), "Checklist conferido: só entra o que faltava")} title={`Modelo: ${checklists.find((c) => c.key === b.dossie.templateKey)?.name ?? "—"}`}>
        <RefreshCw /> Reaplicar modelo
      </Button>
    </div>
  );
}

function dueChip(it: { dueDay: string | null; done: boolean; overdue: boolean }) {
  if (!it.dueDay) return null;
  return (
    <span className={cn("num inline-flex items-center gap-1 text-xs tabular-nums", it.overdue ? "font-semibold text-brand" : "text-muted-foreground")}>
      {it.overdue && <AlertTriangle className="size-3" aria-hidden />} {fmtDate(it.dueDay, "dd/MM")}
      {it.overdue ? " · atrasado" : ""}
    </span>
  );
}

function StepCard({ editalId, step, items, team, canEdit, current }: { editalId: string; step: StepDTO; items: ItemDTO[]; team: Person[]; canEdit: boolean; current: boolean }) {
  const { run, pending } = useRun();
  const def = STEP_BY_KEY[step.key as StepKey];
  const [title, setTitle] = useState("");
  const done = step.status === "concluida";
  const na = step.status === "nao_se_aplica";
  return (
    <details open={current || (!done && !na && items.length > 0 && step.overdue)} className={cn("group rounded-xl border bg-card", current && "border-brand/40")}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 max-md:min-h-14 [&::-webkit-details-marker]:hidden">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold", done ? "border-foreground bg-foreground text-background" : current ? "border-brand text-brand" : "text-muted-foreground")}>
          {done ? <Check className="size-4" /> : def.offset === null ? "•" : STEPS.findIndex((s) => s.key === step.key) + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[14px] font-medium", na && "text-muted-foreground line-through")}>{def.label}</span>
          <span className="block text-xs text-muted-foreground">
            {STEP_STATUS_LABEL[step.status as keyof typeof STEP_STATUS_LABEL]}
            {step.itemsTotal ? ` · ${step.itemsDone}/${step.itemsTotal} itens` : ""}
            {step.assigneeName ? ` · ${step.assigneeName.split(" ")[0]}` : ""}
          </span>
        </span>
        {step.dueDay && !done && !na && (
          <span className={cn("num shrink-0 text-xs tabular-nums", step.overdue ? "font-semibold text-brand" : "text-muted-foreground")}>
            {step.overdue ? "atrasada · " : "até "}
            {fmtDate(step.dueDay, "dd/MM")}
          </span>
        )}
      </summary>
      <div className="grid gap-3 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">{def.hint}</p>
        {canEdit && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Situação">
              <SimpleSelect value={step.status} onValueChange={(v) => run(() => setStepAction(editalId, step.key, { status: v }))} options={STEP_STATUSES.map((s) => ({ value: s, label: STEP_STATUS_LABEL[s] }))} />
            </Field>
            <Field label="Responsável">
              <SimpleSelect value={step.assigneeId ?? "__none"} onValueChange={(v) => run(() => setStepAction(editalId, step.key, { assigneeId: v === "__none" ? null : v }))} options={[{ value: "__none", label: "Sem responsável" }, ...team.map((u) => ({ value: u.id, label: u.name }))]} />
            </Field>
            <Field label="Prazo da etapa">
              <Input type="date" defaultValue={step.dueDay ?? ""} className="h-9 text-base max-md:h-11 md:text-sm" onBlur={(ev) => ev.target.value !== (step.dueDay ?? "") && run(() => setStepAction(editalId, step.key, { dueDay: ev.target.value || null }))} />
            </Field>
          </div>
        )}
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">Nenhum item nesta etapa. {canEdit ? "Adicione abaixo o que precisa ser feito." : ""}</p>
        ) : (
          <ul className="grid gap-1.5">
            {items.map((it, idx) => (
              <ItemRow key={it.id} item={it} team={team} canEdit={canEdit} first={idx === 0} last={idx === items.length - 1} />
            ))}
          </ul>
        )}
        {canEdit && (
          <form
            className="flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!title.trim()) return;
              const t = title;
              setTitle("");
              run(() => addItemAction(editalId, step.key, t));
            }}
          >
            <Input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Adicionar um item a esta etapa…" maxLength={200} aria-label={`Novo item em ${def.label}`} className="max-md:h-11" />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !title.trim()} className="max-md:h-11" aria-label="Adicionar item">
              <Plus />
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}

function ItemRow({ item, team, canEdit, first, last }: { item: ItemDTO; team: Person[]; canEdit: boolean; first: boolean; last: boolean }) {
  const { run, pending } = useRun();
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(item.title);
  return (
    <li className={cn("rounded-lg border px-3 py-2", item.done && "bg-muted/40")}>
      <div className="flex items-start gap-3">
        <label className="grid size-11 shrink-0 cursor-pointer place-items-center md:size-8">
          <Checkbox checked={item.done} disabled={!canEdit || pending} onCheckedChange={(v) => run(() => toggleItemAction(item.id, v === true))} aria-label={`Marcar “${item.title}” como feito`} />
        </label>
        <div className="min-w-0 flex-1 py-1.5 md:py-0.5">
          <p className={cn("text-[13.5px] leading-snug break-words", item.done && "text-muted-foreground line-through")}>{item.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            {dueChip(item)}
            {item.assigneeName && <span className="text-xs text-muted-foreground">{item.assigneeName.split(" ")[0]}</span>}
            {item.role && !item.assigneeName && <span className="text-xs text-muted-foreground">{ROLE_LABEL[item.role] ?? item.role}</span>}
            {item.taskId && (
              <Link href="/tarefas" className="text-xs underline underline-offset-2 max-md:inline-flex max-md:min-h-11 max-md:items-center">
                tarefa
              </Link>
            )}
          </p>
        </div>
        {canEdit && (
          <Button type="button" size="icon-sm" variant="ghost" className="shrink-0 max-md:size-11" aria-label={`Editar “${item.title}”`} onClick={() => setEdit((v) => !v)}>
            <Pencil />
          </Button>
        )}
      </div>
      {edit && canEdit && (
        <div className="mt-2 grid gap-2 border-t pt-2.5">
          <Field label="Texto do item">
            <Input value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={200} className="max-md:h-11" onBlur={() => title.trim() && title !== item.title && run(() => updateItemAction(item.id, { title }))} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Prazo">
              <Input type="date" defaultValue={item.dueDay ?? ""} className="h-9 text-base max-md:h-11 md:text-sm" onBlur={(ev) => ev.target.value !== (item.dueDay ?? "") && run(() => updateItemAction(item.id, { dueDay: ev.target.value || null }))} />
            </Field>
            <Field label="Responsável">
              <SimpleSelect value={item.assigneeId ?? "__none"} onValueChange={(v) => run(() => updateItemAction(item.id, { assigneeId: v === "__none" ? null : v }))} options={[{ value: "__none", label: "Sem responsável" }, ...team.map((u) => ({ value: u.id, label: u.name }))]} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={first || pending} className="max-md:h-11" onClick={() => run(() => moveItemAction(item.id, "up"))}>
              <ArrowUp /> Subir
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={last || pending} className="max-md:h-11" onClick={() => run(() => moveItemAction(item.id, "down"))}>
              <ArrowDown /> Descer
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} className="text-muted-foreground hover:text-destructive max-md:h-11" onClick={() => run(() => removeItemAction(item.id), "Item removido")}>
              <Trash2 /> Remover
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/* --------------------------------- matriz de habilitação --------------------------------- */

function MatrixSection({ b, matrices, canEdit }: { b: Bundle; matrices: Opt[]; canEdit: boolean }) {
  const { run, pending } = useRun();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("__none");
  const [mkey, setMkey] = useState(b.dossie.matrixKey ?? matrices[0]?.key ?? "");
  const s = b.matrixSummary;
  return (
    <Card
      tour="dossie-matriz"
      title="Matriz de habilitação"
      hint={b.deadlineDay ? `Cada exigência do edital × o documento do cofre que atende. A validade é conferida contra ${fmtDate(b.deadlineDay)}.` : "Informe a data limite para conferir as validades."}
      action={
        <Link href="/editais/cofre" className="shrink-0 text-[13px] underline underline-offset-2 max-md:flex max-md:min-h-11 max-md:items-center">
          Abrir o cofre
        </Link>
      }
    >
      {s.total > 0 && (
        <p className={cn("rounded-lg px-3 py-2 text-[13px]", s.problems ? "bg-brand-soft text-brand" : "bg-muted text-foreground")}>
          {s.problems ? (
            <>
              <strong>{s.problems} pendência(s):</strong> {s.faltando ? `${s.faltando} faltando` : ""}
              {s.faltando && s.vencendo ? " · " : ""}
              {s.vencendo ? `${s.vencendo} vencida(s) ou vencendo antes da sessão` : ""}.
            </>
          ) : (
            <>
              Tudo em dia: {s.ok} de {s.total} exigências atendidas.
            </>
          )}
        </p>
      )}
      {b.matrix.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-[13px] text-muted-foreground">Nenhuma exigência ainda. {canEdit ? "Aplique a lista padrão abaixo ou adicione as exigências do edital." : ""}</p>
      ) : (
        <ul className="grid gap-2">
          {b.matrix.map((r) => (
            <RequirementRow key={r.req.id} row={r} b={b} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="grid gap-3 border-t pt-3">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_200px_auto]"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!title.trim()) return;
              const t = title;
              setTitle("");
              run(() => addRequirementAction(b.edital.id, t, type === "__none" ? null : type));
            }}
          >
            <Input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Nova exigência do edital…" maxLength={200} aria-label="Nova exigência" className="max-md:h-11" />
            <SimpleSelect value={type} onValueChange={setType} options={[{ value: "__none", label: "Tipo de documento" }, ...COFRE_TYPES.map((t) => ({ value: t.key, label: COFRE_SHORT[t.key] }))]} />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !title.trim()} className="max-md:h-11">
              <Plus /> Adicionar
            </Button>
          </form>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Lista padrão" className="min-w-52 flex-1">
              <SimpleSelect value={mkey} onValueChange={setMkey} options={matrices.map((m) => ({ value: m.key, label: m.name }))} />
            </Field>
            <Button type="button" size="sm" variant="outline" disabled={pending} className="max-md:h-11" onClick={() => run(() => applyMatrixAction(b.edital.id, mkey), "Exigências acrescentadas (as que já existiam foram mantidas)")}>
              <Wand2 /> Acrescentar exigências
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RequirementRow({ row, b, canEdit }: { row: MatrixRow; b: Bundle; canEdit: boolean }) {
  const { run, pending } = useRun();
  const [more, setMore] = useState(false);
  const r = row.req;
  const v = row.doc ? validityOf(row.doc.validUntil, todayISO()) : null;
  // opções: documentos do mesmo tipo primeiro
  const docs = [...b.cofre].sort((x, y) => Number(y.type === r.cofreType) - Number(x.type === r.cofreType));
  return (
    <li className="rounded-lg border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] leading-snug break-words">{r.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.doc ? (
              <>
                {row.doc.url ? (
                  <a href={row.doc.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {row.doc.title}
                  </a>
                ) : (
                  row.doc.title
                )}
                {row.doc.validUntil ? ` · validade ${fmtDate(row.doc.validUntil)}` : ""}
                {v && v.status !== "sem_validade" ? ` (${validityText(v).toLowerCase()})` : ""}
              </>
            ) : (
              row.note
            )}
          </p>
          {row.doc && row.note && <p className="mt-0.5 text-xs font-medium text-brand">{row.note}</p>}
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", SITUATION_TONE[row.situation])}>{MATRIX_LABEL[row.situation]}</span>
      </div>
      {canEdit && (
        <>
          <button type="button" className="mt-1.5 text-xs underline underline-offset-2 max-md:min-h-11" onClick={() => setMore((x) => !x)} aria-expanded={more}>
            {more ? "Fechar" : "Ajustar"}
          </button>
          {more && (
            <div className="mt-1 grid gap-2 border-t pt-2.5 sm:grid-cols-2">
              <Field label="Documento do cofre" hint="Em “automático” o CRM escolhe o de maior validade do tipo.">
                <SimpleSelect
                  value={r.cofreDocId ?? "__auto"}
                  onValueChange={(val) => run(() => updateRequirementAction(r.id, { cofreDocId: val === "__auto" ? null : val }))}
                  options={[{ value: "__auto", label: "Automático" }, ...docs.map((d) => ({ value: d.id, label: `${COFRE_SHORT[d.type] ?? d.type} — ${d.title}${d.validUntil ? ` (${fmtDate(d.validUntil, "dd/MM/yy")})` : ""}` }))]}
                />
              </Field>
              <Field label="Situação">
                <SimpleSelect
                  value={r.mode}
                  onValueChange={(val) => run(() => updateRequirementAction(r.id, { mode: val }))}
                  options={[
                    { value: "auto", label: "Conferir pelo cofre" },
                    { value: "ok_manual", label: "Atendida por outro meio" },
                    { value: "na", label: "Não se aplica a este edital" },
                  ]}
                />
              </Field>
              <Button type="button" size="sm" variant="ghost" disabled={pending} className="w-fit text-muted-foreground hover:text-destructive max-md:h-11" onClick={() => run(() => removeRequirementAction(r.id), "Exigência removida")}>
                <Trash2 /> Remover exigência
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

/* --------------------------------- dados da proposta --------------------------------- */

function DataSection({ b, team, canEdit, checklists }: { b: Bundle; team: Person[]; canEdit: boolean; checklists: Opt[] }) {
  const { run, pending } = useRun();
  const d = b.dossie;
  const [numero, setNumero] = useState(d.numero ?? "");
  const [processo, setProcesso] = useState(d.processo ?? "");
  const [limit, setLimit] = useState(d.sessionLocal);
  const [tpl, setTpl] = useState(d.templateKey ?? checklists[0]?.key ?? "");
  const dirty = numero !== (d.numero ?? "") || processo !== (d.processo ?? "") || limit !== d.sessionLocal;
  if (!canEdit) {
    return (
      <Card title="Dados da proposta">
        <dl className="grid gap-2 text-[13px]">
          <Fact label="Nº do edital">{d.numero ?? "—"}</Fact>
          <Fact label="Processo">{d.processo ?? "—"}</Fact>
        </dl>
      </Card>
    );
  }
  return (
    <Card title="Dados da proposta" hint="Entram nos documentos (carta, declarações, esclarecimentos…)." tour="dossie-dados">
      <div className="grid gap-3">
        <Field label="Nº do edital">
          <Input value={numero} onChange={(ev) => setNumero(ev.target.value)} placeholder="Ex.: Concorrência 12/2026" maxLength={80} className="max-md:h-11" />
        </Field>
        <Field label="Nº do processo">
          <Input value={processo} onChange={(ev) => setProcesso(ev.target.value)} maxLength={80} className="max-md:h-11" />
        </Field>
        <Field label="Data limite informada à mão" hint="Use só se o portal estiver desatualizado. Vale para os prazos, a contagem e a matriz.">
          <Input type="datetime-local" value={limit} onChange={(ev) => setLimit(ev.target.value)} className="h-9 text-base max-md:h-11 md:text-sm" />
        </Field>
        <Field label="Responsável pela proposta">
          <SimpleSelect value={d.ownerId ?? "__none"} onValueChange={(v) => run(() => updateDossieAction(b.edital.id, { ownerId: v === "__none" ? null : v }), "Responsável atualizado")} options={[{ value: "__none", label: "Sem responsável" }, ...team.map((u) => ({ value: u.id, label: u.name }))]} />
        </Field>
        {dirty && (
          <Button type="button" size="sm" disabled={pending} className="w-fit max-md:h-11" onClick={() => run(() => updateDossieAction(b.edital.id, { numero, processo, sessionAt: limit || null }), "Dados salvos")}>
            Salvar dados
          </Button>
        )}
        <div className="grid gap-2 border-t pt-3">
          <Field label="Modelo de checklist">
            <SimpleSelect value={tpl} onValueChange={setTpl} options={checklists.map((c) => ({ value: c.key, label: c.name }))} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pending} className="max-md:h-11" onClick={() => run(() => applyChecklistAction(b.edital.id, tpl), "Itens do modelo acrescentados")}>
              <Wand2 /> Aplicar modelo
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || !b.deadlineDay} className="max-md:h-11" onClick={() => run(() => recalcDeadlinesAction(b.edital.id), "Prazos recalculados")}>
              <RefreshCw /> Recalcular prazos
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Trocar o modelo só acrescenta itens: nada do que a equipe já fez é apagado. Os prazos contam dias úteis para trás (fins de semana e feriados nacionais ficam de fora).</p>
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------- documentos e planilha --------------------------------- */

function DocsSection({ b, flags }: { b: Bundle; flags: Flags }) {
  const { run, pending } = useRun();
  const router = useRouter();
  const missing = PROPOSTA_DOCS.filter((t) => t.auto && !b.docs.some((d) => d.templateSlug === t.slug));
  const extra = PROPOSTA_DOCS.filter((t) => !t.auto && !b.docs.some((d) => d.templateSlug === t.slug));
  return (
    <Card title="Documentos e planilha de preços" hint="Modelos de partida: revise com o jurídico e com o edital antes de assinar ou enviar." tour="dossie-docs">
      {b.docs.length > 0 && (
        <ul className="grid gap-1.5">
          {b.docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px]">
              <Link href={`/documentos/${d.id}`} className="flex min-w-0 items-center gap-2 underline-offset-2 hover:underline max-md:min-h-9">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{d.title.split(" — ")[0]}</span>
              </Link>
              <a href={`/documentos/${d.id}/pdf`} target="_blank" rel="noreferrer" className="shrink-0 text-xs underline underline-offset-2 max-md:flex max-md:min-h-11 max-md:items-center">
                PDF
              </a>
            </li>
          ))}
        </ul>
      )}
      {flags.canDocs && flags.canEdit ? (
        <div className="grid gap-2">
          {missing.length > 0 && (
            <Button type="button" size="sm" disabled={pending} className="w-fit max-md:h-11" onClick={() => run(() => generateDocsAction(b.edital.id), "Documentos criados, já preenchidos com os dados do edital e do estúdio")}>
              {pending ? <Loader2 className="animate-spin" /> : <FileText />} Gerar documentos da proposta
            </Button>
          )}
          {missing.length > 0 && <p className="text-xs text-muted-foreground">Cria: {missing.map((m) => m.name.replace(" (preços, BDI, prazo e validade)", "")).join(", ")}.</p>}
          {extra.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {extra.map((t) => (
                <Button key={t.slug} type="button" size="sm" variant="outline" disabled={pending} className="max-md:h-11" onClick={() => run(() => generateDocsAction(b.edital.id, [t.slug]), `${t.name} criado`)}>
                  <Plus /> {t.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Gerar documentos exige acesso de edição a Documentos.</p>
      )}
      <div className="grid gap-2 border-t pt-3">
        {b.sheet ? (
          <Button asChild size="sm" variant="outline" className="w-fit max-md:h-11">
            <Link href={`/planilhas/${b.sheet.id}`}>
              <SheetIcon /> Abrir a planilha de preços
            </Link>
          </Button>
        ) : flags.canSheets && flags.canEdit ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} className="w-fit max-md:h-11" onClick={() => run(() => createPriceSheetAction(b.edital.id), "Planilha criada com o BDI padrão", (r) => typeof r.id === "string" && router.push(`/planilhas/${r.id}`))}>
            <SheetIcon /> Criar planilha de preços
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Criar a planilha exige acesso de edição a Planilhas.</p>
        )}
        <p className="text-xs text-muted-foreground">Composição de custos, BDI e encargos (aba Resumo), cronograma físico-financeiro. Os valores padrão vêm da Configuração.</p>
      </div>
    </Card>
  );
}

/* --------------------------------- atestados --------------------------------- */

function AtestadosSection({ b, suggestions, flags }: { b: Bundle; suggestions: SuggestionDTO[]; flags: Flags }) {
  const { run, pending } = useRun();
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Card title="Atestados sugeridos" hint="Obras e projetos do seu portfólio que mais combinam com o objeto deste edital." tour="dossie-atestados" action={<Link href="/editais/portfolio" className="shrink-0 text-[13px] underline underline-offset-2 max-md:flex max-md:min-h-11 max-md:items-center">Portfólio</Link>}>
      {suggestions.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-5 text-center text-[13px] text-muted-foreground">
          Nenhuma obra do portfólio combina com este objeto. <Link href="/editais/portfolio" className="underline underline-offset-2">Cadastre seus atestados</Link> com etiquetas (ex.: restauração de forro) para o CRM sugerir.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {suggestions.map((s) => (
            <li key={s.id} className="rounded-lg border px-3 py-2">
              <label className="flex cursor-pointer items-start gap-3 max-md:min-h-11">
                <Checkbox className="mt-0.5" checked={sel.includes(s.id)} onCheckedChange={() => toggle(s.id)} disabled={!flags.canEdit || !flags.canDocs} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] leading-snug break-words">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[s.client, s.year, PORTFOLIO_KIND_LABEL[s.kind], s.valueCents ? moneyShort(s.valueCents) : null].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <span className="num font-medium text-foreground tabular-nums">{s.score} pts</span> — {s.why.join(", ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && flags.canEdit && flags.canDocs && (
        <Button
          type="button"
          size="sm"
          disabled={pending || sel.length === 0}
          className="w-fit max-md:h-11"
          onClick={() => run(() => insertAtestadosAction(b.edital.id, sel), `${sel.length} atestado(s) inseridos na proposta técnica`, (r) => typeof r.docId === "string" && setSel([]))}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Inserir {sel.length || ""} na proposta técnica
        </Button>
      )}
    </Card>
  );
}

/* --------------------------------- resultado --------------------------------- */

function ResultSection({ b, lossReasons, canEdit }: { b: Bundle; lossReasons: string[]; canEdit: boolean }) {
  const { run, pending } = useRun();
  const d = b.dossie;
  const [status, setStatus] = useState(d.status);
  const [reason, setReason] = useState(d.resultReason && lossReasons.includes(d.resultReason) ? d.resultReason : d.resultReason ? "Outro" : lossReasons[0]);
  const [extra, setExtra] = useState(d.resultReason && !lossReasons.includes(d.resultReason) ? d.resultReason : "");
  const [value, setValue] = useState(d.resultValueCents ? (d.resultValueCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  const [notes, setNotes] = useState(d.resultNotes ?? "");
  const needsReason = (LOSS_STATUSES as string[]).includes(status);
  const finalReason = reason === "Outro" && extra.trim() ? extra.trim() : reason;
  const dirty = status !== d.status || (needsReason && finalReason !== d.resultReason) || notes !== (d.resultNotes ?? "");
  return (
    <Card title="Resultado" hint="Registrar o motivo vira aprendizado: o Painel mostra a taxa de êxito por tipo e por órgão." tour="dossie-resultado" action={<Trophy className="size-4 text-muted-foreground" aria-hidden />}>
      {!canEdit ? (
        <p className="text-[13px]">
          {DOSSIE_STATUS_LABEL[d.status as keyof typeof DOSSIE_STATUS_LABEL]}
          {d.resultReason ? ` — ${d.resultReason}` : ""}
        </p>
      ) : (
        <div className="grid gap-3">
          <Field label="Como terminou?">
            <SimpleSelect value={status} onValueChange={setStatus} options={Object.entries(DOSSIE_STATUS_LABEL).map(([value, label]) => ({ value, label: value === "andamento" ? "Ainda em andamento" : label }))} />
          </Field>
          {needsReason && (
            <Field label="Motivo">
              <SimpleSelect value={reason ?? ""} onValueChange={setReason} options={lossReasons} />
              {reason === "Outro" && <Input value={extra} onChange={(ev) => setExtra(ev.target.value)} placeholder="Explique em poucas palavras" maxLength={120} className="mt-1.5 max-md:h-11" />}
            </Field>
          )}
          {status !== "andamento" && (
            <Field label={status === "ganhou" ? "Valor contratado (R$)" : "Valor do vencedor (R$), se souber"}>
              <Input inputMode="decimal" value={value} onChange={(ev) => setValue(ev.target.value)} placeholder="0,00" className="max-md:h-11" />
            </Field>
          )}
          {status !== "andamento" && (
            <Field label="Observações">
              <Textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} rows={3} maxLength={600} className="text-base md:text-sm" />
            </Field>
          )}
          {dirty && (
            <Button type="button" size="sm" disabled={pending} className="w-fit max-md:h-11" onClick={() => run(() => setResultAction(b.edital.id, { status, reason: needsReason ? finalReason : undefined, value, notes }), "Resultado registrado")}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Registrar resultado
            </Button>
          )}
          {status === "ganhou" && <p className="text-xs text-muted-foreground">O negócio ligado ao edital vai para a etapa de fechado ganho.</p>}
          {needsReason && <p className="text-xs text-muted-foreground">O negócio ligado ao edital vai para a etapa de perdido, com este motivo.</p>}
        </div>
      )}
    </Card>
  );
}
