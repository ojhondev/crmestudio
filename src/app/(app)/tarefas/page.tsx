import type { Metadata } from "next";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { has, requireAccess } from "@/lib/auth";
import { PageBody, PageHeader } from "@/components/page-header";
import { Tarefas } from "./tarefas";
import type { TaskDTO } from "./actions";

export const metadata: Metadata = { title: "Tarefas" };

export default async function TarefasPage({ searchParams }: PageProps<"/tarefas">) {
  const user = await requireAccess("tarefas");
  const sp = await searchParams;
  const canEdit = has(user, "tarefas", "edit");
  const canManage = has(user, "tarefas", "manage");

  const [allBoards, users] = await Promise.all([
    user.ownOnly ? Promise.resolve([]) : db.select().from(schema.taskBoards).orderBy(asc(schema.taskBoards.position), asc(schema.taskBoards.createdAt)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)),
  ]);

  const wanted = typeof sp.quadro === "string" ? sp.quadro : "";
  const board = wanted && wanted !== "minhas" ? (allBoards.find((b) => b.id === wanted) ?? null) : null;
  const mode = board ? "board" : "minhas";
  const view = sp.vista === "kanban" ? "kanban" : "tabela";

  const cols = {
    t: schema.tasks,
    dealTitle: schema.deals.title,
  };
  const base = db.select({ t: cols.t, dealTitle: cols.dealTitle }).from(schema.tasks).leftJoin(schema.deals, eq(schema.tasks.dealId, schema.deals.id));

  let rows: { t: typeof schema.tasks.$inferSelect; dealTitle: string | null }[];
  let groups: (typeof schema.taskGroups.$inferSelect)[] = [];
  if (board) {
    [rows, groups] = await Promise.all([
      base.where(eq(schema.tasks.boardId, board.id)).orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt)),
      db.select().from(schema.taskGroups).where(eq(schema.taskGroups.boardId, board.id)).orderBy(asc(schema.taskGroups.position)),
    ]);
  } else {
    // minhas: atribuídas a mim, ou criadas por mim e sem responsável
    rows = await base
      .where(or(eq(schema.tasks.assigneeId, user.id), and(eq(schema.tasks.createdById, user.id), isNull(schema.tasks.assigneeId))))
      .orderBy(desc(schema.tasks.createdAt))
      .limit(500);
  }

  const tasks: TaskDTO[] = rows.map(({ t, dealTitle }) => ({
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
  }));

  return (
    <>
      <PageHeader eyebrow="Operação" title="Tarefas" description="Organize o trabalho do estúdio em quadros, com responsável, prazo e situação — como num quadro de projetos." />
      <PageBody>
        <Tarefas
          key={`${mode}:${board?.id ?? ""}`}
          mode={mode}
          boards={allBoards.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
          board={board ? { id: board.id, name: board.name, color: board.color } : null}
          groups={groups}
          tasks={tasks}
          users={users}
          meId={user.id}
          canEdit={canEdit}
          canManage={canManage}
          boardNames={Object.fromEntries(allBoards.map((b) => [b.id, b.name]))}
          view={view}
        />
      </PageBody>
    </>
  );
}
