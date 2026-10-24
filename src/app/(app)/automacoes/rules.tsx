"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Play, Plus, RotateCcw, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, SimpleSelect } from "@/components/form";
import type { RuleAction, RuleCondition, RuleParams } from "@/lib/db/schema";
import {
  CONDITION_FIELDS,
  OP_LABEL,
  RECIPIENTS,
  TEMPLATE_VARS,
  TRIGGERS,
  TRIGGER_BY_ID,
  describeAction,
  describeParams,
  isTrigger,
  type Subject,
  type TriggerId,
} from "@/lib/automations";
import { fmtDateTime } from "@/lib/format";
import { deleteRule, resetBuiltinRule, runNow, saveRule, setRuleEnabled } from "./actions";

export type RuleVM = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  trigger: string;
  enabled: boolean;
  builtin: boolean;
  params: RuleParams;
  conditions: RuleCondition[];
  actions: RuleAction[];
  runs30: number;
  lastRun: string | null;
};
type Person = { id: string; name: string };
type Stage = { id: number; name: string };

const subjectOf = (t: string): Subject => (isTrigger(t) ? TRIGGER_BY_ID[t].subject : "task");

export function RunNowButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      data-tour="auto-run"
      onClick={() =>
        start(async () => {
          const r = await runNow();
          if ("error" in r && r.error) toast.error(String(r.error));
          else toast.success(`Regras de tempo avaliadas: ${"fired" in r ? r.fired : 0} novas execuções`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Play />} Rodar agora
    </Button>
  );
}

export function RuleBoard({ rules, users, stages, canManage }: { rules: RuleVM[]; users: Person[]; stages: Stage[]; canManage: boolean }) {
  const [editing, setEditing] = useState<RuleVM | "new" | null>(null);
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const groups: { label: string; subject: Subject }[] = [
    { label: "Tarefas", subject: "task" },
    { label: "Leads e negócios", subject: "deal" },
    { label: "Editais de restauro", subject: "edital" },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          Regras no formato <strong className="font-medium text-foreground">Quando… e… então…</strong>. As regras prontas já vêm configuradas: ligue, desligue e ajuste os prazos. As de tempo rodam todo dia de manhã e também quando alguém abre o sistema. Cada fato gera um aviso só.
        </p>
        {canManage && (
          <Button onClick={() => setEditing("new")} data-tour="auto-new" className="max-md:h-11">
            <Plus /> Nova regra
          </Button>
        )}
      </div>

      {groups.map((g) => {
        const list = rules.filter((r) => subjectOf(r.trigger) === g.subject);
        return (
          <section key={g.subject} className="grid gap-2.5">
            <h2 className="label">{g.label}</h2>
            <div className="grid gap-2.5 lg:grid-cols-2">
              {list.map((r) => (
                <RuleCard key={r.id} rule={r} names={names} stages={stages} canManage={canManage} onEdit={() => setEditing(r)} />
              ))}
            </div>
          </section>
        );
      })}

      {editing && <RuleEditor key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? null : editing} users={users} stages={stages} canManage={canManage} onClose={() => setEditing(null)} />}
    </div>
  );
}

