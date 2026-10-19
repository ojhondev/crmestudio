"use client";

/** Visões do quadro de tarefas: Tabela/Lista (com arrastar para ordenar), Kanban, Calendário e Linha do tempo. */
import { useState } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, GripVertical, Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDate, isoDateBR, todayISO } from "@/lib/format";
import type { TaskColumn, TaskGroup } from "@/lib/db/schema";
import { addDays, addMonths, diffDays, monthGrid, positionBetween, startOfWeek, timelineBar, weekGrid, type Section, type TaskDTO } from "@/lib/tasks";
import { Assignee, CustomCell, DueInput, LabelChip, PRIORITY, Person, Pill, STATUS, SubtaskProgress, dueState, type Patch, type User } from "./task-bits";

const toDay = (iso: string) => isoDateBR(new Date(iso));
const useDndSensors = () => useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));

/* =============================== Tabela / Lista =============================== */

type TableProps = {
  sections: Section[];
  groups: TaskGroup[];
  /** true = seções são os grupos reais do quadro (aceita adicionar, renomear, arrastar) */
  realGroups: boolean;
  /** true = ordenação manual (arrastar permitido) */
  manual: boolean;
  compact: boolean;
  columns: TaskColumn[];
  users: User[];
  canEdit: boolean;
  canManage: boolean;
  patch: Patch;
  openTask: (id: string) => void;
  selected: Set<string>;
  select: (ids: string[], on: boolean) => void;
  totals: Record<string, number>;
  onAdd: (groupId: string, title: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string, name: string) => void;
  onDuplicateGroup: (id: string) => void;
  onMove: (id: string, groupId: string, position: number) => void;
  onEditColumns: () => void;
};

