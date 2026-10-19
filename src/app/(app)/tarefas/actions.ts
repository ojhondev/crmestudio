"use server";

import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { TaskColumn, TaskColumnType, TaskLink, TaskPriority, TaskRecur, TaskStatus, TaskSubtask } from "@/lib/db/schema";
import { BOARD_TEMPLATES } from "@/lib/task-templates";
import { addDays, cleanCustomValue, nextDue, type TaskDTO } from "@/lib/tasks";
import { isoDateBR, todayISO } from "@/lib/format";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const STATUSES: TaskStatus[] = ["a_fazer", "em_andamento", "travada", "concluida"];
const PRIORITIES: TaskPriority[] = ["baixa", "media", "alta", "urgente"];
const COLORS = ["#b75928", "#2a78d6", "#2f6b4f", "#776157", "#537179", "#8a4fb0", "#c8452c"];
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const newId = () => crypto.randomUUID().slice(0, 8);

/** Data (yyyy-mm-dd) → meio-dia no fuso do estúdio, para nunca "virar o dia" por fuso. */
const dueFrom = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-03:00`) : null);

export type { TaskDTO };

const toDTO = (t: typeof schema.tasks.$inferSelect, dealTitle: string | null = null): TaskDTO => ({
  id: t.id,
  title: t.title,
  status: t.doneAt ? "concluida" : t.status === "concluida" ? "a_fazer" : t.status,
  priority: t.priority,
  assigneeId: t.assigneeId,
  dueAt: t.dueAt?.toISOString() ?? null,
  description: t.description,
  boardId: t.boardId,
  groupId: t.groupId,
  dealId: t.dealId,
  dealTitle,
  position: t.position,
  createdAt: t.createdAt.toISOString(),
  custom: t.custom ?? {},
  subtasks: t.subtasks ?? [],
  labels: t.labels ?? [],
  links: t.links ?? [],
  recur: t.recur ?? null,
});

const STATUS_NAME: Record<TaskStatus, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", travada: "Travada", concluida: "Concluída" };
const PRIORITY_NAME: Record<TaskPriority, string> = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" };

async function logActivity(taskId: string, userId: string, body: string) {
  await db.insert(schema.taskComments).values({ taskId, userId, kind: "atividade", body });
}

/** Quem é "só os próprios" mexe apenas nas tarefas atribuídas a ele ou criadas por ele. */
const canTouch = (user: { id: string; ownOnly: boolean }, t: { assigneeId: string | null; createdById: string | null }) =>
  !user.ownOnly || t.assigneeId === user.id || t.createdById === user.id;

/* --------------------------------- quadros --------------------------------- */

export async function createBoard(name: string, templateKey?: string) {
  const user = await requireAccess("tarefas", "edit");
  const n = str(name, 80);
  if (!n) return { error: "Dê um nome ao quadro." };
  const tpl = BOARD_TEMPLATES.find((t) => t.key === templateKey);
  const [{ m }] = await db.select({ m: max(schema.taskBoards.position) }).from(schema.taskBoards);
  const pos = (m ?? -1) + 1;
  const columns: TaskColumn[] = (tpl?.columns ?? []).map((c) => ({ ...c, id: newId() }));
  const [board] = await db.insert(schema.taskBoards).values({ name: n, color: COLORS[pos % COLORS.length], position: pos, createdById: user.id, columns }).returning();
  if (!tpl) {
    const [group] = await db.insert(schema.taskGroups).values({ boardId: board.id, name: "Tarefas", color: "#537179", position: 0 }).returning();
    return { board, group };
  }
  const today = todayISO();
  let first: typeof schema.taskGroups.$inferSelect | null = null;
  for (const [gi, g] of tpl.groups.entries()) {
    const [group] = await db.insert(schema.taskGroups).values({ boardId: board.id, name: g.name, color: g.color, position: gi }).returning();
    first ??= group;
    for (const [ti, t] of g.tasks.entries()) {
      await db.insert(schema.tasks).values({
        title: t.title,
        boardId: board.id,
        groupId: group.id,
        position: ti + 1,
        priority: t.priority ?? "media",
        dueAt: t.inDays === undefined ? null : dueFrom(addDays(today, t.inDays)),
        labels: t.labels ?? [],
        recur: t.recur ?? null,
        subtasks: (t.subtasks ?? []).map((text) => ({ id: newId(), text, done: false })),
        createdById: user.id,
      });
    }
  }
  return { board, group: first };
}

export async function renameBoard(id: string, name: string) {
  await requireAccess("tarefas", "edit");
  const n = str(name, 80);
  if (!isId(id) || !n) return { error: "Nome inválido." };
  await db.update(schema.taskBoards).set({ name: n }).where(eq(schema.taskBoards.id, id));
  return { ok: true };
}

export async function deleteBoard(id: string) {
  const user = await requireAccess("tarefas", "manage");
  if (!isId(id)) return { error: "Quadro inválido." };
  const [b] = await db.select().from(schema.taskBoards).where(eq(schema.taskBoards.id, id));
  await db.delete(schema.taskBoards).where(eq(schema.taskBoards.id, id));
  if (b) await audit(user, "quadro_excluido", `Excluiu o quadro de tarefas "${b.name}"`, { entity: "tarefas", entityId: id });
  return { ok: true };
}

/* --------------------------------- grupos --------------------------------- */

export async function createGroup(boardId: string, name: string) {
  await requireAccess("tarefas", "edit");
  const n = str(name, 80);
  if (!isId(boardId) || !n) return { error: "Informe o nome do grupo." };
  const [{ m }] = await db.select({ m: max(schema.taskGroups.position) }).from(schema.taskGroups).where(eq(schema.taskGroups.boardId, boardId));
  const pos = (m ?? -1) + 1;
  const [group] = await db.insert(schema.taskGroups).values({ boardId, name: n, color: COLORS[(pos + 3) % COLORS.length], position: pos }).returning();
  return { group };
}

export async function updateGroup(id: string, patch: { name?: string; color?: string }) {
  await requireAccess("tarefas", "edit");
  if (!isId(id)) return { error: "Grupo inválido." };
  const set: Partial<{ name: string; color: string }> = {};
  if (patch.name !== undefined) set.name = str(patch.name, 80) || "Grupo";
  if (patch.color && /^#[0-9a-f]{6}$/i.test(patch.color)) set.color = patch.color;
  await db.update(schema.taskGroups).set(set).where(eq(schema.taskGroups.id, id));
  return { ok: true };
}

export async function deleteGroup(id: string) {
  await requireAccess("tarefas", "manage");
  if (!isId(id)) return { error: "Grupo inválido." };
  // tarefas do grupo são excluídas junto (o quadro não aceita item sem grupo)
  await db.delete(schema.tasks).where(eq(schema.tasks.groupId, id));
  await db.delete(schema.taskGroups).where(eq(schema.taskGroups.id, id));
  return { ok: true };
}

export async function duplicateGroup(id: string) {
  const user = await requireAccess("tarefas", "edit");
  if (!isId(id)) return { error: "Grupo inválido." };
  const [g] = await db.select().from(schema.taskGroups).where(eq(schema.taskGroups.id, id));
  if (!g) return { error: "Grupo não encontrado." };
  const [{ m }] = await db.select({ m: max(schema.taskGroups.position) }).from(schema.taskGroups).where(eq(schema.taskGroups.boardId, g.boardId));
  const [ng] = await db
    .insert(schema.taskGroups)
    .values({ boardId: g.boardId, name: str(`${g.name} (cópia)`, 80), color: g.color, position: (m ?? 0) + 1 })
    .returning();
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.groupId, id)).orderBy(asc(schema.tasks.position));
  const tasks: TaskDTO[] = [];
  for (const cur of rows) {
    const [n] = await db
      .insert(schema.tasks)
      .values({
        title: cur.title,
        description: cur.description,
        boardId: cur.boardId,
        groupId: ng.id,
        assigneeId: cur.assigneeId,
        priority: cur.priority,
        dueAt: cur.dueAt,
        labels: cur.labels,
        links: cur.links,
        custom: cur.custom,
        recur: cur.recur,
        subtasks: (cur.subtasks ?? []).map((x) => ({ ...x, done: false })),
        position: cur.position,
        createdById: user.id,
      })
      .returning();
    tasks.push(toDTO(n));
  }
  return { group: ng, tasks };
}

/* --------------------------------- tarefas --------------------------------- */

export async function createTask(input: { boardId: string; groupId: string; title: string; assigneeId?: string | null; dueAt?: string | null; status?: string; priority?: string }) {
  const user = await requireAccess("tarefas", "edit");
  const title = str(input.title, 200);
  if (!isId(input.boardId) || !isId(input.groupId) || !title) return { error: "Escreva o título da tarefa." };
  const [{ m }] = await db.select({ m: max(schema.tasks.position) }).from(schema.tasks).where(eq(schema.tasks.groupId, input.groupId));
  const status = STATUSES.includes(input.status as TaskStatus) ? (input.status as TaskStatus) : "a_fazer";
  const [t] = await db
    .insert(schema.tasks)
    .values({
      title,
      boardId: input.boardId,
      groupId: input.groupId,
      position: (m ?? 0) + 1,
      status,
      doneAt: status === "concluida" ? new Date() : null,
      priority: PRIORITIES.includes(input.priority as TaskPriority) ? (input.priority as TaskPriority) : "media",
      assigneeId: isId(input.assigneeId) ? input.assigneeId : user.ownOnly ? user.id : null,
      dueAt: dueFrom(input.dueAt),
      createdById: user.id,
    })
    .returning();
  return { task: toDTO(t) };
}

/** Tarefa avulsa (vai para "Minhas tarefas"), sem quadro. */
export async function createLooseTask(input: { title: string; dueAt?: string | null }) {
  const user = await requireAccess("tarefas", "edit");
  const title = str(input.title, 200);
  if (!title) return { error: "Escreva o título da tarefa." };
  const [t] = await db.insert(schema.tasks).values({ title, assigneeId: user.id, createdById: user.id, dueAt: dueFrom(input.dueAt) }).returning();
  return { task: toDTO(t) };
}

export type TaskPatch = {
  title?: string;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  dueAt?: string | null;
  description?: string | null;
  groupId?: string;
  position?: number;
  subtasks?: TaskSubtask[];
  labels?: string[];
  links?: TaskLink[];
  recur?: string | null;
  /** valores de colunas personalizadas a gravar: { [idDaColuna]: valor | null } */
  custom?: Record<string, unknown>;
};

export async function updateTask(id: string, patch: TaskPatch) {
  const user = await requireAccess("tarefas", "edit");
  if (!isId(id)) return { error: "Tarefa inválida." };
  const [cur] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!cur) return { error: "Tarefa não encontrada." };
  if (!canTouch(user, cur)) return { error: "Sem acesso a esta tarefa." };

  const set: Partial<typeof schema.tasks.$inferInsert> = {};
  const notes: string[] = [];
  if (patch.title !== undefined) {
    const t = str(patch.title, 200);
    if (!t) return { error: "O título não pode ficar vazio." };
    if (t !== cur.title) notes.push("renomeou a tarefa");
    set.title = t;
  }
  let completedNow = false;
  if (patch.status !== undefined && STATUSES.includes(patch.status as TaskStatus)) {
    const st = patch.status as TaskStatus;
    const was: TaskStatus = cur.doneAt ? "concluida" : cur.status;
    set.status = st;
    set.doneAt = st === "concluida" ? (cur.doneAt ?? new Date()) : null; // mantém compatível com as tarefas dentro de negócios
    if (st !== was) notes.push(`mudou a situação para "${STATUS_NAME[st]}"`);
    completedNow = st === "concluida" && was !== "concluida";
  }
  if (patch.priority !== undefined && PRIORITIES.includes(patch.priority as TaskPriority)) {
    set.priority = patch.priority as TaskPriority;
    if (patch.priority !== cur.priority) notes.push(`mudou a prioridade para "${PRIORITY_NAME[patch.priority as TaskPriority]}"`);
  }
  if (patch.assigneeId !== undefined) {
    set.assigneeId = isId(patch.assigneeId) ? patch.assigneeId : null;
    if (set.assigneeId !== cur.assigneeId) {
      if (set.assigneeId) {
        const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, set.assigneeId));
        notes.push(`atribuiu a ${u?.name ?? "outra pessoa"}`);
      } else notes.push("removeu o responsável");
    }
  }
  if (patch.dueAt !== undefined) {
    set.dueAt = dueFrom(patch.dueAt);
    const before = cur.dueAt ? isoDateBR(cur.dueAt) : null;
    if ((patch.dueAt || null) !== before) notes.push(patch.dueAt ? `definiu o prazo para ${patch.dueAt.split("-").reverse().join("/")}` : "removeu o prazo");
  }
  if (patch.description !== undefined) set.description = str(patch.description, 4000) || null;
  if (patch.position !== undefined && Number.isFinite(patch.position)) set.position = patch.position;
  if (patch.groupId !== undefined && isId(patch.groupId)) {
    const [g] = await db.select().from(schema.taskGroups).where(eq(schema.taskGroups.id, patch.groupId));
    if (g) {
      set.groupId = g.id;
      set.boardId = g.boardId;
      if (g.id !== cur.groupId) notes.push(`moveu para o grupo "${g.name}"`);
    }
  }
  if (patch.subtasks !== undefined && Array.isArray(patch.subtasks)) {
    set.subtasks = patch.subtasks
      .slice(0, 100)
      .map((x) => ({ id: str(x?.id, 40) || newId(), text: str(x?.text, 200), done: !!x?.done }))
      .filter((x) => x.text);
  }
  if (patch.labels !== undefined && Array.isArray(patch.labels)) {
    set.labels = [...new Set(patch.labels.map((l) => str(l, 30)).filter(Boolean))].slice(0, 12);
  }
  if (patch.links !== undefined && Array.isArray(patch.links)) {
    set.links = patch.links
      .slice(0, 30)
      .map((l) => ({ id: str(l?.id, 40) || newId(), url: str(l?.url, 500), name: str(l?.name, 120) }))
      .filter((l) => /^https?:\/\//i.test(l.url))
      .map((l) => ({ ...l, name: l.name || l.url.replace(/^https?:\/\//i, "").slice(0, 60) }));
  }
  if (patch.recur !== undefined) set.recur = patch.recur === "diaria" || patch.recur === "semanal" || patch.recur === "mensal" ? (patch.recur as TaskRecur) : null;
  if (patch.custom && typeof patch.custom === "object" && cur.boardId) {
    const [board] = await db.select({ columns: schema.taskBoards.columns }).from(schema.taskBoards).where(eq(schema.taskBoards.id, cur.boardId));
    const next = { ...(cur.custom ?? {}) };
    for (const [colId, v] of Object.entries(patch.custom)) {
      const col = (board?.columns ?? []).find((c) => c.id === colId);
      if (!col) continue;
      const clean = cleanCustomValue(col, v);
      if (clean === null) delete next[colId];
      else next[colId] = clean;
    }
    set.custom = next;
  }
  if (!Object.keys(set).length) return { ok: true };
  const [t] = await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id)).returning();
  for (const n of notes) await logActivity(id, user.id, n);

  // recorrência: ao concluir, nasce a próxima ocorrência
  let spawned: TaskDTO | undefined;
  if (completedNow && t.recur && t.dueAt) {
    const [{ m }] = await db
      .select({ m: max(schema.tasks.position) })
      .from(schema.tasks)
      .where(t.groupId ? eq(schema.tasks.groupId, t.groupId) : eq(schema.tasks.id, t.id));
    const [n] = await db
      .insert(schema.tasks)
      .values({
        title: t.title,
        description: t.description,
        boardId: t.boardId,
        groupId: t.groupId,
        dealId: t.dealId,
        contactId: t.contactId,
        assigneeId: t.assigneeId,
        priority: t.priority,
        labels: t.labels,
        links: t.links,
        custom: {},
        recur: t.recur,
        subtasks: (t.subtasks ?? []).map((x) => ({ ...x, done: false })),
        position: (m ?? 0) + 1,
        dueAt: dueFrom(nextDue(isoDateBR(t.dueAt), t.recur)),
        createdById: user.id,
      })
      .returning();
    await logActivity(n.id, user.id, "criada automaticamente (tarefa recorrente)");
    spawned = toDTO(n);
  }
  return { task: toDTO(t), spawned };
}

export async function deleteTask(id: string) {
  const user = await requireAccess("tarefas", "edit");
  if (!isId(id)) return { error: "Tarefa inválida." };
  const [cur] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!cur) return { ok: true };
  // apagar tarefa dos outros exige Gerenciar; a própria, só Editar
  if (cur.createdById !== user.id && !has(user, "tarefas", "manage")) return { error: "Só quem criou ou gerencia pode excluir." };
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, id)));
  return { ok: true };
}

export async function duplicateTask(id: string) {
  const user = await requireAccess("tarefas", "edit");
  if (!isId(id)) return { error: "Tarefa inválida." };
  const [cur] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!cur) return { error: "Tarefa não encontrada." };
  if (!canTouch(user, cur)) return { error: "Sem acesso a esta tarefa." };
  const [{ m }] = await db
    .select({ m: max(schema.tasks.position) })
    .from(schema.tasks)
    .where(cur.groupId ? eq(schema.tasks.groupId, cur.groupId) : eq(schema.tasks.id, cur.id));
  const [n] = await db
    .insert(schema.tasks)
    .values({
      title: str(`${cur.title} (cópia)`, 200),
      description: cur.description,
      boardId: cur.boardId,
      groupId: cur.groupId,
      assigneeId: cur.assigneeId,
      priority: cur.priority,
      dueAt: cur.dueAt,
      labels: cur.labels,
      links: cur.links,
      custom: cur.custom,
      recur: cur.recur,
      subtasks: (cur.subtasks ?? []).map((x) => ({ ...x, done: false })),
      position: (m ?? 0) + 1,
      createdById: user.id,
    })
    .returning();
  return { task: toDTO(n) };
}

/* ------------------------------ ações em massa e ordem ------------------------------ */

export async function bulkUpdateTasks(ids: string[], patch: { status?: string; assigneeId?: string | null; dueAt?: string | null; priority?: string }) {
  const user = await requireAccess("tarefas", "edit");
  const list = (Array.isArray(ids) ? ids : []).filter(isId).slice(0, 300);
  if (!list.length) return { error: "Nenhuma tarefa selecionada." };
  const rows = await db.select().from(schema.tasks).where(inArray(schema.tasks.id, list));
  const out: TaskDTO[] = [];
  for (const cur of rows) {
    if (!canTouch(user, cur)) continue;
    const r = await updateTask(cur.id, patch);
    if ("task" in r && r.task) out.push(r.task);
    if ("spawned" in r && r.spawned) out.push(r.spawned);
  }
  return { tasks: out };
}

export async function bulkDeleteTasks(ids: string[]) {
  const user = await requireAccess("tarefas", "edit");
  const list = (Array.isArray(ids) ? ids : []).filter(isId).slice(0, 300);
  if (!list.length) return { error: "Nenhuma tarefa selecionada." };
  const rows = await db.select().from(schema.tasks).where(inArray(schema.tasks.id, list));
  const allowed = rows.filter((t) => t.createdById === user.id || has(user, "tarefas", "manage")).map((t) => t.id);
  if (allowed.length) await db.delete(schema.tasks).where(inArray(schema.tasks.id, allowed));
  return { deleted: allowed, skipped: rows.length - allowed.length };
}

/** Grava a ordem/grupo depois de arrastar. */
export async function moveTask(id: string, to: { groupId?: string; position: number }) {
  const r = await updateTask(id, { position: to.position, groupId: to.groupId });
  return "error" in r && r.error ? { error: r.error } : { ok: true };
}

export async function reorderGroups(boardId: string, ids: string[]) {
  await requireAccess("tarefas", "edit");
  if (!isId(boardId)) return { error: "Quadro inválido." };
  const rows = await db.select().from(schema.taskGroups).where(eq(schema.taskGroups.boardId, boardId)).orderBy(asc(schema.taskGroups.position));
  const known = new Set(rows.map((r) => r.id));
  let i = 0;
  for (const id of ids.filter((x) => known.has(x))) await db.update(schema.taskGroups).set({ position: i++ }).where(eq(schema.taskGroups.id, id));
  return { ok: true };
}

/* ------------------------------ colunas do quadro ------------------------------ */

const COL_TYPES: TaskColumnType[] = ["texto", "numero", "data", "selecao", "pessoa", "caixa", "link"];

export async function addBoardColumn(boardId: string, input: { name: string; type: string; options?: string[] }) {
  await requireAccess("tarefas", "edit");
  const name = str(input.name, 40);
  if (!isId(boardId) || !name) return { error: "Dê um nome à coluna." };
  if (!COL_TYPES.includes(input.type as TaskColumnType)) return { error: "Tipo de coluna inválido." };
  const [b] = await db.select().from(schema.taskBoards).where(eq(schema.taskBoards.id, boardId));
  if (!b) return { error: "Quadro não encontrado." };
  if ((b.columns ?? []).length >= 12) return { error: "Limite de 12 colunas personalizadas por quadro." };
  const options = input.type === "selecao" ? [...new Set((input.options ?? []).map((o) => str(o, 40)).filter(Boolean))].slice(0, 20) : undefined;
  if (input.type === "selecao" && !options?.length) return { error: "Informe as opções da seleção, separadas por vírgula." };
  const column: TaskColumn = { id: newId(), name, type: input.type as TaskColumnType, ...(options ? { options } : {}) };
  await db.update(schema.taskBoards).set({ columns: [...(b.columns ?? []), column] }).where(eq(schema.taskBoards.id, boardId));
  return { column };
}

export async function removeBoardColumn(boardId: string, columnId: string) {
  await requireAccess("tarefas", "edit");
  if (!isId(boardId)) return { error: "Quadro inválido." };
  const [b] = await db.select().from(schema.taskBoards).where(eq(schema.taskBoards.id, boardId));
  if (!b) return { error: "Quadro não encontrado." };
  await db.update(schema.taskBoards).set({ columns: (b.columns ?? []).filter((c) => c.id !== columnId) }).where(eq(schema.taskBoards.id, boardId));
  return { ok: true };
}

/* ------------------------------ comentários e atividade ------------------------------ */

export type FeedItem = { id: string; kind: "comentario" | "atividade"; body: string; at: string; userName: string | null };

export async function getTaskFeed(taskId: string): Promise<{ items: FeedItem[] } | { error: string }> {
  const user = await requireAccess("tarefas");
  if (!isId(taskId)) return { error: "Tarefa inválida." };
  const [cur] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!cur || !canTouch(user, cur)) return { error: "Sem acesso a esta tarefa." };
  const rows = await db
    .select({ id: schema.taskComments.id, kind: schema.taskComments.kind, body: schema.taskComments.body, at: schema.taskComments.createdAt, userName: schema.users.name })
    .from(schema.taskComments)
    .leftJoin(schema.users, eq(schema.taskComments.userId, schema.users.id))
    .where(eq(schema.taskComments.taskId, taskId))
    .orderBy(desc(schema.taskComments.createdAt))
    .limit(100);
  return { items: rows.map((r) => ({ ...r, at: r.at.toISOString() })) };
}

export async function addTaskComment(taskId: string, body: string): Promise<{ item: FeedItem } | { error: string }> {
  const user = await requireAccess("tarefas", "edit");
  const text = str(body, 2000);
  if (!isId(taskId) || !text) return { error: "Escreva o comentário." };
  const [cur] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!cur || !canTouch(user, cur)) return { error: "Sem acesso a esta tarefa." };
  const [r] = await db.insert(schema.taskComments).values({ taskId, userId: user.id, kind: "comentario", body: text }).returning();
  return { item: { id: r.id, kind: "comentario", body: r.body, at: r.createdAt.toISOString(), userName: user.name } };
}
