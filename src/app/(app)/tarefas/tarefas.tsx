"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarDays, Check, ChevronDown, ChevronRight, Columns3, LayoutList, Link2, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "@/components/form";
import { cn } from "@/lib/utils";
import { fmtDate, initials, isoDateBR, todayISO } from "@/lib/format";
import type { TaskBoard, TaskGroup, TaskPriority, TaskStatus } from "@/lib/db/schema";
import { createBoard, createGroup, createLooseTask, createTask, deleteBoard, deleteGroup, deleteTask, renameBoard, updateGroup, updateTask, type TaskDTO } from "./actions";

const STATUS: Record<TaskStatus, { label: string; color: string }> = {
  a_fazer: { label: "A fazer", color: "var(--st-todo)" },
  em_andamento: { label: "Em andamento", color: "var(--st-doing)" },
  travada: { label: "Travada", color: "var(--st-stuck)" },
  concluida: { label: "Concluída", color: "var(--st-done)" },
};
const STATUS_KEYS = Object.keys(STATUS) as TaskStatus[];
const PRIORITY: Record<TaskPriority, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "var(--pr-low)" },
  media: { label: "Média", color: "var(--pr-mid)" },
  alta: { label: "Alta", color: "var(--pr-high)" },
  urgente: { label: "Urgente", color: "var(--pr-urgent)" },
};

type User = { id: string; name: string };
type Props = {
  mode: "board" | "minhas";
  boards: Pick<TaskBoard, "id" | "name" | "color">[];
  board: Pick<TaskBoard, "id" | "name" | "color"> | null;
  groups: TaskGroup[];
  tasks: TaskDTO[];
  users: User[];
  meId: string;
  canEdit: boolean;
  canManage: boolean;
  boardNames: Record<string, string>;
  view: "tabela" | "kanban";
};

/* ------------------------------- peças pequenas ------------------------------- */