function conditionText(c: RuleCondition, names: Record<string, string>, stages: Stage[]) {
  const f = CONDITION_FIELDS.find((x) => x.id === c.field);
  const label = f?.label ?? c.field;
  const val = (v: unknown) => {
    const one = (x: string) => (f?.kind === "user" ? (names[x] ?? "?") : f?.kind === "stage" ? (stages.find((s) => String(s.id) === x)?.name ?? "?") : (f?.options?.find((o) => o.v === x)?.l ?? x));
    if (Array.isArray(v)) return v.map(String).map(one).join(" ou ");
    if (f?.kind === "points") return String(v);
    if (f?.kind === "number") return (Number(v) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    return one(String(v ?? ""));
  };
  return c.op === "empty" || c.op === "notempty" ? `${label.toLowerCase()} ${OP_LABEL[c.op]}` : `${label.toLowerCase()} ${OP_LABEL[c.op]} ${val(c.value)}`;
}

function RuleCard({ rule, names, stages, canManage, onEdit }: { rule: RuleVM; names: Record<string, string>; stages: Stage[]; canManage: boolean; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(rule.enabled);
  const def = isTrigger(rule.trigger) ? TRIGGER_BY_ID[rule.trigger] : null;
  const params = def ? describeParams(def.id, rule.params) : "";

  function toggle(v: boolean) {
    setOn(v);
    start(async () => {
      const r = await setRuleEnabled(rule.id, v);
      if (r && "error" in r && r.error) {
        setOn(!v);
        toast.error(String(r.error));
      } else router.refresh();
    });
  }

  return (
    <article className={cn("grid content-start gap-2.5 rounded-xl border bg-card p-4", !on && "bg-muted/30")} data-tour="auto-rule">
      <header className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", on ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground")}>
          <Zap className="size-4" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5 leading-snug">
          <h3 className="text-[14px] font-semibold break-words">
            {rule.name}
            {rule.builtin ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle text-xs font-normal text-muted-foreground">pronta</span> : null}
          </h3>
          {rule.description && <p className="text-[12.5px] text-muted-foreground">{rule.description}</p>}
        </div>
        <Switch checked={on} onCheckedChange={toggle} disabled={!canManage || pending} aria-label={`${on ? "Desligar" : "Ligar"} ${rule.name}`} className="mt-1" />
      </header>

      <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] leading-relaxed">
        <b className="font-semibold text-brand">Quando</b> {def?.when ?? rule.trigger}
        {params ? ` (${params})` : ""}
        {rule.conditions.length ? (
          <>
            {" "}
            <b className="font-semibold text-brand">e</b> {rule.conditions.map((c) => conditionText(c, names, stages)).join(" e ")}
          </>
        ) : null}
        {", "}
        <b className="font-semibold text-brand">então</b> {rule.actions.map((a) => describeAction(a, names)).join("; ")}.
      </p>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {rule.runs30} {rule.runs30 === 1 ? "execução" : "execuções"} em 30 dias{rule.lastRun ? ` · última ${fmtDateTime(rule.lastRun)}` : ""}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto max-md:h-10" onClick={onEdit}>
          <Pencil /> {canManage ? "Ajustar" : "Ver"}
        </Button>
      </footer>
    </article>
  );
}

/* --------------------------------- editor --------------------------------- */

type Draft = { name: string; description: string; trigger: TriggerId; enabled: boolean; params: RuleParams; conditions: RuleCondition[]; actions: RuleAction[] };

function initialDraft(rule: RuleVM | null): Draft {
  if (rule && isTrigger(rule.trigger)) {
    return { name: rule.name, description: rule.description ?? "", trigger: rule.trigger, enabled: rule.enabled, params: { ...TRIGGER_BY_ID[rule.trigger].defaults, ...rule.params }, conditions: rule.conditions, actions: rule.actions };
  }
  return { name: "", description: "", trigger: "task_overdue", enabled: true, params: { ...TRIGGER_BY_ID.task_overdue.defaults }, conditions: [], actions: [{ type: "notify", to: ["assignee"] }] };
}

const PARAM_LABEL: Partial<Record<TriggerId, { days?: string; hours?: string }>> = {
  task_overdue: { days: "Avisar a partir de quantos dias de atraso" },
  task_unassigned: { hours: "Sem responsável há (horas)" },
  deal_stalled: { days: "Parado na etapa há (dias)" },
  deal_no_activity: { days: "Sem atividade ou contato há (dias)" },
  deal_new_no_contact: { hours: "Sem primeiro contato após (horas)" },
  deal_high_value_stalled: { days: "Parado na etapa há (dias)" },
};

const num = (v: string) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== "" ? n : undefined;
};

