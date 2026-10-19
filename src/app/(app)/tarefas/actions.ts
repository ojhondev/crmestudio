"use server";

import { and, asc, eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { TaskPriority, TaskStatus } from "@/lib/db/schema";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const STATUSES: TaskStatus[] = ["a_fazer", "em_andamento", "travada", "concluida"];
const PRIORITIES: TaskPriority[] = ["baixa", "media", "alta", "urgente"];
const COLORS = ["#b75928", "#2a78d6", "#2f6b4f", "#776157", "#537179", "#8a4fb0", "#c8452c"];
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Data (yyyy-mm-dd) → meio-dia no fuso do estúdio, para nunca "virar o dia" por fuso. */
const dueFrom = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-03:00`) : null);

export type TaskDTO = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueAt: string | null;
  description: string | null;
  boardId: string | null;
  groupId: string | null;
  dealId: string | null;
  dealTitle: string | null;
  position: number;
};

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
});

/* --------------------------------- quadros --------------------------------- */

export async function createBoard(name: string) {
  const user = await requireAccess("tarefas", "edit");
  const n = str(name, 80);
  if (!n) return { error: "Dê um nome ao quadro." };
  const [{ m }] = await db.select({ m: max(schema.taskBoards.position) }).from(schema.taskBoards);
  const pos = (m ?? -1) + 1;
  const [board] = await db.insert(schema.taskBoards).values({ name: n, color: COLORS[pos % COLORS.length], position: pos, createdById: user.id }).returning();
  const [group] = await db.insert(schema.taskGroups).values({ boardId: board.id, name: "Tarefas", color: "#537179", position: 0 }).returning();
  return { board, group };
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

/* --------------------------------- tarefas --------------------------------- */

export async function createTask(input: { boardId: string; groupId: string; title: string; assigneeId?: string | null; dueAt?: string | null }) {
  const user = await requireAccess("tarefas", "edit");
  const title = str(input.title, 200);
  if (!isId(input.boardId) || !isId(input.groupId) || !title) return { error: "Escreva o título da tarefa." };
  const [{ m }] = await db.select({ m: max(schema.tasks.position) }).from(schema.tasks).where(eq(schema.tasks.groupId, input.groupId));
  const [t] = await db
    .insert(schema.tasks)
    .values({
      title,
      boardId: input.boardId,
      groupId: input.groupId,
      position: (m ?? 0) + 1,
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

export async function updateTask(
  id: string,
  patch: { title?: string; status?: string; priority?: string; assigneeId?: string | null; dueAt?: string | null; description?: string | null; groupId?: string },
) {
  const user = await requireAccess("tarefas", "edit");
  if (!isId(id)) return { error: "Tarefa inválida." };
  const [cur] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!cur) return { error: "Tarefa não encontrada." };
  if (user.ownOnly && cur.assigneeId !== user.id && cur.createdById !== user.id) return { error: "Sem acesso a esta tarefa." };

  const set: Partial<typeof schema.tasks.$inferInsert> = {};
  if (patch.title !== undefined) {
    const t = str(patch.title, 200);
    if (!t) return { error: "O título não pode ficar vazio." };
    set.title = t;
  }
  if (patch.status !== undefined && STATUSES.includes(patch.status as TaskStatus)) {
    set.status = patch.status as TaskStatus;
    set.doneAt = patch.status === "concluida" ? new Date() : null; // mantém compatível com as tarefas dentro de negócios
  }
  if (patch.priority !== undefined && PRIORITIES.includes(patch.priority as TaskPriority)) set.priority = patch.priority as TaskPriority;
  if (patch.assigneeId !== undefined) set.assigneeId = isId(patch.assigneeId) ? patch.assigneeId : null;
  if (patch.dueAt !== undefined) set.dueAt = dueFrom(patch.dueAt);
  if (patch.description !== undefined) set.description = str(patch.description, 4000) || null;
  if (patch.groupId !== undefined && isId(patch.groupId)) {
    const [g] = await db.select().from(schema.taskGroups).where(eq(schema.taskGroups.id, patch.groupId));
    if (g) {
      set.groupId = g.id;
      set.boardId = g.boardId;
    }
  }
  if (!Object.keys(set).length) return { ok: true };
  const [t] = await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id)).returning();
  return { task: toDTO(t) };
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

export async function reorderGroups(boardId: string, ids: string[]) {
  await requireAccess("tarefas", "edit");
  if (!isId(boardId)) return { error: "Quadro inválido." };
  const rows = await db.select().from(schema.taskGroups).where(eq(schema.taskGroups.boardId, boardId)).orderBy(asc(schema.taskGroups.position));
  const known = new Set(rows.map((r) => r.id));
  let i = 0;
  for (const id of ids.filter((x) => known.has(x))) await db.update(schema.taskGroups).set({ position: i++ }).where(eq(schema.taskGroups.id, id));
  return { ok: true };
}