export function TableView(p: TableProps) {
  const sensors = useDndSensors();
  const [active, setActive] = useState<TaskDTO | null>(null);
  const draggable = p.canEdit && p.realGroups && p.manual;
  const cols = p.compact
    ? "44px minmax(0,1fr) 40px 104px 120px 96px"
    : `44px minmax(220px,1fr) 150px 120px 130px 160px ${p.columns.map(() => "150px").join(" ")} ${p.columns.length || p.canEdit ? "44px" : ""}`.trim();
  const minW = p.compact ? 560 : 44 + 220 + 150 + 120 + 130 + 160 + p.columns.length * 150 + 44 + 24;

  function onEnd(e: DragEndEvent) {
    setActive(null);
    const id = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const dragged = p.sections.flatMap((s) => s.tasks).find((t) => t.id === id);
    if (!dragged) return;
    if (over.startsWith("row-")) {
      const targetId = over.slice(4);
      if (targetId === id) return;
      const sec = p.sections.find((s) => s.tasks.some((t) => t.id === targetId));
      if (!sec) return;
      const list = sec.tasks.filter((t) => t.id !== id);
      const idx = list.findIndex((t) => t.id === targetId);
      p.onMove(id, sec.key, positionBetween(list[idx - 1]?.position, list[idx]?.position));
    } else if (over.startsWith("grp-")) {
      const key = over.slice(4);
      const sec = p.sections.find((s) => s.key === key);
      if (!sec) return;
      const list = sec.tasks.filter((t) => t.id !== id);
      p.onMove(id, key, positionBetween(list.at(-1)?.position, undefined));
    }
  }

  const sections = p.realGroups ? p.sections : p.sections.filter((s) => s.tasks.length);
  return (
    <DndContext id="tasks-table" sensors={sensors} onDragStart={(e) => setActive(p.sections.flatMap((s) => s.tasks).find((t) => t.id === String(e.active.id)) ?? null)} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div data-tour="task-groups" className="thin-scroll overflow-x-auto pb-2">
        <div className="grid gap-4" style={{ "--cols": cols, minWidth: undefined } as React.CSSProperties}>
          {sections.map((s) => (
            <SectionBlock key={s.key} s={s} p={p} minW={minW} draggable={draggable} group={p.groups.find((g) => g.id === s.key)} />
          ))}
          {sections.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">Nenhuma tarefa com esses filtros.</p>}
        </div>
      </div>
      <DragOverlay>{active && <div className="rounded-lg border bg-card px-3 py-2 text-[13.5px] font-medium shadow-lg">{active.title}</div>}</DragOverlay>
    </DndContext>
  );
}

function SectionBlock({ s, p, minW, draggable, group }: { s: Section; p: TableProps; minW: number; draggable: boolean; group?: TaskGroup }) {
  const [collapsed, setCollapsed] = useState(false);
  const [name, setName] = useState(group?.name ?? s.label);
  const [title, setTitle] = useState("");
  const { setNodeRef: setDropRef, isOver: dropOver } = useDroppable({ id: `grp-${s.key}`, disabled: !draggable });
  const done = s.tasks.filter((t) => t.status === "concluida").length;
  const allSel = s.tasks.length > 0 && s.tasks.every((t) => p.selected.has(t.id));
  const real = p.realGroups && !!group;
  return (
    <section ref={setDropRef} className={cn("rounded-xl border bg-card", dropOver && "ring-2 ring-brand")} style={{ borderLeft: `5px solid ${s.color}`, minWidth: minW }}>
      <header className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? "Expandir grupo" : "Recolher grupo"} className="grid size-6 place-items-center rounded hover:bg-muted max-md:size-10">
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {real && p.canEdit ? (
          <input
            aria-label="Nome do grupo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== group.name && p.onRenameGroup(group.id, name)}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className="h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[15px] font-semibold hover:border-input focus:border-ring focus:outline-none max-md:h-10"
            style={{ color: s.color }}
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold" style={{ color: s.color }}>
            {s.label}
          </h3>
        )}
        <span className="text-[12px] text-muted-foreground max-md:hidden">
          {done}/{p.totals[s.key] ?? s.tasks.length} concluídas
        </span>
        {real && p.canEdit && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Duplicar grupo" title="Duplicar grupo com as tarefas" onClick={() => p.onDuplicateGroup(group.id)} className="text-muted-foreground">
            <Copy />
          </Button>
        )}
        {real && p.canManage && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Excluir grupo" onClick={() => p.onDeleteGroup(group.id, group.name)} className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        )}
      </header>
      {!collapsed && (
        <>
          {!p.compact && (
            <div className="hidden gap-3 border-y bg-muted/60 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[var(--cols)]">
              <span className="flex items-center gap-1.5 pl-5">
                {p.canEdit && <input type="checkbox" aria-label="Selecionar todas do grupo" checked={allSel} onChange={(e) => p.select(s.tasks.map((t) => t.id), e.target.checked)} className="size-4 accent-brand" />}
              </span>
              <span>Tarefa</span>
              <span>Responsável</span>
              <span>Prazo</span>
              <span>Situação</span>
              <span>Prioridade</span>
              {p.columns.map((c) => (
                <span key={c.id} className="truncate" title={c.name}>
                  {c.name}
                </span>
              ))}
              {(p.columns.length > 0 || p.canEdit) && (
                <button type="button" onClick={p.onEditColumns} className="grid size-6 place-items-center rounded hover:bg-muted" aria-label="Colunas do quadro" title="Adicionar ou remover colunas">
                  <Plus className="size-4" />
                </button>
              )}
            </div>
          )}
          <ul>
            {s.tasks.map((t) => (
              <Row key={t.id} t={t} p={p} draggable={draggable} />
            ))}
          </ul>
          {s.tasks.length === 0 && <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhuma tarefa neste grupo.</p>}
          {real && p.canEdit && (
            <form
              className="flex items-center gap-2 border-t px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                p.onAdd(s.key, title);
                setTitle("");
              }}
            >
              <Plus className="size-4 text-muted-foreground" />
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adicionar tarefa — digite e tecle Enter" aria-label={`Nova tarefa em ${s.label}`} className="h-8 min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-muted-foreground focus:outline-none max-md:h-10" />
            </form>
          )}
        </>
      )}
    </section>
  );
}

