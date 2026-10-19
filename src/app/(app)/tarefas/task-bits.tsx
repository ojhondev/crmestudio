"use client";

/** Peças pequenas e compartilhadas das telas de Tarefas (seletores, chips, preferências por quadro). */
import { useCallback, useSyncExternalStore } from "react";
import { CalendarDays, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, initials, isoDateBR, todayISO } from "@/lib/format";
import type { TaskColumn, TaskPriority, TaskStatus } from "@/lib/db/schema";
import { PRIORITY_LABEL, STATUS_LABEL, labelColor, type GroupBy, type SortKey, type TaskDTO } from "@/lib/tasks";
import type { TaskPatch } from "./actions";

export type User = { id: string; name: string };
export type Patch = (id: string, p: TaskPatch) => void;

export const STATUS: Record<TaskStatus, { label: string; color: string }> = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([k, [label, color]]) => [k, { label, color }]),
) as Record<TaskStatus, { label: string; color: string }>;
export const STATUS_KEYS = Object.keys(STATUS) as TaskStatus[];
export const PRIORITY: Record<TaskPriority, { label: string; color: string }> = Object.fromEntries(
  Object.entries(PRIORITY_LABEL).map(([k, [label, color]]) => [k, { label, color }]),
) as Record<TaskPriority, { label: string; color: string }>;