function Pill({ value, options, onChange, disabled, label, wide }: { value: string; options: Record<string, { label: string; color: string }>; onChange: (v: string) => void; disabled?: boolean; label: string; wide?: boolean }) {
  const cur = options[value];
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-7 max-md:h-10 cursor-pointer appearance-none rounded-md px-2.5 text-center text-[12px] font-semibold text-on-st max-md:text-[13px] outline-none disabled:cursor-default", wide ? "min-w-28" : "min-w-20")}
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

const Person = ({ id, users }: { id: string | null; users: User[] }) => {
  const u = users.find((x) => x.id === id);
  return u ? (
    <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" title={u.name}>
      {initials(u.name)}
    </span>
  ) : (
    <span className="grid size-6 place-items-center rounded-full border border-dashed text-muted-foreground" title="Sem responsável">
      <UserRound className="size-3" />
    </span>
  );
};

function dueState(t: TaskDTO) {
  if (!t.dueAt) return "none";
  if (t.status === "concluida") return "done";
  const d = isoDateBR(new Date(t.dueAt));
  const today = todayISO();
  return d < today ? "late" : d === today ? "today" : "later";
}

function DueInput({ t, onChange, disabled }: { t: TaskDTO; onChange: (v: string | null) => void; disabled?: boolean }) {
  const st = dueState(t);
  return (
    <label className={cn("relative inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] max-md:h-10 max-md:text-[13px]", st === "late" && "border-destructive bg-destructive/10 font-medium text-destructive", st === "today" && "border-brand bg-brand-soft font-medium")}>
      <CalendarDays className="size-3 shrink-0" />
      <span className="whitespace-nowrap">{t.dueAt ? `${fmtDate(t.dueAt, "dd/MM")}${st === "late" ? " · atrasada" : st === "today" ? " · hoje" : ""}` : "Prazo"}</span>
      <input
        type="date"
        aria-label="Prazo"
        disabled={disabled}
        value={t.dueAt ? isoDateBR(new Date(t.dueAt)) : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      />
    </label>
  );
}

function Assignee({ t, users, onChange, disabled }: { t: TaskDTO; users: User[]; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <label className="relative inline-flex h-7 items-center gap-1.5 rounded-md border px-1.5 text-[12px] max-md:h-10 max-md:text-[13px]">
      <Person id={t.assigneeId} users={users} />
      <span className="max-w-24 truncate">{users.find((u) => u.id === t.assigneeId)?.name.split(" ")[0] ?? "Atribuir"}</span>
      <select aria-label="Responsável" disabled={disabled} value={t.assigneeId ?? ""} onChange={(e) => onChange(e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default">
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

/* --------------------------------- componente --------------------------------- */

export function Tarefas(props: Props) {
  const { mode, boards, board, users, meId, canEdit, canManage, boardNames, view } = props;
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskDTO[]>(props.tasks);
  const [groups, setGroups] = useState<TaskGroup[]>(props.groups);
  const [open, setOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [newBoard, setNewBoard] = useState(false);

  // dados do servidor (troca de quadro/visão) substituem o estado local
  const [seen, setSeen] = useState(props);
  if (props.tasks !== seen.tasks || props.groups !== seen.groups) {
    setSeen(props);
    setTasks(props.tasks);
    setGroups(props.groups);
  }

  const patch = async (id: string, p: Parameters<typeof updateTask>[1]) => {
    const prev = tasks;
    setTasks((all) =>
      all.map((t) => {
        if (t.id !== id) return t;
        const n = { ...t };
        if (p.title !== undefined) n.title = p.title;
        if (p.status) n.status = p.status as TaskStatus;
        if (p.priority) n.priority = p.priority as TaskPriority;
        if (p.assigneeId !== undefined) n.assigneeId = p.assigneeId;
        if (p.dueAt !== undefined) n.dueAt = p.dueAt ? new Date(`${p.dueAt}T12:00:00-03:00`).toISOString() : null;
        if (p.description !== undefined) n.description = p.description;
        if (p.groupId) n.groupId = p.groupId;
        return n;
      }),
    );
    const r = await updateTask(id, p);
    if (r && "error" in r && r.error) {
      toast.error(r.error);
      setTasks(prev);
    } else if (r && "task" in r && r.task) {
      const saved = r.task;
      setTasks((all) => all.map((t) => (t.id === id ? { ...saved, dealTitle: t.dealTitle } : t)));
    }
  };
  const remove = async (id: string) => {
    const prev = tasks;
    setTasks((all) => all.filter((t) => t.id !== id));
    setOpen(null);
    const r = await deleteTask(id);
    if (r && "error" in r && r.error) {
      toast.error(r.error);
      setTasks(prev);
    }
  };
  const add = async (groupId: string, title: string) => {
    if (!board || !title.trim()) return;
    const r = await createTask({ boardId: board.id, groupId, title });
    if ("error" in r && r.error) return void toast.error(r.error);
    if ("task" in r && r.task) setTasks((all) => [...all, r.task]);
  };

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks.filter((t) => (!s || t.title.toLowerCase().includes(s)) && (!who || (who === "none" ? !t.assigneeId : t.assigneeId === who)) && (!hideDone || t.status !== "concluida"));
  }, [tasks, q, who, hideDone]);

  const openTask = tasks.find((t) => t.id === open) ?? null;
  const href = (b: string, v?: string) => `/tarefas?quadro=${b}${v && v !== "tabela" ? `&vista=${v}` : ""}`;

  return (
    <div className="grid gap-4">
      {/* quadros */}
      <div data-tour="task-boards" className="thin-scroll flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Quadros">
        <Link href="/tarefas?quadro=minhas" role="tab" aria-selected={mode === "minhas"} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] max-md:py-2.5", mode === "minhas" ? "border-foreground bg-foreground font-medium text-background" : "bg-card hover:border-foreground/40")}>
          <Check className="size-3.5" /> Minhas tarefas
        </Link>
        {boards.map((b) => (
          <Link key={b.id} href={href(b.id, view)} role="tab" aria-selected={board?.id === b.id} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] max-md:py-2.5", board?.id === b.id ? "border-foreground bg-foreground font-medium text-background" : "bg-card hover:border-foreground/40")}>
            <span className="size-2 rounded-full" style={{ background: b.color }} /> {b.name}
          </Link>
        ))}
        {canEdit && !newBoard && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-full" onClick={() => setNewBoard(true)}>
            <Plus /> Quadro
          </Button>
        )}
        {newBoard && (
          <form
            className="flex shrink-0 gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "");
              const r = await createBoard(name);
              if ("error" in r && r.error) return void toast.error(r.error);
              if ("board" in r && r.board) router.push(href(r.board.id));
            }}
          >
            <Input name="name" autoFocus placeholder="Nome do quadro" className="h-8 w-44" onKeyDown={(e) => e.key === "Escape" && setNewBoard(false)} />
            <Button type="submit" size="sm">
              Criar
            </Button>
          </form>
        )}
      </div>

      {mode === "minhas" ? (
        <Minhas tasks={visible} all={tasks} users={users} meId={meId} canEdit={canEdit} boardNames={boardNames} patch={patch} openTask={setOpen} onAdded={(t) => setTasks((a) => [t, ...a])} q={q} setQ={setQ} hideDone={hideDone} setHideDone={setHideDone} />
      ) : board ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <BoardTitle board={board} canEdit={canEdit} />
            <div className="ml-auto flex flex-wrap items-center gap-2" data-tour="task-filters">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefa…" aria-label="Buscar tarefa" className="h-8 w-40" />
              <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filtrar por responsável" className="h-8 rounded-lg border border-input bg-background px-2 text-[13px] max-md:h-10">
                <option value="">Todos</option>
                <option value="none">Sem responsável</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[13px] max-md:min-h-10">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="size-4 accent-brand" /> Ocultar concluídas
              </label>
              <div className="flex rounded-lg border p-0.5" role="group" aria-label="Visão">
                <Link href={href(board.id, "tabela")} aria-current={view === "tabela"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[13px] max-md:py-2.5", view === "tabela" && "bg-foreground font-medium text-background")}>
                  <LayoutList className="size-3.5" /> Tabela
                </Link>
                <Link href={href(board.id, "kanban")} aria-current={view === "kanban"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[13px] max-md:py-2.5", view === "kanban" && "bg-foreground font-medium text-background")}>
                  <Columns3 className="size-3.5" /> Kanban
                </Link>
              </div>
            </div>
          </div>

          {view === "kanban" && canEdit && <p className="-mt-2 text-[13px] text-muted-foreground">Arraste um cartão para outra coluna para mudar a situação (no celular, segure o cartão por um instante). Toque no cartão para ver detalhes.</p>}
          {view === "kanban" ? (
            <KanbanView tasks={visible} users={users} canEdit={canEdit} patch={patch} openTask={setOpen} />
          ) : (
            <div data-tour="task-groups" className="grid gap-5">
              {groups.map((g) => (
                <GroupBlock
                  key={g.id}
                  group={g}
                  tasks={visible.filter((t) => t.groupId === g.id)}
                  total={tasks.filter((t) => t.groupId === g.id).length}
                  users={users}
                  canEdit={canEdit}
                  canManage={canManage}
                  collapsed={!!collapsed[g.id]}
                  toggle={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                  patch={patch}
                  openTask={setOpen}
                  add={(title) => add(g.id, title)}
                  onRename={async (name) => {
                    setGroups((all) => all.map((x) => (x.id === g.id ? { ...x, name } : x)));
                    await updateGroup(g.id, { name });
                  }}
                  onDelete={async () => {
                    if (!window.confirm(`Excluir o grupo "${g.name}" e as tarefas dele?`)) return;
                    setGroups((all) => all.filter((x) => x.id !== g.id));
                    setTasks((all) => all.filter((t) => t.groupId !== g.id));
                    await deleteGroup(g.id);
                  }}
                />
              ))}
              {groups.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">Este quadro não tem grupos. Crie um grupo (por exemplo “Esta semana”) para começar a adicionar tarefas.</p>}
              {canEdit && (
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const name = String(new FormData(f).get("name") ?? "");
                    const r = await createGroup(board.id, name);
                    if ("error" in r && r.error) return void toast.error(r.error);
                    if ("group" in r && r.group) setGroups((a) => [...a, r.group]);
                    f.reset();
                  }}
                >
                  <Input name="name" placeholder="Nome do novo grupo (ex.: Esta semana)" aria-label="Novo grupo" className="h-9 max-w-xs" />
                  <Button type="submit" variant="outline" size="sm">
                    Adicionar grupo
                  </Button>
                </form>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-[14px] text-muted-foreground">
          Nenhum quadro ainda. {canEdit ? "Crie o primeiro em “+ Quadro” — por exemplo “Rotina do estúdio” ou “Obra da Matriz”." : ""}
        </p>
      )}

      <TaskSheet task={openTask} users={users} canEdit={canEdit} boardName={openTask?.boardId ? boardNames[openTask.boardId] : null} groups={groups} onClose={() => setOpen(null)} patch={patch} remove={remove} />

      {board && canManage && mode === "board" && (
        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              if (!window.confirm(`Excluir o quadro "${board.name}" com todos os grupos e tarefas? Não dá para desfazer.`)) return;
              await deleteBoard(board.id);
              router.push("/tarefas?quadro=minhas");
              router.refresh();
            }}
          >
            <Trash2 /> Excluir este quadro
          </Button>
        </div>
      )}
    </div>
  );
}

function BoardTitle({ board, canEdit }: { board: { id: string; name: string; color: string }; canEdit: boolean }) {
  const [name, setName] = useState(board.name);
  return (
    <div className="flex items-center gap-2">
      <span className="size-3 rounded-full" style={{ background: board.color }} />
      <input
        aria-label="Nome do quadro"
        value={name}
        disabled={!canEdit}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== board.name && renameBoard(board.id, name)}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className="h-9 max-md:h-10 min-w-0 rounded-md border border-transparent bg-transparent px-1 text-[20px] font-semibold hover:border-input focus:border-ring focus:outline-none"
      />
    </div>
  );
}

/* ------------------------------- grupo (tabela) ------------------------------- */

function GroupBlock({ group, tasks, total, users, canEdit, canManage, collapsed, toggle, patch, openTask, add, onRename, onDelete }: {
  group: TaskGroup; tasks: TaskDTO[]; total: number; users: User[]; canEdit: boolean; canManage: boolean; collapsed: boolean; toggle: () => void;
  patch: (id: string, p: Parameters<typeof updateTask>[1]) => void; openTask: (id: string) => void; add: (title: string) => void; onRename: (n: string) => void; onDelete: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [title, setTitle] = useState("");
  const done = tasks.filter((t) => t.status === "concluida").length;
  return (
    <section className="rounded-xl border bg-card" style={{ borderLeft: `5px solid ${group.color}` }}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expandir grupo" : "Recolher grupo"} className="grid size-6 place-items-center rounded hover:bg-muted max-md:size-10">
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <input
          aria-label="Nome do grupo"
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== group.name && onRename(name)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className="h-8 max-md:h-10 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[15px] font-semibold hover:border-input focus:border-ring focus:outline-none"
          style={{ color: group.color }}
        />
        <span className="text-[12px] text-muted-foreground max-md:hidden">
          {done}/{total} concluídas
        </span>
        {canManage && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Excluir grupo" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        )}
      </header>
      {!collapsed && (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_150px_120px_130px_110px] gap-3 border-y bg-muted/60 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid">
            <span>Tarefa</span>
            <span>Responsável</span>
            <span>Prazo</span>
            <span>Situação</span>
            <span>Prioridade</span>
          </div>
          <ul>
            {tasks.map((t) => (
              <TaskRow key={t.id} t={t} users={users} canEdit={canEdit} patch={patch} openTask={openTask} />
            ))}
          </ul>
          {tasks.length === 0 && <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhuma tarefa neste grupo.</p>}
          {canEdit && (
            <form
              className="flex items-center gap-2 border-t px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                add(title);
                setTitle("");
              }}
            >
              <Plus className="size-4 text-muted-foreground" />
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adicionar tarefa — digite e tecle Enter" aria-label={`Nova tarefa em ${group.name}`} className="h-8 min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-muted-foreground focus:outline-none max-md:h-10" />
            </form>
          )}
        </>
      )}
    </section>
  );
}

function TaskRow({ t, users, canEdit, patch, openTask, boardName }: { t: TaskDTO; users: User[]; canEdit: boolean; patch: (id: string, p: Parameters<typeof updateTask>[1]) => void; openTask: (id: string) => void; boardName?: string | null }) {
  const [title, setTitle] = useState(t.title);
  const [seen, setSeen] = useState(t.title);
  if (t.title !== seen) {
    setSeen(t.title);
    setTitle(t.title);
  }
  const done = t.status === "concluida";
  return (
    <li className="grid gap-2 border-b px-4 py-2.5 last:border-b-0 hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_150px_120px_130px_110px] md:items-center md:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => patch(t.id, { status: done ? "a_fazer" : "concluida" })}
          aria-label={done ? "Reabrir tarefa" : "Marcar como concluída"}
          className={cn("relative grid size-5 shrink-0 place-items-center rounded-full border-2 after:absolute after:-inset-2.5 after:content-['']", done ? "border-[var(--st-done)] bg-[var(--st-done)] text-on-st" : "border-muted-foreground/60 hover:border-[var(--st-done)]")}
        >
          {done && <Check className="size-3" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <input
            aria-label="Título da tarefa"
            value={title}
            disabled={!canEdit}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== t.title && patch(t.id, { title })}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className={cn("h-8 max-md:h-10 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[14px] hover:border-input focus:border-ring focus:outline-none", done && "text-muted-foreground line-through")}
          />
          {(t.dealTitle || boardName) && (
            <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
              {t.dealTitle && (
                <Link href={`/negocios/${t.dealId}`} className="inline-flex items-center gap-1 hover:underline">
                  <Link2 className="size-3" /> {t.dealTitle}
                </Link>
              )}
              {boardName && <span>{t.dealTitle ? " · " : ""}{boardName}</span>}
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground md:hidden" onClick={() => openTask(t.id)}>
          Abrir
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        <Assignee t={t} users={users} disabled={!canEdit} onChange={(v) => patch(t.id, { assigneeId: v })} />
        <DueInput t={t} disabled={!canEdit} onChange={(v) => patch(t.id, { dueAt: v })} />
        <Pill label="Situação" value={t.status} options={STATUS} disabled={!canEdit} onChange={(v) => patch(t.id, { status: v })} wide />
        <span className="flex items-center gap-1.5">
          <Pill label="Prioridade" value={t.priority} options={PRIORITY} disabled={!canEdit} onChange={(v) => patch(t.id, { priority: v })} />
          <button type="button" onClick={() => openTask(t.id)} className="hidden rounded px-1.5 text-[12px] text-muted-foreground underline-offset-2 hover:underline md:inline" aria-label="Abrir detalhes">
            Detalhes
          </button>
        </span>
      </div>
    </li>
  );
}

/* --------------------------------- kanban --------------------------------- */

function KCard({ t, users, openTask, canEdit }: { t: TaskDTO; users: User[]; openTask: (id: string) => void; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canEdit });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => openTask(t.id)} className={cn("cursor-grab rounded-lg border bg-card p-3 shadow-sm active:cursor-grabbing", isDragging && "opacity-40")} style={{ borderLeft: `4px solid ${PRIORITY[t.priority].color}` }}>
      <p className="text-[13.5px] leading-snug font-medium">{t.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <Person id={t.assigneeId} users={users} />
        {t.dueAt && <span className={cn(dueState(t) === "late" && "font-medium text-destructive")}>{fmtDate(t.dueAt, "dd/MM")}</span>}
        <span>{PRIORITY[t.priority].label}</span>
      </div>
    </div>
  );
}

function KColumn({ status, tasks, users, openTask, canEdit }: { status: TaskStatus; tasks: TaskDTO[]; users: User[]; openTask: (id: string) => void; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={cn("flex min-h-48 w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/50 p-2.5 md:w-auto", isOver && "ring-2 ring-brand")}>
      <h3 className="flex items-center gap-2 px-1 text-[13px] font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: STATUS[status].color }} /> {STATUS[status].label}
        <span className="font-normal text-muted-foreground">{tasks.length}</span>
      </h3>
      {tasks.map((t) => (
        <KCard key={t.id} t={t} users={users} openTask={openTask} canEdit={canEdit} />
      ))}
      {tasks.length === 0 && <p className="rounded-lg border border-dashed px-2 py-6 text-center text-[13px] text-muted-foreground">{canEdit ? "Vazio. Arraste uma tarefa para cá para mudar a situação." : "Nenhuma tarefa."}</p>}
    </section>
  );
}

function KanbanView({ tasks, users, canEdit, patch, openTask }: { tasks: TaskDTO[]; users: User[]; canEdit: boolean; patch: (id: string, p: Parameters<typeof updateTask>[1]) => void; openTask: (id: string) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const [active, setActive] = useState<string | null>(null);
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const id = String(e.active.id);
    const to = e.over?.id as TaskStatus | undefined;
    const cur = tasks.find((t) => t.id === id);
    if (to && cur && cur.status !== to && STATUS_KEYS.includes(to)) patch(id, { status: to });
  };
  const a = tasks.find((t) => t.id === active);
  return (
    <DndContext id="tasks-kanban" sensors={sensors} onDragStart={(e) => setActive(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="thin-scroll flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
        {STATUS_KEYS.map((s) => (
          <KColumn key={s} status={s} tasks={tasks.filter((t) => t.status === s)} users={users} openTask={openTask} canEdit={canEdit} />
        ))}
      </div>
      <DragOverlay>{a && <div className="rounded-lg border bg-card p-3 text-[13.5px] font-medium shadow-lg">{a.title}</div>}</DragOverlay>
    </DndContext>
  );
}

/* ------------------------------- minhas tarefas ------------------------------- */

function Minhas({ tasks, all, users, meId, canEdit, boardNames, patch, openTask, onAdded, q, setQ, hideDone, setHideDone }: {
  tasks: TaskDTO[]; all: TaskDTO[]; users: User[]; meId: string; canEdit: boolean; boardNames: Record<string, string>;
  patch: (id: string, p: Parameters<typeof updateTask>[1]) => void; openTask: (id: string) => void; onAdded: (t: TaskDTO) => void;
  q: string; setQ: (v: string) => void; hideDone: boolean; setHideDone: (v: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const today = todayISO();
  const week = isoDateBR(new Date(new Date(`${today}T12:00:00-03:00`).getTime() + 7 * 864e5));
  const sections = [
    { key: "late", label: "Atrasadas", tone: "text-destructive", test: (t: TaskDTO) => t.status !== "concluida" && !!t.dueAt && isoDateBR(new Date(t.dueAt)) < today },
    { key: "today", label: "Hoje", tone: "text-brand", test: (t: TaskDTO) => t.status !== "concluida" && !!t.dueAt && isoDateBR(new Date(t.dueAt)) === today },
    { key: "week", label: "Próximos 7 dias", tone: "", test: (t: TaskDTO) => t.status !== "concluida" && !!t.dueAt && isoDateBR(new Date(t.dueAt)) > today && isoDateBR(new Date(t.dueAt)) <= week },
    { key: "later", label: "Depois", tone: "", test: (t: TaskDTO) => t.status !== "concluida" && !!t.dueAt && isoDateBR(new Date(t.dueAt)) > week },
    { key: "none", label: "Sem prazo", tone: "", test: (t: TaskDTO) => t.status !== "concluida" && !t.dueAt },
    { key: "done", label: "Concluídas", tone: "text-muted-foreground", test: (t: TaskDTO) => t.status === "concluida" },
  ];
  const openCount = all.filter((t) => t.status !== "concluida").length;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[20px] font-semibold">Minhas tarefas</h2>
        <span className="text-[13px] text-muted-foreground">{openCount} em aberto</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar tarefa" className="h-8 w-40" />
          <label className="flex items-center gap-1.5 text-[13px] max-md:min-h-10">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="size-4 accent-brand" /> Ocultar concluídas
          </label>
        </div>
      </div>
      {canEdit && (
        <form
          data-tour="task-quick"
          className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await createLooseTask({ title, dueAt: due || null });
            if ("error" in r && r.error) return void toast.error(r.error);
            if ("task" in r && r.task) onAdded(r.task);
            setTitle("");
            setDue("");
            ref.current?.focus();
          }}
        >
          <Plus className="size-4 text-muted-foreground" />
          <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que você precisa fazer? Digite e tecle Enter" aria-label="Nova tarefa" className="h-9 max-md:h-10 min-w-0 flex-1 bg-transparent text-[14px] focus:outline-none" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Prazo da nova tarefa" className="h-8 w-36" />
          <Button type="submit" size="sm" disabled={!title.trim()}>
            Adicionar
          </Button>
        </form>
      )}
      {tasks.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-[14px] text-muted-foreground">Nada por aqui. Quando alguém atribuir uma tarefa a você, ela aparece nesta lista, organizada por prazo.</p>}
      {sections.map((s) => {
        const list = tasks.filter(s.test);
        if (!list.length) return null;
        return (
          <section key={s.key} className="rounded-xl border bg-card">
            <h3 className={cn("border-b px-4 py-2.5 text-[14px] font-semibold", s.tone)}>
              {s.label} <span className="font-normal text-muted-foreground">· {list.length}</span>
            </h3>
            <ul>
              {list.map((t) => (
                <TaskRow key={t.id} t={t} users={users} canEdit={canEdit} patch={patch} openTask={openTask} boardName={t.boardId ? boardNames[t.boardId] : undefined} />
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-[12px] text-muted-foreground">Aqui aparecem as tarefas atribuídas a você ({users.find((u) => u.id === meId)?.name}) em todos os quadros e dentro dos negócios.</p>
    </div>
  );
}

/* ------------------------------- painel de detalhe ------------------------------- */

function TaskSheet({ task, users, canEdit, boardName, groups, onClose, patch, remove }: {
  task: TaskDTO | null; users: User[]; canEdit: boolean; boardName: string | null | undefined; groups: TaskGroup[]; onClose: () => void;
  patch: (id: string, p: Parameters<typeof updateTask>[1]) => void; remove: (id: string) => void;
}) {
  const [desc, setDesc] = useState("");
  const [seenId, setSeenId] = useState<string | null>(null);
  if (task && task.id !== seenId) {
    setSeenId(task.id);
    setDesc(task.description ?? "");
  }
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {task && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-left">{task.title}</SheetTitle>
              <SheetDescription>
                {boardName ? `Quadro: ${boardName}` : "Tarefa avulsa"}
                {task.dealTitle ? ` · Negócio: ${task.dealTitle}` : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 px-4 pb-6">
              <Field label="Situação">
                <Pill label="Situação" value={task.status} options={STATUS} disabled={!canEdit} onChange={(v) => patch(task.id, { status: v })} wide />
              </Field>
              <Field label="Prioridade">
                <Pill label="Prioridade" value={task.priority} options={PRIORITY} disabled={!canEdit} onChange={(v) => patch(task.id, { priority: v })} wide />
              </Field>
              <Field label="Responsável">
                <Assignee t={task} users={users} disabled={!canEdit} onChange={(v) => patch(task.id, { assigneeId: v })} />
              </Field>
              <Field label="Prazo">
                <DueInput t={task} disabled={!canEdit} onChange={(v) => patch(task.id, { dueAt: v })} />
              </Field>
              {task.boardId && groups.some((g) => g.boardId === task.boardId) && (
                <Field label="Grupo">
                  <select value={task.groupId ?? ""} disabled={!canEdit} onChange={(e) => patch(task.id, { groupId: e.target.value })} className="h-9 max-md:h-10 rounded-lg border border-input bg-background px-2 text-[14px]">
                    {groups.filter((g) => g.boardId === task.boardId).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Descrição e anotações">
                <Textarea rows={6} value={desc} disabled={!canEdit} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (task.description ?? "") && patch(task.id, { description: desc })} placeholder="Detalhes, links, o que falta fazer…" />
              </Field>
              {task.dealId && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href={`/negocios/${task.dealId}`}>
                    <Link2 /> Abrir o negócio
                  </Link>
                </Button>
              )}
              {canEdit && (
                <Button type="button" variant="ghost" size="sm" className="w-fit text-muted-foreground hover:text-destructive" onClick={() => window.confirm("Excluir esta tarefa?") && remove(task.id)}>
                  <Trash2 /> Excluir tarefa
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
