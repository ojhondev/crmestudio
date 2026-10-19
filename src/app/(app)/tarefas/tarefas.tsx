"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Columns3, List, ListFilter, Loader2, Plus, Rows3, Search, SlidersHorizontal, Table2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { DialogCloseBtn } from "@/components/touch-close";
import { PageToolbar, ToolArea, ToolbarGroup } from "@/components/toolbar";
import { cn } from "@/lib/utils";
import { isoDateBR, todayISO } from "@/lib/format";
import type { TaskBoard, TaskColumn, TaskColumnType, TaskGroup, TaskPriority, TaskStatus } from "@/lib/db/schema";
import { BOARD_TEMPLATES } from "@/lib/task-templates";
import { COLUMN_TYPES, NO_FILTERS, filterTasks, groupTasks, sortTasks, type DueFilter, type Filters, type GroupBy, type SortKey, type TaskDTO } from "@/lib/tasks";
import {
  addBoardColumn,
  bulkDeleteTasks,
  bulkUpdateTasks,
  createBoard,
  createGroup,
  createLooseTask,
  createTask,
  deleteBoard,
  deleteGroup,
  deleteTask,
  duplicateGroup,
  duplicateTask,
  moveTask,
  removeBoardColumn,
  renameBoard,
  updateGroup,
  updateTask,
  type TaskPatch,
} from "./actions";
import { PRIORITY, STATUS, usePrefs, type Patch, type User, type View } from "./task-bits";
import { TaskSheet } from "./task-sheet";
import { CalendarView, KanbanView, TableView, TimelineView } from "./views";

type BoardLite = Pick<TaskBoard, "id" | "name" | "color">;
type Props = {
  mode: "board" | "minhas";
  boards: BoardLite[];
  board: (BoardLite & { columns: TaskColumn[] }) | null;
  groups: TaskGroup[];
  tasks: TaskDTO[];
  users: User[];
  meId: string;
  canEdit: boolean;
  canManage: boolean;
  boardNames: Record<string, string>;
  view: "tabela" | "kanban";
};

const VIEWS: { v: View; label: string; icon: React.ElementType }[] = [
  { v: "tabela", label: "Tabela", icon: Table2 },
  { v: "lista", label: "Lista", icon: List },
  { v: "kanban", label: "Kanban", icon: Columns3 },
  { v: "calendario", label: "Calendário", icon: CalendarDays },
  { v: "linha", label: "Linha do tempo", icon: Rows3 },
];

const selectCls = "h-8 w-full rounded-lg border border-input bg-background px-2 text-[13px] max-md:h-11 max-md:text-base";

/* --------------------------------- componente --------------------------------- */

