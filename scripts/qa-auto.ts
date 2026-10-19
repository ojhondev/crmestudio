/**
 * Dados de QA para Avisos e Automações (rodar DEPOIS de qa-docs.ts create; a limpeza é a do qa-docs.ts cleanup).
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa-auto.ts create
 * Cria 3 contas (gestor, membro que responde ao gestor, parceiro), um quadro "QA Quadro" com tarefas atrasadas / de véspera /
 * sem responsável e negócios parados. Senhas geradas na hora em .tmp/qa-auto.json (fora do git).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/password";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const FILE = ".tmp/qa-auto.json";
const DAY = 864e5;
const at = (days: number) => new Date(Date.now() + days * DAY);
const dayAt = (days: number) => new Date(`${new Date(Date.now() + days * DAY - 3 * 3600e3).toISOString().slice(0, 10)}T12:00:00-03:00`);

async function main() {
  if (process.argv[2] !== "create") return console.log("uso: create");
  const password = crypto.randomBytes(9).toString("base64url");
  const mk = async (name: string, email: string, extra: Partial<typeof schema.users.$inferInsert>) =>
    (await db.insert(schema.users).values({ name, email, passwordHash: hashPassword(password), calendarToken: crypto.randomBytes(12).toString("hex"), ...extra }).returning({ id: schema.users.id }))[0].id;
  const gestor = await mk("QA Gestor", "qa-gestor@example.test", { role: "admin", profile: "administrador" });
  const membro = await mk("QA Membro", "qa-membro@example.test", { role: "equipe", profile: "comercial", supervisorId: gestor });
  const parceiro = await mk("QA Parceiro", "qa-parceiro@example.test", { role: "parceiro", profile: "parceiro", ownOnly: true });

  const [board] = await db.insert(schema.taskBoards).values({ name: "QA Quadro", createdById: gestor }).returning();
  const [group] = await db.insert(schema.taskGroups).values({ boardId: board.id, name: "QA Grupo" }).returning();
  const base = { boardId: board.id, groupId: group.id, createdById: gestor };
  const tasks = await db
    .insert(schema.tasks)
    .values([
      { ...base, title: "QA atrasada do membro", assigneeId: membro, dueAt: dayAt(-3), priority: "alta" },
      { ...base, title: "QA vence amanhã", assigneeId: membro, dueAt: dayAt(1) },
      { ...base, title: "QA vence hoje", assigneeId: membro, dueAt: dayAt(0) },
      { ...base, title: "QA sem responsável", assigneeId: null, createdAt: at(-3) },
      { ...base, title: "QA do parceiro atrasada", assigneeId: parceiro, dueAt: dayAt(-2) },
      { ...base, title: "QA tarefa para concluir", assigneeId: membro, dueAt: dayAt(5) },
    ])
    .returning({ id: schema.tasks.id, title: schema.tasks.title });

  const stages = await db.select().from(schema.stages).orderBy(asc(schema.stages.position));
  const open = stages.filter((s) => s.kind === "aberto");
  const stage2 = open[1] ?? open[0];
  const [c] = await db.insert(schema.contacts).values({ name: "QA Cliente Auto", source: "qa-docs", email: "qa-auto@example.test" }).returning({ id: schema.contacts.id });
  const mkDeal = async (title: string, o: Partial<typeof schema.deals.$inferInsert>, entryDaysAgo: number, createdDaysAgo: number) => {
    const [d] = await db
      .insert(schema.deals)
      .values({ title, contactId: c.id, stageId: stage2.id, ownerId: membro, createdAt: at(-createdDaysAgo), ...o })
      .returning({ id: schema.deals.id });
    await db.insert(schema.activities).values({ dealId: d.id, userId: gestor, type: "etapa", body: `Movido para “${stage2.name}”`, createdAt: at(-entryDaysAgo) });
    return d.id;
  };
  const parado = await mkDeal("QA — Negócio parado", { valueCents: 800_000 }, 10, 20);
  const alto = await mkDeal("QA — Valor alto parado", { valueCents: 9_000_000, expectedClose: new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10) }, 6, 12);
  const parceiroDeal = await mkDeal("QA — Negócio do parceiro", { ownerId: null, partnerId: parceiro, valueCents: 100_000 }, 9, 15);
  fs.mkdirSync(".tmp", { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ password, gestor: { id: gestor, email: "qa-gestor@example.test" }, membro: { id: membro, email: "qa-membro@example.test" }, parceiro: { id: parceiro, email: "qa-parceiro@example.test" }, boardId: board.id, groupId: group.id, tasks, deals: { parado, alto, parceiroDeal } }, null, 2));
  console.log("QA de automações criado — credenciais em", FILE);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