function Row({ t, p, draggable }: { t: TaskDTO; p: TableProps; draggable: boolean }) {
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id: t.id, disabled: !draggable });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `row-${t.id}`, disabled: !draggable });
  const [title, setTitle] = useState(t.title);
  const [seen, setSeen] = useState(t.title);
  if (t.title !== seen) {
    setSeen(t.title);
    setTitle(t.title);
  }
  const done = t.status === "concluida";
  const sel = p.selected.has(t.id);
  return (
    <li
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
      }}
      className={cn(
        "grid gap-2 border-b px-3 last:border-b-0 hover:bg-muted/40 md:grid-cols-[var(--cols)] md:items-center md:gap-3",
        p.compact ? "py-1" : "py-2",
        sel && "bg-brand-soft/60 hover:bg-brand-soft/60",
        isDragging && "opacity-40",
        isOver && !isDragging && "shadow-[inset_0_2px_0_0_var(--brand)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 md:contents">
        <span className="flex items-center gap-1">
          {draggable ? (
            <button type="button" {...listeners} {...attributes} aria-label="Arrastar para reordenar" className="grid size-5 cursor-grab place-items-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing max-md:hidden">
              <GripVertical className="size-4" />
            </button>
          ) : (
            <span className="w-5 max-md:hidden" />
          )}
          {p.canEdit ? <input type="checkbox" aria-label={`Selecionar ${t.title}`} checked={sel} onChange={(e) => p.select([t.id], e.target.checked)} className="size-4 accent-brand" /> : <span className="w-4" />}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            disabled={!p.canEdit}
            onClick={() => p.patch(t.id, { status: done ? "a_fazer" : "concluida" })}
            aria-label={done ? "Reabrir tarefa" : "Marcar como concluída"}
            className={cn("relative grid size-5 shrink-0 place-items-center rounded-full border-2 after:absolute after:-inset-2.5 after:content-['']", done ? "border-[var(--st-done)] bg-[var(--st-done)] text-on-st" : "border-muted-foreground/60 hover:border-[var(--st-done)]")}
          >
            {done && <Check className="size-3" strokeWidth={3} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                aria-label="Título da tarefa"
                value={title}
                disabled={!p.canEdit}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== t.title && p.patch(t.id, { title })}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                className={cn("h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[14px] hover:border-input focus:border-ring focus:outline-none max-md:h-10", p.compact && "h-7", done && "text-muted-foreground line-through")}
              />
              <SubtaskProgress t={t} />
              {t.recur && (
                <span title="Tarefa recorrente" className="text-[11px] text-muted-foreground">
                  ↻
                </span>
              )}
            </div>
            {(t.labels.length > 0 || t.dealTitle) && (
              <div className="flex flex-wrap items-center gap-1 px-1">
                {t.labels.map((l) => (
                  <LabelChip key={l} label={l} />
                ))}
                {t.dealTitle && (
                  <Link href={`/negocios/${t.dealId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                    <Link2 className="size-3" /> {t.dealTitle}
                  </Link>
                )}
              </div>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground md:hidden" onClick={() => p.openTask(t.id)}>
            Abrir
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        {p.compact ? (
          <label className="relative inline-flex">
            <Person id={t.assigneeId} users={p.users} />
            <select aria-label="Responsável" disabled={!p.canEdit} value={t.assigneeId ?? ""} onChange={(e) => p.patch(t.id, { assigneeId: e.target.value || null })} className="absolute inset-0 cursor-pointer opacity-0">
              <option value="">Sem responsável</option>
              {p.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Assignee t={t} users={p.users} disabled={!p.canEdit} onChange={(v) => p.patch(t.id, { assigneeId: v })} />
        )}
        <DueInput t={t} disabled={!p.canEdit} onChange={(v) => p.patch(t.id, { dueAt: v })} />
        <Pill label="Situação" value={t.status} options={STATUS} disabled={!p.canEdit} onChange={(v) => p.patch(t.id, { status: v })} wide />
        <span className="flex items-center gap-1.5">
          <Pill label="Prioridade" value={t.priority} options={PRIORITY} disabled={!p.canEdit} onChange={(v) => p.patch(t.id, { priority: v })} />
          <button type="button" onClick={() => p.openTask(t.id)} className="hidden rounded px-1.5 text-[12px] text-muted-foreground underline-offset-2 hover:underline md:inline" aria-label="Abrir detalhes">
            {p.compact ? "⋯" : "Detalhes"}
          </button>
        </span>
        {!p.compact &&
          p.columns.map((c) => (
            <span key={c.id} className="max-md:hidden">
              <CustomCell col={c} value={t.custom[c.id]} users={p.users} disabled={!p.canEdit} onChange={(v) => p.patch(t.id, { custom: { [c.id]: v } })} />
            </span>
          ))}
      </div>
    </li>
  );
}

/* ================================== Kanban ================================== */

type KanbanProps = {
  sections: Section[];
  by: "situacao" | "responsavel" | "prioridade";
  users: User[];
  canEdit: boolean;
  patch: Patch;
  openTask: (id: string) => void;
  onAdd: (key: string, title: string) => void;
};

function KCard({ t, users, openTask, canEdit }: { t: TaskDTO; users: User[]; openTask: (id: string) => void; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canEdit });
  const st = dueState(t);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => openTask(t.id)}
      className={cn("cursor-grab rounded-lg border border-black/15 bg-white p-3 shadow-sm active:cursor-grabbing dark:border-white/15 dark:bg-[#232120]", isDragging && "opacity-40")}
      style={{ borderLeft: `4px solid ${PRIORITY[t.priority].color}` }}
    >
      <p className={cn("text-[13.5px] leading-snug font-semibold", t.status === "concluida" && "text-muted-foreground line-through")}>{t.title}</p>
      {t.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <Person id={t.assigneeId} users={users} size="sm" />
        {t.dueAt && <span className={cn(st === "late" && "font-semibold text-destructive", st === "today" && "font-semibold text-brand")}>{fmtDate(t.dueAt, "dd/MM")}</span>}
        <span>{PRIORITY[t.priority].label}</span>
        <SubtaskProgress t={t} />
      </div>
    </div>
  );
}

function KColumn({ s, by, p }: { s: Section; by: KanbanProps["by"]; p: KanbanProps }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${s.key}` });
  const [title, setTitle] = useState("");
  return (
    <section ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-black/15 bg-[#e1ded9] p-2.5 md:w-auto md:min-w-56 md:flex-1 dark:border-white/15 dark:bg-[#0a0909]", isOver && "ring-2 ring-brand")}>
      <h3 className="flex items-center gap-2 px-1 text-[13px] font-bold">
        <span className="size-2.5 rounded-full" style={{ background: s.color }} /> <span className="truncate">{s.label}</span>
        <span className="font-normal text-muted-foreground">{s.tasks.length}</span>
      </h3>
      {s.tasks.map((t) => (
        <KCard key={t.id} t={t} users={p.users} openTask={p.openTask} canEdit={p.canEdit} />
      ))}
      {s.tasks.length === 0 && <p className="rounded-lg border border-dashed border-foreground/25 px-2 py-5 text-center text-[12.5px] text-muted-foreground">{p.canEdit ? "Vazio. Arraste uma tarefa para cá." : "Nenhuma tarefa."}</p>}
      {p.canEdit && (
        <form
          className="flex items-center gap-1.5 rounded-lg px-1"
          onSubmit={(e) => {
            e.preventDefault();
            p.onAdd(s.key, title);
            setTitle("");
          }}
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa" aria-label={`Nova tarefa em ${s.label} (${by})`} className="h-8 min-w-0 flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none" />
        </form>
      )}
    </section>
  );
}

export function KanbanView(p: KanbanProps) {
  const sensors = useDndSensors();
  const [active, setActive] = useState<string | null>(null);
  const all = p.sections.flatMap((s) => s.tasks);
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const id = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over?.startsWith("col-")) return;
    const key = over.slice(4);
    const cur = all.find((t) => t.id === id);
    if (!cur) return;
    if (p.by === "situacao" && cur.status !== key) p.patch(id, { status: key });
    else if (p.by === "prioridade" && cur.priority !== key) p.patch(id, { priority: key });
    else if (p.by === "responsavel") {
      const to = key === "none" ? null : key;
      if (cur.assigneeId !== to) p.patch(id, { assigneeId: to });
    }
  };
  const a = all.find((t) => t.id === active);
  return (
    <DndContext id="tasks-kanban" sensors={sensors} onDragStart={(e) => setActive(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="thin-scroll flex items-start gap-3 overflow-x-auto pb-3">
        {p.sections.map((s) => (
          <KColumn key={s.key} s={s} by={p.by} p={p} />
        ))}
      </div>
      <DragOverlay>{a && <div className="rounded-lg border bg-card p-3 text-[13.5px] font-semibold shadow-lg">{a.title}</div>}</DragOverlay>
    </DndContext>
  );
}

/* ================================ Calendário ================================ */

type CalProps = {
  tasks: TaskDTO[];
  mode: "mes" | "semana";
  setMode: (m: "mes" | "semana") => void;
  canEdit: boolean;
  patch: Patch;
  openTask: (id: string) => void;
  onCreate: (day: string) => void;
};

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function CalChip({ t, onOpen, canEdit }: { t: TaskDTO; onOpen: () => void; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canEdit });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn("flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs leading-tight font-medium text-on-st", isDragging && "opacity-40", t.status === "concluida" && "line-through opacity-70")}
      style={{ background: STATUS[t.status].color }}
      title={t.title}
    >
      <span className="truncate">{t.title}</span>
    </button>
  );
}

function CalDay({ day, outside, today, tasks, p, tall }: { day: string; outside: boolean; today: string; tasks: TaskDTO[]; p: CalProps; tall: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` });
  return (
    <div ref={setNodeRef} className={cn("group border-r border-b p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0", tall ? "min-h-64" : "min-h-24 sm:min-h-28", outside && "bg-muted/40", isOver && "bg-brand-soft")}>
      <div className="mb-1 flex items-center">
        <span className={cn("grid size-6 place-items-center rounded-full text-[12px]", outside && "text-muted-foreground", day === today && "bg-brand font-semibold text-on-brand")}>{Number(day.slice(8))}</span>
        {p.canEdit && (
          <button type="button" onClick={() => p.onCreate(day)} aria-label={`Nova tarefa em ${fmtDate(day, "dd/MM")}`} className="ml-auto grid size-6 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted max-md:opacity-100">
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      <div className="grid gap-0.5">
        {tasks.slice(0, tall ? 30 : 4).map((t) => (
          <CalChip key={t.id} t={t} canEdit={p.canEdit} onOpen={() => p.openTask(t.id)} />
        ))}
        {!tall && tasks.length > 4 && <span className="px-1 text-xs text-muted-foreground">+{tasks.length - 4} mais</span>}
      </div>
    </div>
  );
}

export function CalendarView(p: CalProps) {
  const sensors = useDndSensors();
  const today = todayISO();
  const [anchor, setAnchor] = useState(today);
  const [dragging, setDragging] = useState<TaskDTO | null>(null);
  const days = p.mode === "mes" ? monthGrid(anchor.slice(0, 7)) : weekGrid(anchor);
  const byDay = new Map<string, TaskDTO[]>();
  for (const t of p.tasks) {
    if (!t.dueAt) continue;
    const d = toDay(t.dueAt);
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  const semPrazo = p.tasks.filter((t) => !t.dueAt && t.status !== "concluida");
  const shift = (n: number) => setAnchor((a) => (p.mode === "mes" ? addMonths(`${a.slice(0, 7)}-01`, n) : addDays(a, 7 * n)));
  const label = p.mode === "mes" ? fmtDate(`${anchor.slice(0, 7)}-15`, "MMMM 'de' yyyy") : `${fmtDate(days[0], "dd/MM")} – ${fmtDate(days[6], "dd/MM/yyyy")}`;
  return (
    <DndContext
      id="tasks-calendar"
      sensors={sensors}
      onDragStart={(e) => setDragging(p.tasks.find((t) => t.id === String(e.active.id)) ?? null)}
      onDragEnd={(e) => {
        setDragging(null);
        const over = e.over?.id ? String(e.over.id) : null;
        const t = p.tasks.find((x) => x.id === String(e.active.id));
        if (over?.startsWith("day-") && t && (!t.dueAt || toDay(t.dueAt) !== over.slice(4))) p.patch(t.id, { dueAt: over.slice(4) });
      }}
      onDragCancel={() => setDragging(null)}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Anterior" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Próximo" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <h2 className="ml-1 min-w-40 text-lg font-light capitalize">{label}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAnchor(today)}>
          Hoje
        </Button>
        <div className="ml-auto flex rounded-lg border p-0.5" role="group" aria-label="Escala">
          {(["mes", "semana"] as const).map((m) => (
            <button key={m} type="button" onClick={() => p.setMode(m)} aria-pressed={p.mode === m} className={cn("rounded-md px-3 py-1 text-[13px] max-md:py-2", p.mode === m && "bg-foreground font-medium text-background")}>
              {m === "mes" ? "Mês" : "Semana"}
            </button>
          ))}
        </div>
      </div>
      <div className="thin-scroll overflow-x-auto">
        <div className="min-w-[640px] overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {WEEK.map((w) => (
              <div key={w} className="px-2 py-2 text-center text-xs tracking-wider text-muted-foreground uppercase">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => (
              <CalDay key={d} day={d} today={today} outside={p.mode === "mes" && d.slice(0, 7) !== anchor.slice(0, 7)} tasks={byDay.get(d) ?? []} p={p} tall={p.mode === "semana"} />
            ))}
          </div>
        </div>
      </div>
      {semPrazo.length > 0 && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          {semPrazo.length} {semPrazo.length === 1 ? "tarefa sem prazo não aparece" : "tarefas sem prazo não aparecem"} no calendário. Arraste uma tarefa para outro dia para mudar o prazo.
        </p>
      )}
      <DragOverlay>{dragging && <div className="rounded px-2 py-1 text-xs font-medium text-on-st shadow-lg" style={{ background: STATUS[dragging.status].color }}>{dragging.title}</div>}</DragOverlay>
    </DndContext>
  );
}

/* ============================= Linha do tempo (Gantt) ============================= */

const WINDOW = 42;

export function TimelineView({ sections, openTask }: { sections: Section[]; openTask: (id: string) => void }) {
  const today = todayISO();
  const [start, setStart] = useState(() => startOfWeek(addDays(todayISO(), -7)));
  const days = Array.from({ length: WINDOW }, (_, i) => addDays(start, i));
  const todayIdx = diffDays(start, today);
  const colW = 34;
  const nameW = 220;
  const shown = sections.filter((s) => s.tasks.length);
  const noDue = shown.reduce((n, s) => n + s.tasks.filter((t) => !t.dueAt).length, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Voltar duas semanas" onClick={() => setStart((s) => addDays(s, -14))}>
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Avançar duas semanas" onClick={() => setStart((s) => addDays(s, 14))}>
          <ChevronRight />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStart(startOfWeek(addDays(today, -7)))}>
          Hoje
        </Button>
        <span className="text-[13px] text-muted-foreground">
          {fmtDate(days[0], "dd/MM")} – {fmtDate(days[WINDOW - 1], "dd/MM/yyyy")} · a barra vai da criação da tarefa até o prazo
        </span>
      </div>
      <div className="thin-scroll overflow-x-auto rounded-xl border bg-card">
        <div style={{ minWidth: nameW + colW * WINDOW }}>
          <div className="sticky top-0 z-10 flex border-b bg-muted/60 text-[11px] text-muted-foreground">
            <div className="sticky left-0 z-10 shrink-0 border-r bg-muted px-3 py-2 font-semibold uppercase" style={{ width: nameW }}>
              Tarefa
            </div>
            {days.map((d) => (
              <div key={d} className={cn("shrink-0 border-r py-1 text-center leading-tight", d === today && "bg-brand-soft font-semibold text-foreground", [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) && "bg-muted/50")} style={{ width: colW }}>
                <div>{Number(d.slice(8))}</div>
                <div className="uppercase">{Number(d.slice(8)) === 1 || d === days[0] ? fmtDate(d, "MMM") : WEEK[new Date(`${d}T12:00:00Z`).getUTCDay()].slice(0, 1)}</div>
              </div>
            ))}
          </div>
          {shown.map((s) => (
            <div key={s.key}>
              <div className="sticky left-0 flex items-center gap-2 border-b bg-card px-3 py-1.5 text-[13px] font-semibold" style={{ color: s.color }}>
                <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}
              </div>
              {s.tasks.map((t) => {
                const due = t.dueAt ? toDay(t.dueAt) : null;
                const bar = due ? timelineBar(toDay(t.createdAt), due, start, WINDOW) : null;
                return (
                  <div key={t.id} className="relative flex h-9 items-center border-b hover:bg-muted/30">
                    <button type="button" onClick={() => openTask(t.id)} className="sticky left-0 z-[1] flex h-full shrink-0 items-center gap-1.5 truncate border-r bg-card px-3 text-left text-[13px] hover:underline" style={{ width: nameW }} title={t.title}>
                      <span className={cn("truncate", t.status === "concluida" && "text-muted-foreground line-through")}>{t.title}</span>
                    </button>
                    <div className="relative h-full" style={{ width: colW * WINDOW }}>
                      {todayIdx >= 0 && todayIdx < WINDOW && <span aria-hidden className="absolute inset-y-0 w-px bg-brand/60" style={{ left: todayIdx * colW + colW / 2 }} />}
                      {bar ? (
                        <button
                          type="button"
                          onClick={() => openTask(t.id)}
                          title={`${t.title} · prazo ${fmtDate(due, "dd/MM")}`}
                          className={cn("absolute top-1/2 h-5 -translate-y-1/2 text-left text-[11px] leading-5 font-semibold text-on-st", bar.clippedStart ? "rounded-r" : "rounded-l", !bar.clippedEnd && !bar.clippedStart && "rounded")}
                          style={{ left: bar.from * colW + 2, width: bar.span * colW - 4, background: STATUS[t.status].color }}
                        >
                          <span className="block truncate px-1.5">{bar.span >= 3 ? fmtDate(due, "dd/MM") : ""}</span>
                        </button>
                      ) : (
                        !due && <span className="px-3 text-xs text-muted-foreground">sem prazo</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {shown.length === 0 && <p className="p-6 text-center text-[13px] text-muted-foreground">Nenhuma tarefa com esses filtros.</p>}
        </div>
      </div>
      {noDue > 0 && <p className="mt-3 text-[12.5px] text-muted-foreground">{noDue} {noDue === 1 ? "tarefa está" : "tarefas estão"} sem prazo e sem barra. Defina um prazo para ver no cronograma.</p>}
    </div>
  );
}