export function Tarefas(props: Props) {
  const { mode, boards, board, users, meId, canEdit, canManage, boardNames } = props;
  const router = useRouter();
  const isMobile = useIsMobile();
  // no celular a visão padrão é a lista em cartões (a escolha do usuário continua valendo)
  const [prefs, setPrefs] = usePrefs(board?.id ?? "minhas", props.view === "kanban" ? { view: "kanban" } : isMobile ? { view: "lista" } : undefined);
  const [tasks, setTasks] = useState<TaskDTO[]>(props.tasks);
  const [groups, setGroups] = useState<TaskGroup[]>(props.groups);
  const [columns, setColumns] = useState<TaskColumn[]>(board?.columns ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [colsOpen, setColsOpen] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [busy, setBusy] = useState(false);

  // dados do servidor (troca de quadro/atualização) substituem o estado local
  const [seen, setSeen] = useState(props);
  if (props.tasks !== seen.tasks || props.groups !== seen.groups) {
    setSeen(props);
    setTasks(props.tasks);
    setGroups(props.groups);
    setColumns(props.board?.columns ?? []);
  }

  const today = todayISO();
  const view: View = mode === "minhas" ? "tabela" : isMobile && prefs.view === "tabela" ? "lista" : prefs.view;
  const f: Filters = useMemo(() => ({ ...filters, hideDone: prefs.hideDone }), [filters, prefs.hideDone]);
  const activeFilters = [f.who, f.priority, f.status, f.due, f.label].filter(Boolean).length + (prefs.hideDone ? 1 : 0);

  const patch: Patch = async (id, p: TaskPatch) => {
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
        if (p.position !== undefined) n.position = p.position;
        if (p.subtasks) n.subtasks = p.subtasks;
        if (p.labels) n.labels = p.labels;
        if (p.links) n.links = p.links.map((l) => ({ ...l, name: l.name || l.url }));
        if (p.recur !== undefined) n.recur = (p.recur as TaskDTO["recur"]) ?? null;
        if (p.custom) {
          const c = { ...n.custom };
          for (const [k, v] of Object.entries(p.custom)) {
            if (v === null || v === "" || v === undefined) delete c[k];
            else c[k] = v;
          }
          n.custom = c;
        }
        return n;
      }),
    );
    const r = await updateTask(id, p);
    if (r && "error" in r && r.error) {
      toast.error(r.error);
      setTasks(prev);
    } else if (r && "task" in r && r.task) {
      const saved = r.task;
      const spawned = "spawned" in r ? r.spawned : undefined;
      setTasks((all) => {
        const next = all.map((t) => (t.id === id ? { ...saved, dealTitle: t.dealTitle } : t));
        return spawned ? [...next, spawned] : next;
      });
      if (spawned) toast.success("Próxima ocorrência criada", { description: "Tarefa recorrente: a nova já está no quadro." });
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

  const duplicate = async (id: string) => {
    const r = await duplicateTask(id);
    if ("error" in r && r.error) return void toast.error(r.error);
    if ("task" in r && r.task) {
      setTasks((all) => [...all, r.task]);
      toast.success("Tarefa duplicada");
    }
  };

  const add = async (groupId: string, title: string, extra?: { status?: string; priority?: string; assigneeId?: string | null; dueAt?: string | null }) => {
    if (!board || !title.trim()) return;
    const r = await createTask({ boardId: board.id, groupId, title, ...extra });
    if ("error" in r && r.error) return void toast.error(r.error);
    if ("task" in r && r.task) setTasks((all) => [...all, r.task]);
  };

  const newTask = async (dueAt?: string) => {
    if (!board || !groups[0]) return;
    const r = await createTask({ boardId: board.id, groupId: groups[0].id, title: "Nova tarefa", dueAt });
    if ("error" in r && r.error) return void toast.error(r.error);
    if ("task" in r && r.task) {
      setTasks((all) => [...all, r.task]);
      setOpen(r.task.id);
    }
  };

  const move = async (id: string, groupId: string, position: number) => {
    const prev = tasks;
    setTasks((all) => all.map((t) => (t.id === id ? { ...t, groupId, position } : t)));
    const r = await moveTask(id, { groupId, position });
    if ("error" in r && r.error) {
      toast.error(r.error);
      setTasks(prev);
    }
  };

  const select = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const bulk = async (p: { status?: string; assigneeId?: string | null; dueAt?: string | null }) => {
    const ids = [...selected];
    setBusy(true);
    const r = await bulkUpdateTasks(ids, p);
    setBusy(false);
    if ("error" in r && r.error) return void toast.error(r.error);
    if ("tasks" in r && r.tasks) {
      const byId = new Map(r.tasks.map((t) => [t.id, t]));
      setTasks((all) => {
        const known = new Set(all.map((t) => t.id));
        return [...all.map((t) => byId.get(t.id) ?? t), ...r.tasks.filter((t) => !known.has(t.id))];
      });
    }
    toast.success(`${ids.length} ${ids.length === 1 ? "tarefa atualizada" : "tarefas atualizadas"}`);
    setSelected(new Set());
  };

  const bulkRemove = async () => {
    const ids = [...selected];
    if (!window.confirm(`Excluir ${ids.length} ${ids.length === 1 ? "tarefa" : "tarefas"}? Não dá para desfazer.`)) return;
    setBusy(true);
    const r = await bulkDeleteTasks(ids);
    setBusy(false);
    if ("error" in r && r.error) return void toast.error(r.error);
    if ("deleted" in r && r.deleted) {
      setTasks((all) => all.filter((t) => !r.deleted.includes(t.id)));
      if (r.skipped) toast.message(`${r.skipped} não puderam ser excluídas (só quem criou ou gerencia pode excluir).`);
    }
    setSelected(new Set());
  };

  const visible = useMemo(() => sortTasks(filterTasks(tasks, f, today, isoDateBR), prefs.sort), [tasks, f, today, prefs.sort]);
  const ctx = { users, groups, today, toDay: isoDateBR };
  const tableBy: GroupBy = mode === "minhas" ? "prazo" : prefs.groupBy;
  const sections = useMemo(() => groupTasks(visible, tableBy, ctx), [visible, tableBy, groups, users, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => Object.fromEntries(groupTasks(tasks, tableBy, ctx).map((s) => [s.key, s.tasks.length])), [tasks, tableBy, groups, users, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const kSections = useMemo(() => groupTasks(visible, prefs.kGroup, ctx), [visible, prefs.kGroup, groups, users, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => [...new Set(tasks.flatMap((t) => t.labels))].sort(), [tasks]);
  const openTask = tasks.find((t) => t.id === open) ?? null;
  const href = (b: string) => `/tarefas?quadro=${b}`;

  const filtersPanel = (
    <div className="grid gap-3 text-[13px]">
      <label className="grid gap-1">
        <span className="label">Responsável</span>
        <select value={filters.who} onChange={(e) => setFilters({ ...filters, who: e.target.value })} className={selectCls}>
          <option value="">Todos</option>
          <option value="none">Sem responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="label">Prioridade</span>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className={selectCls}>
          <option value="">Todas</option>
          {Object.entries(PRIORITY).map(([k, o]) => (
            <option key={k} value={k}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="label">Situação</span>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={selectCls}>
          <option value="">Todas</option>
          {Object.entries(STATUS).map(([k, o]) => (
            <option key={k} value={k}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="label">Prazo</span>
        <select value={filters.due} onChange={(e) => setFilters({ ...filters, due: e.target.value as DueFilter })} className={selectCls}>
          <option value="">Qualquer</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="hoje">Hoje</option>
          <option value="semana">Hoje e próximos 7 dias</option>
          <option value="sem-prazo">Sem prazo</option>
        </select>
      </label>
      {labels.length > 0 && (
        <label className="grid gap-1">
          <span className="label">Etiqueta</span>
          <select value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })} className={selectCls}>
            <option value="">Todas</option>
            {labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-2 max-md:min-h-10">
        <input type="checkbox" checked={prefs.hideDone} onChange={(e) => setPrefs({ hideDone: e.target.checked })} className="size-4 accent-brand" /> Ocultar concluídas
      </label>
      {activeFilters > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => {
            setFilters(NO_FILTERS);
            setPrefs({ hideDone: false });
          }}
        >
          <X /> Limpar filtros
        </Button>
      )}
    </div>
  );

  const organizePanel = (
    <div className="grid gap-3 text-[13px]">
      {(view === "tabela" || view === "lista") && (
        <label className="grid gap-1">
          <span className="label">Agrupar por</span>
          <select value={prefs.groupBy} onChange={(e) => setPrefs({ groupBy: e.target.value as GroupBy })} className={selectCls}>
            <option value="grupo">Grupo do quadro</option>
            <option value="responsavel">Responsável</option>
            <option value="prioridade">Prioridade</option>
            <option value="situacao">Situação</option>
            <option value="prazo">Prazo</option>
          </select>
        </label>
      )}
      {view === "kanban" && (
        <label className="grid gap-1">
          <span className="label">Colunas do kanban</span>
          <select value={prefs.kGroup} onChange={(e) => setPrefs({ kGroup: e.target.value as "situacao" | "responsavel" | "prioridade" })} className={selectCls}>
            <option value="situacao">Situação</option>
            <option value="responsavel">Responsável</option>
            <option value="prioridade">Prioridade</option>
          </select>
        </label>
      )}
      {(view === "tabela" || view === "lista") && (
        <label className="grid gap-1">
          <span className="label">Ordenar por</span>
          <select value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value as SortKey })} className={selectCls}>
            <option value="manual">Ordem manual (arraste)</option>
            <option value="prazo">Prazo</option>
            <option value="prioridade">Prioridade</option>
            <option value="situacao">Situação</option>
            <option value="titulo">Título (A–Z)</option>
          </select>
        </label>
      )}
      {mode === "board" && board && (canEdit || columns.length > 0) && (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setColsOpen(true)}>
          <Columns3 /> Colunas personalizadas{columns.length > 0 ? ` (${columns.length})` : ""}
        </Button>
      )}
      {(view === "tabela" || view === "lista") && prefs.groupBy !== "grupo" && <p className="text-[12px] text-muted-foreground">Agrupando por outro critério, não dá para arrastar ou adicionar tarefas direto na seção.</p>}
      {(view === "tabela" || view === "lista") && prefs.groupBy === "grupo" && prefs.sort !== "manual" && <p className="text-[12px] text-muted-foreground">Para arrastar e reordenar, volte para “Ordem manual”.</p>}
    </div>
  );

  const toolbarFilters = (
    <>
      <div className="relative w-40 shrink-0 sm:w-56" data-tour="task-filters">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Buscar tarefa…" aria-label="Buscar tarefa" className="h-9 pl-8 max-md:h-11" />
      </div>
      {mode === "board" && (
        <ToolbarGroup className="max-md:hidden">
          {VIEWS.map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              onClick={() => setPrefs({ view: v })}
              aria-pressed={view === v}
              title={label}
              aria-label={`Visão ${label}`}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors max-md:min-h-9", view === v ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="size-3.5" />
              <span className="max-xl:hidden">{label}</span>
            </button>
          ))}
        </ToolbarGroup>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <ListFilter /> Filtros
            {activeFilters > 0 && <span className="grid size-4.5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-on-brand">{activeFilters}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 max-w-[calc(100vw-1.5rem)]">
          {filtersPanel}
        </PopoverContent>
      </Popover>
      {mode === "board" && view !== "calendario" && view !== "linha" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <SlidersHorizontal /> Organizar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-72 max-w-[calc(100vw-1.5rem)]">
            {organizePanel}
          </PopoverContent>
        </Popover>
      )}
    </>
  );

  const boardsRow = (
    <div data-tour="task-boards" className="thin-scroll flex h-11 items-center gap-1.5 overflow-x-auto border-t px-3 max-md:h-14 sm:px-5" role="tablist" aria-label="Quadros">
      <Link href="/tarefas?quadro=minhas" role="tab" aria-selected={mode === "minhas"} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] max-md:min-h-11", mode === "minhas" ? "border-foreground bg-foreground font-medium text-background" : "bg-card hover:border-foreground/40")}>
        <Check className="size-3.5" /> Minhas tarefas
      </Link>
      {boards.map((b) => (
        <Link key={b.id} href={href(b.id)} role="tab" aria-selected={board?.id === b.id} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] max-md:min-h-11", board?.id === b.id ? "border-foreground bg-foreground font-medium text-background" : "bg-card hover:border-foreground/40")}>
          <span className="size-2 rounded-full" style={{ background: b.color }} /> {b.name}
        </Link>
      ))}
      {canEdit && !newBoard && (
        <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-full max-md:h-11" onClick={() => setNewBoard(true)}>
          <Plus /> Quadro
        </Button>
      )}
      {newBoard && (
        <form
          className="flex shrink-0 gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const tpl = String(fd.get("tpl") ?? "");
            const name = String(fd.get("name") ?? "").trim() || BOARD_TEMPLATES.find((t) => t.key === tpl)?.name || "";
            const r = await createBoard(name, tpl || undefined);
            if ("error" in r && r.error) return void toast.error(r.error);
            if ("board" in r && r.board) router.push(href(r.board.id));
          }}
        >
          <select name="tpl" aria-label="Modelo do quadro" className="h-8 max-w-44 rounded-lg border border-input bg-background px-2 text-[13px] max-md:h-11 max-md:text-base">
            <option value="">Em branco</option>
            {BOARD_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key} title={t.description}>
                Modelo: {t.name}
              </option>
            ))}
          </select>
          <Input name="name" autoFocus placeholder="Nome do quadro" className="h-8 w-44 max-md:h-11" onKeyDown={(e) => e.key === "Escape" && setNewBoard(false)} />
          <Button type="submit" size="sm" className="max-md:h-11">
            Criar
          </Button>
        </form>
      )}
    </div>
  );

  const tableCommon = {
    groups,
    users,
    canEdit,
    canManage,
    patch,
    openTask: setOpen,
    selected,
    select,
    totals,
    onAdd: (gid: string, title: string) => add(gid, title),
    onRenameGroup: async (id: string, name: string) => {
      setGroups((all) => all.map((x) => (x.id === id ? { ...x, name } : x)));
      await updateGroup(id, { name });
    },
    onDeleteGroup: async (id: string, name: string) => {
      if (!window.confirm(`Excluir o grupo "${name}" e as tarefas dele?`)) return;
      setGroups((all) => all.filter((x) => x.id !== id));
      setTasks((all) => all.filter((t) => t.groupId !== id));
      await deleteGroup(id);
    },
    onDuplicateGroup: async (id: string) => {
      const r = await duplicateGroup(id);
      if ("error" in r && r.error) return void toast.error(r.error);
      if ("group" in r && r.group) {
        setGroups((a) => [...a, r.group]);
        setTasks((a) => [...a, ...r.tasks]);
        toast.success("Grupo duplicado");
      }
    },
    onMove: move,
    onEditColumns: () => setColsOpen(true),
  };

  return (
    <>
      <PageToolbar
        title="Tarefas"
        filters={toolbarFilters}
        actions={
          mode === "board" && canEdit && groups.length > 0 ? (
            <Button type="button" size="sm" className="max-md:hidden" onClick={() => newTask()}>
              <Plus /> Nova tarefa
            </Button>
          ) : undefined
        }
        tabs={boardsRow}
      />
      {mode === "board" && canEdit && groups.length > 0 && selected.size === 0 && (
        <button type="button" onClick={() => newTask()} aria-label="Nova tarefa" className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-brand text-on-brand shadow-lg active:scale-95 md:hidden">
          <Plus className="size-6" />
        </button>
      )}
      <ToolArea className="md:h-[calc(100dvh-7rem-2.75rem)]">
        <div className="relative grid grid-cols-[minmax(0,1fr)] gap-4 p-3 pb-24 sm:p-5">
          {mode === "minhas" ? (
            <Minhas
              sections={sections}
              totals={totals}
              all={tasks}
              users={users}
              meId={meId}
              canEdit={canEdit}
              boardNames={boardNames}
              common={tableCommon}
              onAdded={(t) => setTasks((a) => [t, ...a])}
            />
          ) : board ? (
            <>
              <div role="tablist" aria-label="Visão" className="grid grid-cols-4 gap-1 rounded-xl border bg-card p-1 md:hidden">
                {VIEWS.filter((x) => x.v !== "tabela").map(({ v, label, icon: Icon }) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setPrefs({ view: v })} className={cn("flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11.5px] leading-tight", view === v ? "bg-foreground font-medium text-background" : "text-muted-foreground")}>
                    <Icon className="size-4" />
                    <span className="truncate">{v === "linha" ? "Cronograma" : label}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <BoardTitle board={board} canEdit={canEdit} />
                {view === "kanban" && canEdit && <p className="text-[12.5px] text-muted-foreground"><span className="max-md:hidden">Arraste um cartão para outra coluna para mudar </span><span className="md:hidden">Use “Mover” no cartão para mudar </span>{prefs.kGroup === "situacao" ? "a situação" : prefs.kGroup === "prioridade" ? "a prioridade" : "o responsável"}. Toque para ver detalhes.</p>}
                {(view === "tabela" || view === "lista") && canEdit && prefs.groupBy === "grupo" && prefs.sort === "manual" && <p className="text-[12.5px] text-muted-foreground max-md:hidden">Arraste pelo ícone ⋮⋮ para reordenar ou mover entre grupos.</p>}
              </div>
              {view === "tabela" || view === "lista" ? (
                <>
                  <TableView {...tableCommon} sections={sections} realGroups={prefs.groupBy === "grupo"} manual={prefs.sort === "manual"} compact={view === "lista"} columns={view === "lista" ? [] : columns} />
                  {canEdit && prefs.groupBy === "grupo" && (
                    <form
                      className="flex gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const name = String(new FormData(form).get("name") ?? "");
                        const r = await createGroup(board.id, name);
                        if ("error" in r && r.error) return void toast.error(r.error);
                        if ("group" in r && r.group) setGroups((a) => [...a, r.group]);
                        form.reset();
                      }}
                    >
                      <Input name="name" placeholder="Nome do novo grupo (ex.: Esta semana)" aria-label="Novo grupo" className="h-9 max-w-xs max-md:h-11" />
                      <Button type="submit" variant="outline" size="sm" className="max-md:h-11">
                        Adicionar grupo
                      </Button>
                    </form>
                  )}
                  {groups.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">Este quadro não tem grupos. Crie um grupo (por exemplo “Esta semana”) para começar a adicionar tarefas.</p>}
                </>
              ) : view === "kanban" ? (
                <KanbanView
                  sections={kSections}
                  by={prefs.kGroup}
                  users={users}
                  canEdit={canEdit}
                  patch={patch}
                  openTask={setOpen}
                  onAdd={(key, title) =>
                    groups[0] &&
                    add(groups[0].id, title, prefs.kGroup === "situacao" ? { status: key } : prefs.kGroup === "prioridade" ? { priority: key } : { assigneeId: key === "none" ? null : key })
                  }
                />
              ) : view === "calendario" ? (
                <CalendarView tasks={visible} mode={prefs.calMode} setMode={(m) => setPrefs({ calMode: m })} canEdit={canEdit} patch={patch} openTask={setOpen} onCreate={(d) => newTask(d)} />
              ) : (
                <TimelineView sections={groupTasks(visible, "grupo", ctx)} openTask={setOpen} />
              )}
              {board && canManage && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive max-md:h-11"
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
            </>
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-[14px] text-muted-foreground">
              Nenhum quadro ainda. {canEdit ? "Crie o primeiro em “+ Quadro” — por exemplo com o modelo “Rotina do estúdio” ou “Obra de restauro”." : ""}
            </p>
          )}

          {selected.size > 0 && canEdit && (
            <div role="toolbar" aria-label="Ações em massa" className="sticky bottom-3 z-20 mx-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-md:grid max-md:w-full max-md:grid-cols-2">
              <span className="text-[13px] font-medium max-md:col-span-2 max-md:flex max-md:min-h-11 max-md:items-center max-md:justify-between">
                {selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}
                <Button type="button" variant="ghost" size="sm" className="md:hidden" onClick={() => setSelected(new Set())}>
                  Limpar
                </Button>
              </span>
              <select aria-label="Mudar situação" disabled={busy} value="" onChange={(e) => e.target.value && bulk({ status: e.target.value })} className={cn(selectCls, "w-auto max-md:w-full")}>
                <option value="">Situação…</option>
                {Object.entries(STATUS).map(([k, o]) => (
                  <option key={k} value={k}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select aria-label="Mudar responsável" disabled={busy} value="" onChange={(e) => e.target.value && bulk({ assigneeId: e.target.value === "__none" ? null : e.target.value })} className={cn(selectCls, "w-auto max-md:w-full")}>
                <option value="">Responsável…</option>
                <option value="__none">Sem responsável</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[13px]">
                <span className="max-md:sr-only">Prazo</span>
                <input type="date" aria-label="Definir prazo" disabled={busy} onChange={(e) => e.target.value && bulk({ dueAt: e.target.value })} className="h-8 min-w-0 rounded-lg border border-input bg-background px-2 text-[13px] max-md:h-11 max-md:flex-1 max-md:text-base" />
              </label>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={bulkRemove} className="text-destructive max-md:h-11">
                {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Excluir
              </Button>
              <Button type="button" variant="ghost" size="sm" className="max-md:hidden" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </div>
          )}
        </div>
      </ToolArea>

      <TaskSheet
        task={openTask}
        users={users}
        canEdit={canEdit}
        boardName={openTask?.boardId ? boardNames[openTask.boardId] : null}
        groups={groups}
        columns={columns}
        knownLabels={labels}
        onClose={() => setOpen(null)}
        patch={patch}
        remove={remove}
        duplicate={duplicate}
      />
      {board && (
        <ColumnsDialog
          open={colsOpen}
          onOpenChange={setColsOpen}
          boardId={board.id}
          columns={columns}
          canEdit={canEdit}
          onAdded={(c) => setColumns((a) => [...a, c])}
          onRemoved={(id) => {
            setColumns((a) => a.filter((c) => c.id !== id));
            setTasks((all) => all.map((t) => (id in t.custom ? { ...t, custom: Object.fromEntries(Object.entries(t.custom).filter(([k]) => k !== id)) } : t)));
          }}
        />
      )}
    </>
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
        className="h-9 min-w-0 rounded-md border border-transparent bg-transparent px-1 text-[20px] font-semibold hover:border-input focus:border-ring focus:outline-none max-md:h-11"
      />
    </div>
  );
}

/* ------------------------------- colunas do quadro ------------------------------- */

function ColumnsDialog({ open, onOpenChange, boardId, columns, canEdit, onAdded, onRemoved }: { open: boolean; onOpenChange: (v: boolean) => void; boardId: string; columns: TaskColumn[]; canEdit: boolean; onAdded: (c: TaskColumn) => void; onRemoved: (id: string) => void }) {
  const [type, setType] = useState<TaskColumnType>("texto");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const typeLabel = (t: string) => COLUMN_TYPES.find((x) => x.v === t)?.l ?? t;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogCloseBtn />
        <DialogHeader className="pr-10">
          <DialogTitle>Colunas do quadro</DialogTitle>
          <DialogDescription>Campos extras de cada tarefa deste quadro: texto, número, data, seleção, pessoa, caixa de seleção ou link.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1.5">
          {columns.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border py-1 pl-3 text-[13.5px]">
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              <span className="min-w-0 max-w-[45%] truncate text-xs text-muted-foreground">
                {typeLabel(c.type)}
                {c.options ? ` · ${c.options.join(", ")}` : ""}
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remover coluna ${c.name}`}
                  className="grid size-9 shrink-0 place-items-center rounded text-muted-foreground hover:text-destructive max-md:size-11"
                  onClick={async () => {
                    if (!window.confirm(`Remover a coluna "${c.name}"? Os valores preenchidos serão perdidos.`)) return;
                    await removeBoardColumn(boardId, c.id);
                    onRemoved(c.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
          {columns.length === 0 && <li className="text-[13px] text-muted-foreground">Nenhuma coluna personalizada ainda.</li>}
        </ul>
        {canEdit && (
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              const r = await addBoardColumn(boardId, { name: String(fd.get("name") ?? ""), type, options: String(fd.get("options") ?? "").split(",") });
              setBusy(false);
              if ("error" in r && r.error) return void toast.error(r.error);
              if ("column" in r && r.column) {
                onAdded(r.column);
                e.currentTarget.reset();
                setType("texto");
                nameRef.current?.focus();
              }
            }}
          >
            <div className="flex flex-wrap gap-2">
              <Input ref={nameRef} name="name" placeholder="Nome da coluna" aria-label="Nome da coluna" className="h-9 min-w-40 flex-1" />
              <select value={type} onChange={(e) => setType(e.target.value as TaskColumnType)} aria-label="Tipo da coluna" className="h-9 rounded-lg border border-input bg-background px-2 text-[13px] max-md:h-11 max-md:text-base">
                {COLUMN_TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.l}
                  </option>
                ))}
              </select>
            </div>
            {type === "selecao" && <Input name="options" placeholder="Opções separadas por vírgula (ex.: Limpeza, Reintegração)" aria-label="Opções" className="h-9" />}
            <Button type="submit" size="sm" disabled={busy} className="w-fit max-md:h-11">
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar coluna
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- minhas tarefas ------------------------------- */

function Minhas({
  sections,
  totals,
  all,
  users,
  meId,
  canEdit,
  boardNames,
  common,
  onAdded,
}: {
  sections: React.ComponentProps<typeof TableView>["sections"];
  totals: Record<string, number>;
  all: TaskDTO[];
  users: User[];
  meId: string;
  canEdit: boolean;
  boardNames: Record<string, string>;
  common: Omit<React.ComponentProps<typeof TableView>, "sections" | "realGroups" | "manual" | "compact" | "columns">;
  onAdded: (t: TaskDTO) => void;
}) {
  void boardNames;
  void totals;
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const openCount = all.filter((t) => t.status !== "concluida").length;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[20px] font-semibold">Minhas tarefas</h2>
        <span className="text-[13px] text-muted-foreground">{openCount} em aberto</span>
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
          <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que você precisa fazer? Digite e tecle Enter" aria-label="Nova tarefa" className="h-9 min-w-0 flex-1 bg-transparent text-[14px] focus:outline-none max-md:h-11 max-md:basis-[calc(100%-2rem)] max-md:text-base" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Prazo da nova tarefa" className="h-8 w-36 max-md:h-11 max-md:flex-1" />
          <Button type="submit" size="sm" disabled={!title.trim()} className="max-md:h-11">
            Adicionar
          </Button>
        </form>
      )}
      {sections.every((s) => s.tasks.length === 0) && <p className="rounded-xl border border-dashed p-8 text-center text-[14px] text-muted-foreground">Nada por aqui. Quando alguém atribuir uma tarefa a você, ela aparece nesta lista, organizada por prazo.</p>}
      <TableView {...common} sections={sections} realGroups={false} manual={false} compact={false} columns={[]} />
      <p className="text-[12px] text-muted-foreground">Aqui aparecem as tarefas atribuídas a você ({users.find((u) => u.id === meId)?.name}) em todos os quadros e dentro dos negócios.</p>
    </div>
  );
}