export function Pill({ value, options, onChange, disabled, label, wide }: { value: string; options: Record<string, { label: string; color: string }>; onChange: (v: string) => void; disabled?: boolean; label: string; wide?: boolean }) {
  const cur = options[value];
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-7 max-md:h-11 cursor-pointer appearance-none rounded-md px-2.5 text-center text-[12px] font-semibold text-on-st max-md:text-base outline-none disabled:cursor-default", wide ? "min-w-28" : "min-w-20")}
        style={{ background: cur.color }}
      >
        {Object.entries(options).map(([k, o]) => (
          <option key={k} value={k} style={{ color: "#1a1a1a", background: "#fff" }}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export const Person = ({ id, users, size = "md" }: { id: string | null; users: User[]; size?: "sm" | "md" }) => {
  const u = users.find((x) => x.id === id);
  const box = size === "sm" ? "size-5 text-[10px]" : "size-6 text-xs";
  return u ? (
    <span className={cn("grid place-items-center rounded-full bg-primary font-semibold text-primary-foreground", box)} title={u.name}>
      {initials(u.name)}
    </span>
  ) : (
    <span className={cn("grid place-items-center rounded-full border border-dashed text-muted-foreground", box)} title="Sem responsável">
      <UserRound className="size-3" />
    </span>
  );
};

export function dueState(t: Pick<TaskDTO, "dueAt" | "status">) {
  if (!t.dueAt) return "none";
  if (t.status === "concluida") return "done";
  const d = isoDateBR(new Date(t.dueAt));
  const today = todayISO();
  return d < today ? "late" : d === today ? "today" : "later";
}

export function DueInput({ t, onChange, disabled }: { t: TaskDTO; onChange: (v: string | null) => void; disabled?: boolean }) {
  const st = dueState(t);
  return (
    <label className={cn("relative inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] max-md:h-11 max-md:text-[13px]", st === "late" && "border-destructive bg-destructive/10 font-medium text-destructive", st === "today" && "border-brand bg-brand-soft font-medium")}>
      <CalendarDays className="size-3 shrink-0" />
      <span className="whitespace-nowrap">{t.dueAt ? `${fmtDate(t.dueAt, "dd/MM")}${st === "late" ? " · atrasada" : st === "today" ? " · hoje" : ""}` : "Prazo"}</span>
      <input
        type="date"
        aria-label="Prazo"
        disabled={disabled}
        value={t.dueAt ? isoDateBR(new Date(t.dueAt)) : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default max-md:text-base"
      />
    </label>
  );
}

export function Assignee({ t, users, onChange, disabled }: { t: TaskDTO; users: User[]; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <label className="relative inline-flex h-7 items-center gap-1.5 rounded-md border px-1.5 text-[12px] max-md:h-11 max-md:text-[13px]">
      <Person id={t.assigneeId} users={users} />
      <span className="max-w-24 truncate">{users.find((u) => u.id === t.assigneeId)?.name.split(" ")[0] ?? "Atribuir"}</span>
      <select aria-label="Responsável" disabled={disabled} value={t.assigneeId ?? ""} onChange={(e) => onChange(e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default max-md:text-base">
        <option value="">Sem responsável</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LabelChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-32 items-center gap-1 truncate rounded px-1.5 py-px text-[11px] leading-4 font-semibold text-white" style={{ background: labelColor(label) }}>
      <span className="truncate">{label}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remover etiqueta ${label}`} className="relative -mr-0.5 rounded px-0.5 after:absolute after:-inset-3 after:content-[''] hover:bg-white/25">
          ×
        </button>
      )}
    </span>
  );
}

export function SubtaskProgress({ t }: { t: Pick<TaskDTO, "subtasks"> }) {
  if (!t.subtasks.length) return null;
  const done = t.subtasks.filter((s) => s.done).length;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11.5px] tabular-nums", done === t.subtasks.length ? "font-medium text-success" : "text-muted-foreground")} title="Checklist">
      ☑ {done}/{t.subtasks.length}
    </span>
  );
}

/* ----------------------------- valor de coluna personalizada ----------------------------- */

export function CustomCell({ col, value, users, disabled, onChange }: { col: TaskColumn; value: unknown; users: User[]; disabled?: boolean; onChange: (v: unknown) => void }) {
  const base = "h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 text-[12.5px] hover:border-input focus:border-ring focus:outline-none disabled:opacity-100 max-md:h-11 max-md:border-input max-md:text-base";
  switch (col.type) {
    case "texto":
      return <TextCell key={String(value ?? "")} initial={String(value ?? "")} className={base} disabled={disabled} label={col.name} onCommit={onChange} />;
    case "numero":
      return <TextCell key={String(value ?? "")} initial={value === undefined || value === null ? "" : String(value).replace(".", ",")} className={cn(base, "text-right tabular-nums")} disabled={disabled} label={col.name} inputMode="decimal" onCommit={onChange} />;
    case "link":
      return (
        <span className="flex min-w-0 items-center gap-1">
          <TextCell key={String(value ?? "")} initial={String(value ?? "")} className={base} disabled={disabled} label={col.name} onCommit={onChange} />
          {typeof value === "string" && value && (
            <a href={value} target="_blank" rel="noreferrer" className="shrink-0 text-[12px] text-brand underline-offset-2 hover:underline max-md:px-2 max-md:py-3" aria-label={`Abrir ${col.name}`}>
              abrir
            </a>
          )}
        </span>
      );
    case "data":
      return <input type="date" aria-label={col.name} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} className={base} />;
    case "selecao":
      return (
        <select aria-label={col.name} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} className={cn(base, "cursor-pointer")}>
          <option value="">—</option>
          {col.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "pessoa":
      return (
        <select aria-label={col.name} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} className={cn(base, "cursor-pointer")}>
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      );
    case "caixa":
      return (
        <label className="grid place-items-center max-md:size-11 max-md:justify-start">
          <input type="checkbox" aria-label={col.name} disabled={disabled} checked={value === true} onChange={(e) => onChange(e.target.checked ? true : null)} className="size-4 accent-brand max-md:size-6" />
        </label>
      );
  }
}

function TextCell({ initial, className, disabled, label, inputMode, onCommit }: { initial: string; className: string; disabled?: boolean; label: string; inputMode?: "decimal"; onCommit: (v: string) => void }) {
  return (
    <input
      aria-label={label}
      defaultValue={initial}
      disabled={disabled}
      inputMode={inputMode}
      className={className}
      onBlur={(e) => e.currentTarget.value !== initial && onCommit(e.currentTarget.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/* --------------------------- preferências de visão por quadro --------------------------- */

export type View = "tabela" | "lista" | "kanban" | "calendario" | "linha";
export type Prefs = { view: View; groupBy: GroupBy; sort: SortKey; kGroup: "situacao" | "responsavel" | "prioridade"; hideDone: boolean; calMode: "mes" | "semana" };
export const DEFAULT_PREFS: Prefs = { view: "tabela", groupBy: "grupo", sort: "manual", kGroup: "situacao", hideDone: false, calMode: "mes" };

const EVENT = "restaura-tarefas-prefs";
const keyOf = (boardKey: string) => `restaura-tarefas:${boardKey}`;

/** cópia em memória: a visão continua funcionando mesmo se o navegador bloquear o localStorage */
const memory = new Map<string, string>();

function read(boardKey: string): string {
  const mem = memory.get(boardKey);
  if (mem !== undefined) return mem;
  try {
    return window.localStorage.getItem(keyOf(boardKey)) ?? "";
  } catch {
    return "";
  }
}

/** Preferências lembradas por quadro (localStorage, sempre com try/catch). Seguro para SSR. */
export function usePrefs(boardKey: string, initial?: Partial<Prefs>): [Prefs, (p: Partial<Prefs>) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVENT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => read(boardKey), () => "");
  let stored: Partial<Prefs> = {};
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch {}
  const prefs: Prefs = { ...DEFAULT_PREFS, ...initial, ...stored };
  const set = useCallback(
    (p: Partial<Prefs>) => {
      let next = "";
      try {
        next = JSON.stringify({ ...JSON.parse(read(boardKey) || "{}"), ...p });
      } catch {
        next = JSON.stringify(p);
      }
      memory.set(boardKey, next);
      try {
        window.localStorage.setItem(keyOf(boardKey), next);
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [boardKey],
  );
  return [prefs, set];
}