function RuleEditor({ rule, users, stages, canManage, onClose }: { rule: RuleVM | null; users: Person[]; stages: Stage[]; canManage: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState<Draft>(() => initialDraft(rule));
  const locked = !canManage;
  const builtin = !!rule?.builtin;
  const def = TRIGGER_BY_ID[d.trigger];
  const subject = def.subject;
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setParams = (p: Partial<RuleParams>) => setD((x) => ({ ...x, params: { ...x.params, ...p } }));

  function changeTrigger(t: string) {
    if (!isTrigger(t)) return;
    const next = TRIGGER_BY_ID[t];
    // trocar de tarefa para negócio muda os destinatários possíveis: recomeça condições e ações compatíveis
    setD((x) => ({
      ...x,
      trigger: t,
      params: { ...next.defaults },
      conditions: next.subject === subjectOf(x.trigger) ? x.conditions : [],
      actions: next.subject === subjectOf(x.trigger) ? x.actions : [{ type: "notify", to: [next.subject === "task" ? "assignee" : next.subject === "edital" ? "team" : "owner"] }],
    }));
  }

  function submit() {
    start(async () => {
      const r = await saveRule(rule?.id ?? null, { ...d });
      if (r && "error" in r && r.error) toast.error(String(r.error));
      else {
        toast.success(rule ? "Regra salva" : "Regra criada");
        router.refresh();
        onClose();
      }
    });
  }
  function remove() {
    if (!rule || !window.confirm(`Excluir a regra “${rule.name}”?`)) return;
    start(async () => {
      const r = await deleteRule(rule.id);
      if (r && "error" in r && r.error) toast.error(String(r.error));
      else {
        toast.success("Regra excluída");
        router.refresh();
        onClose();
      }
    });
  }
  function restore() {
    if (!rule || !window.confirm("Voltar esta regra ao padrão do sistema?")) return;
    start(async () => {
      const r = await resetBuiltinRule(rule.id);
      if (r && "error" in r && r.error) toast.error(String(r.error));
      else {
        toast.success("Padrão restaurado");
        router.refresh();
        onClose();
      }
    });
  }

  const triggerOptions = TRIGGERS.map((t) => ({ value: t.id, label: `${t.subject === "task" ? "Tarefa" : t.subject === "edital" ? "Edital" : "Negócio"} · ${t.label}${t.kind === "time" ? " (por tempo)" : ""}` }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-2xl" data-tour="auto-editor">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-semibold">{rule ? (locked ? "Regra" : "Ajustar regra") : "Nova regra"}</DialogTitle>
          <DialogDescription className="text-[13px]">Monte o raciocínio em três passos: quando acontece, em que condições e o que fazer.</DialogDescription>
        </DialogHeader>

        <div className={cn("grid gap-5 px-5 py-4", locked && "pointer-events-none opacity-80")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome da regra" htmlFor="r-name">
              <Input id="r-name" value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="Ex.: Tarefa urgente atrasada" />
            </Field>
            <label className="flex items-center gap-3 self-end rounded-lg border px-3 py-2 sm:mb-0.5">
              <Switch checked={d.enabled} onCheckedChange={(v) => set("enabled", v)} />
              <span className="text-[13px] font-medium">Regra ligada</span>
            </label>
          </div>

          {/* QUANDO */}
          <Step n="Quando…">
            <Field label="Gatilho" htmlFor="r-trigger" hint={builtin ? "O gatilho das regras prontas não muda. Crie uma regra nova para outro gatilho." : undefined}>
              <SimpleSelect id="r-trigger" value={d.trigger} onValueChange={changeTrigger} options={triggerOptions} className={builtin ? "pointer-events-none opacity-60" : undefined} />
            </Field>
            <ParamFields trigger={d.trigger} params={d.params} setParams={setParams} stages={stages} />
          </Step>

          {/* E */}
          <Step n="E… (opcional)">
            <ConditionEditor subject={subject} list={d.conditions} onChange={(c) => set("conditions", c)} users={users} stages={stages} />
          </Step>

          {/* ENTÃO */}
          <Step n="Então…">
            <ActionEditor subject={subject} list={d.actions} onChange={(a) => set("actions", a)} users={users} names={names} />
          </Step>
        </div>

        <DialogFooter className="mx-0! mb-0! flex-row flex-wrap items-center gap-2 rounded-b-xl border-t px-5 py-3 sm:justify-between">
          <div className="flex gap-1">
            {canManage && rule && !rule.builtin && (
              <Button variant="ghost" size="sm" className="text-destructive max-md:h-10" onClick={remove} disabled={pending}>
                <Trash2 /> Excluir
              </Button>
            )}
            {canManage && rule?.builtin && (
              <Button variant="ghost" size="sm" className="max-md:h-10" onClick={restore} disabled={pending}>
                <RotateCcw /> Restaurar padrão
              </Button>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="max-md:h-11" onClick={onClose}>
              {canManage ? "Cancelar" : "Fechar"}
            </Button>
            {canManage && (
              <Button onClick={submit} disabled={pending} className="max-md:h-11">
                {pending && <Loader2 className="animate-spin" />} Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border p-3.5">
      <h3 className="text-[13px] font-semibold text-brand">{n}</h3>
      {children}
    </section>
  );
}

function ParamFields({ trigger, params, setParams, stages }: { trigger: TriggerId; params: RuleParams; setParams: (p: Partial<RuleParams>) => void; stages: Stage[] }) {
  const def = TRIGGER_BY_ID[trigger];
  const lab = PARAM_LABEL[trigger] ?? {};
  const [before, setBefore] = useState((params.daysBefore ?? def.defaults.daysBefore ?? []).join(", "));
  const [showStage, setShowStage] = useState(!!params.stageDays && Object.keys(params.stageDays).length > 0);
  return (
    <div className="grid gap-3">
      {def.params.includes("days") && (
        <Field label={lab.days ?? "Dias"} htmlFor="p-days">
          <Input id="p-days" type="number" min={1} max={365} inputMode="numeric" value={params.days ?? ""} onChange={(e) => setParams({ days: num(e.target.value) })} className="sm:w-40" />
        </Field>
      )}
      {def.params.includes("hours") && (
        <Field label={lab.hours ?? "Horas"} htmlFor="p-hours">
          <Input id="p-hours" type="number" min={1} inputMode="numeric" value={params.hours ?? ""} onChange={(e) => setParams({ hours: num(e.target.value) })} className="sm:w-40" />
        </Field>
      )}
      {def.params.includes("daysBefore") && (
        <Field label="Avisar quantos dias antes" htmlFor="p-before" hint="Separe por vírgula. 0 = no próprio dia. Ex.: 3, 1, 0">
          <Input
            id="p-before"
            value={before}
            inputMode="numeric"
            onChange={(e) => {
              setBefore(e.target.value);
              setParams({ daysBefore: e.target.value.split(/[,\s;]+/).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 60) });
            }}
            className="sm:w-56"
          />
        </Field>
      )}
      {def.params.includes("minValueCents") && (
        <Field label="Valor mínimo do negócio (R$)" htmlFor="p-value">
          <Input id="p-value" type="number" min={0} inputMode="numeric" value={params.minValueCents !== undefined ? Math.round(params.minValueCents / 100) : ""} onChange={(e) => setParams({ minValueCents: num(e.target.value) !== undefined ? num(e.target.value)! * 100 : undefined })} className="sm:w-56" />
        </Field>
      )}
      {def.params.includes("stageIds") && (
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">Vale para quais etapas?</span>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!params.stageIds?.length} onClick={() => setParams({ stageIds: [] })}>
              Todas
            </Chip>
            {stages.map((s) => (
              <Chip
                key={s.id}
                active={!!params.stageIds?.includes(s.id)}
                onClick={() => setParams({ stageIds: params.stageIds?.includes(s.id) ? params.stageIds.filter((x) => x !== s.id) : [...(params.stageIds ?? []), s.id] })}
              >
                {s.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {def.params.includes("stageDays") && (
        <div className="grid gap-2">
          <button type="button" className="w-fit text-[13px] text-brand underline-offset-2 hover:underline max-md:py-2" onClick={() => setShowStage(!showStage)}>
            {showStage ? "Ocultar prazos por etapa" : "Definir prazo diferente por etapa"}
          </button>
          {showStage && (
            <div className="grid gap-2 rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Deixe em branco para usar o prazo padrão ({params.days ?? def.defaults.days} dias).</p>
              {stages.map((s) => (
                <label key={s.id} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-[13px]">
                  <span className="truncate">{s.name}</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    inputMode="numeric"
                    placeholder="dias"
                    value={params.stageDays?.[String(s.id)] ?? ""}
                    onChange={(e) => {
                      const next = { ...(params.stageDays ?? {}) };
                      const n = num(e.target.value);
                      if (n) next[String(s.id)] = n;
                      else delete next[String(s.id)];
                      setParams({ stageDays: next });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {!def.params.length && <p className="text-[12.5px] text-muted-foreground">Dispara na hora, assim que {def.when.replace(/^(uma|um|alguém|chegar)\s/, "")}.</p>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-full border px-3 py-1.5 text-[13px] max-md:min-h-10", active ? "border-brand bg-brand-soft font-medium text-brand" : "text-muted-foreground hover:border-foreground/30")}
    >
      {children}
    </button>
  );
}

/* -------------------------------- condições -------------------------------- */

function ConditionEditor({ subject, list, onChange, users, stages }: { subject: Subject; list: RuleCondition[]; onChange: (c: RuleCondition[]) => void; users: Person[]; stages: Stage[] }) {
  const fields = CONDITION_FIELDS.filter((f) => f.subject === subject);
  const upd = (i: number, patch: Partial<RuleCondition>) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="grid gap-2.5">
      {list.length === 0 && <p className="text-[12.5px] text-muted-foreground">Sem condições: vale para qualquer {subject === "task" ? "tarefa" : subject === "edital" ? "edital" : "negócio"}. Adicione para restringir (ex.: só prioridade alta).</p>}
      {list.map((c, i) => {
        const f = fields.find((x) => x.id === c.field) ?? fields[0];
        const needsValue = c.op !== "empty" && c.op !== "notempty";
        return (
          <div key={i} className="grid gap-2 rounded-lg bg-muted/40 p-2.5 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-start">
            <SimpleSelect
              value={c.field}
              onValueChange={(v) => {
                const nf = fields.find((x) => x.id === v)!;
                upd(i, { field: v, op: nf.ops[0], value: undefined });
              }}
              options={fields.map((x) => ({ value: x.id, label: x.label }))}
            />
            <SimpleSelect value={c.op} onValueChange={(v) => upd(i, { op: v as RuleCondition["op"], value: v === "in" ? [] : undefined })} options={f.ops.map((o) => ({ value: o, label: OP_LABEL[o] }))} />
            {needsValue ? <ValueInput field={f} cond={c} onChange={(value) => upd(i, { value })} users={users} stages={stages} /> : <span />}
            <Button type="button" variant="ghost" size="icon" aria-label="Remover condição" onClick={() => onChange(list.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        );
      })}
      {list.length < 5 && (
        <Button type="button" variant="outline" size="sm" className="w-fit max-md:h-10" onClick={() => onChange([...list, { field: fields[0].id, op: fields[0].ops[0] }])}>
          <Plus /> Adicionar condição
        </Button>
      )}
    </div>
  );
}

function ValueInput({ field, cond, onChange, users, stages }: { field: (typeof CONDITION_FIELDS)[number]; cond: RuleCondition; onChange: (v: RuleCondition["value"]) => void; users: Person[]; stages: Stage[] }) {
  const opts =
    field.kind === "enum"
      ? (field.options ?? []).map((o) => ({ value: o.v, label: o.l }))
      : field.kind === "stage"
        ? stages.map((s) => ({ value: String(s.id), label: s.name }))
        : field.kind === "user"
          ? users.map((u) => ({ value: u.id, label: u.name }))
          : [];
  if (cond.op === "in" && opts.length) {
    const cur = Array.isArray(cond.value) ? cond.value.map(String) : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <Chip key={o.value} active={cur.includes(o.value)} onClick={() => onChange(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])}>
            {o.label}
          </Chip>
        ))}
      </div>
    );
  }
  if (opts.length) return <SimpleSelect value={String(cond.value ?? "")} onValueChange={onChange} options={opts} placeholder="Escolha" />;
  if (field.kind === "points") return <Input type="number" inputMode="numeric" min={0} max={100} placeholder="0 a 100" value={cond.value !== undefined && cond.value !== "" ? Number(cond.value) : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
  if (field.kind === "number")
    return <Input type="number" inputMode="numeric" min={0} placeholder="R$" value={cond.value !== undefined && cond.value !== "" ? Math.round(Number(cond.value) / 100) : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value) * 100)} />;
  return <Input value={String(cond.value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="Texto" maxLength={80} />;
}

/* ---------------------------------- ações ---------------------------------- */

const ACTION_TYPES: { v: RuleAction["type"]; l: string; taskOnly?: boolean }[] = [
  { v: "notify", l: "Avisar pessoas" },
  { v: "set_status", l: "Mudar a situação", taskOnly: true },
  { v: "set_priority", l: "Mudar a prioridade", taskOnly: true },
  { v: "assign", l: "Atribuir responsável" },
  { v: "create_followup", l: "Criar tarefa de follow-up" },
  { v: "add_label", l: "Adicionar etiqueta", taskOnly: true },
];

function ActionEditor({ subject, list, onChange, users, names }: { subject: Subject; list: RuleAction[]; onChange: (a: RuleAction[]) => void; users: Person[]; names: Record<string, string> }) {
  const types = ACTION_TYPES.filter((t) => !t.taskOnly || subject === "task");
  const upd = (i: number, a: RuleAction) => onChange(list.map((x, j) => (j === i ? a : x)));
  const tokens = RECIPIENTS.filter((r) => r.subjects.includes(subject));
  const oneOptions = [
    ...tokens.filter((t) => t.token !== "participants" && t.token !== "mentioned" && t.token !== "admins").map((t) => ({ value: t.token, label: t.label })),
    ...users.map((u) => ({ value: `user:${u.id}`, label: u.name })),
  ];

  function blank(type: RuleAction["type"]): RuleAction {
    const mine = subject === "task" ? "assignee" : subject === "edital" ? "editalOwner" : "owner";
    switch (type) {
      case "notify": return { type, to: [mine] };
      case "set_status": return { type, status: "em_andamento" };
      case "set_priority": return { type, priority: "alta" };
      case "assign": return { type, to: "managers" };
      case "add_label": return { type, label: "atenção" };
      case "create_followup": return { type, title: subject === "task" ? "Acompanhar — {tarefa}" : subject === "edital" ? "Analisar edital — {edital}" : "Retomar contato — {negocio}", inDays: 1, to: mine };
    }
  }

  return (
    <div className="grid gap-2.5">
      {list.map((a, i) => (
        <div key={i} className="grid gap-2.5 rounded-lg bg-muted/40 p-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SimpleSelect value={a.type} onValueChange={(v) => upd(i, blank(v as RuleAction["type"]))} options={types.map((t) => ({ value: t.v, label: t.l }))} />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Remover ação" onClick={() => onChange(list.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
          {a.type === "notify" && <NotifyFields a={a} onChange={(x) => upd(i, x)} tokens={tokens} users={users} />}
          {a.type === "set_status" && (
            <SimpleSelect value={a.status} onValueChange={(v) => upd(i, { type: "set_status", status: v as never })} options={[{ value: "a_fazer", label: "A fazer" }, { value: "em_andamento", label: "Em andamento" }, { value: "travada", label: "Travada" }, { value: "concluida", label: "Concluída" }]} />
          )}
          {a.type === "set_priority" && (
            <SimpleSelect value={a.priority} onValueChange={(v) => upd(i, { type: "set_priority", priority: v as never })} options={[{ value: "baixa", label: "Baixa" }, { value: "media", label: "Média" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]} />
          )}
          {a.type === "assign" && (
            <Field label="Atribuir a">
              <SimpleSelect value={a.to} onValueChange={(v) => upd(i, { type: "assign", to: v })} options={[...oneOptions, { value: "actor", label: "Quem fez a ação" }]} />
            </Field>
          )}
          {a.type === "add_label" && (
            <Field label="Etiqueta">
              <Input value={a.label} onChange={(e) => upd(i, { type: "add_label", label: e.target.value })} maxLength={30} />
            </Field>
          )}
          {a.type === "create_followup" && (
            <div className="grid gap-2.5">
              <Field label="Título da tarefa" hint={`Variáveis: ${TEMPLATE_VARS.map((v) => `{${v}}`).join(" ")}`}>
                <Input value={a.title} onChange={(e) => upd(i, { ...a, title: e.target.value })} maxLength={200} />
              </Field>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Prazo (dias a partir de hoje)">
                  <Input type="number" min={0} max={365} inputMode="numeric" value={a.inDays} onChange={(e) => upd(i, { ...a, inDays: num(e.target.value) ?? 0 })} />
                </Field>
                <Field label="Responsável">
                  <SimpleSelect value={a.to} onValueChange={(v) => upd(i, { ...a, to: v })} options={oneOptions} />
                </Field>
              </div>
            </div>
          )}
        </div>
      ))}
      {list.length < 6 && (
        <Button type="button" variant="outline" size="sm" className="w-fit max-md:h-10" onClick={() => onChange([...list, blank("notify")])}>
          <Plus /> Adicionar ação
        </Button>
      )}
      {list.some((a) => a.type === "assign" && a.to.startsWith("user:")) && <p className="text-xs text-muted-foreground">Atribuindo a: {list.map((a) => (a.type === "assign" && a.to.startsWith("user:") ? names[a.to.slice(5)] : null)).filter(Boolean).join(", ")}</p>}
    </div>
  );
}

function NotifyFields({ a, onChange, tokens, users }: { a: Extract<RuleAction, { type: "notify" }>; onChange: (a: RuleAction) => void; tokens: typeof RECIPIENTS; users: Person[] }) {
  const [custom, setCustom] = useState(!!a.title || !!a.body);
  const toggle = (t: string) => onChange({ ...a, to: a.to.includes(t) ? a.to.filter((x) => x !== t) : [...a.to, t] });
  const specific = a.to.filter((t) => t.startsWith("user:"));
  return (
    <div className="grid gap-2.5">
      <div className="grid gap-1.5">
        <span className="text-[13px] font-medium">Quem recebe o aviso</span>
        <div className="flex flex-wrap gap-1.5">
          {tokens.map((t) => (
            <Chip key={t.token} active={a.to.includes(t.token)} onClick={() => toggle(t.token)}>
              {t.label}
            </Chip>
          ))}
          {specific.map((t) => (
            <Chip key={t} active onClick={() => toggle(t)}>
              {users.find((u) => `user:${u.id}` === t)?.name ?? "Pessoa"} ✕
            </Chip>
          ))}
        </div>
        <SimpleSelect
          value="__none"
          allowNone
          noneLabel="+ Avisar uma pessoa específica"
          onValueChange={(v) => v && v !== "__none" && !a.to.includes(v) && onChange({ ...a, to: [...a.to, v] })}
          options={users.filter((u) => !a.to.includes(`user:${u.id}`)).map((u) => ({ value: `user:${u.id}`, label: u.name }))}
        />
      </div>
      <button type="button" className="w-fit text-[13px] text-brand underline-offset-2 hover:underline max-md:py-2" onClick={() => setCustom(!custom)}>
        {custom ? "Usar a mensagem padrão" : "Personalizar a mensagem"}
      </button>
      {custom && (
        <div className="grid gap-2.5">
          <Field label="Título" hint={`Variáveis: ${TEMPLATE_VARS.map((v) => `{${v}}`).join(" ")}`}>
            <Input value={a.title ?? ""} onChange={(e) => onChange({ ...a, title: e.target.value })} maxLength={160} placeholder="Deixe vazio para usar o padrão" />
          </Field>
          <Field label="Texto">
            <Input value={a.body ?? ""} onChange={(e) => onChange({ ...a, body: e.target.value })} maxLength={400} placeholder="Opcional" />
          </Field>
        </div>
      )}
    </div>
  );
}
