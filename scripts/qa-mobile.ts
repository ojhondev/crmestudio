/**
 * Dados de QA para testar Tarefas/Planilhas/Site/Drive no celular. Tudo com prefixo "MQA" e usuário próprio
 * (assim o cleanup do qa-docs.ts, que apaga "QA%", não leva estes dados junto).
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa-mobile.ts create|cleanup
 * A senha é gerada na hora e gravada em .tmp/qa-mobile.json (fora do git).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, like } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import * as siteSchema from "../src/lib/site-schema";
import { hashPassword } from "../src/lib/password";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const sdb = process.env.SITE_DATABASE_URL ? drizzle(neon(process.env.SITE_DATABASE_URL), { schema: siteSchema }) : null;
const EMAIL = "mqa-mobile@example.test";
const FILE = ".tmp/qa-mobile.json";
const day = (n: number) => new Date(Date.now() + n * 864e5);

async function main() {
  if (process.argv[2] === "create") {
    const password = crypto.randomBytes(9).toString("base64url");
    const [u] = await db
      .insert(schema.users)
      .values({ name: "MQA Mobile", email: EMAIL, passwordHash: hashPassword(password), role: "admin", profile: "administrador", calendarToken: crypto.randomBytes(12).toString("hex") })
      .returning({ id: schema.users.id });
    const cols = [
      { id: "c1", name: "Metragem", type: "numero" },
      { id: "c2", name: "Etapa", type: "selecao", options: ["Limpeza", "Reintegração"] },
      { id: "c3", name: "Obs. longa da obra", type: "texto" },
    ] as schema.TaskColumn[];
    const [b] = await db.insert(schema.taskBoards).values({ name: "MQA Quadro mobile", createdById: u.id, columns: cols }).returning();
    const gs = await db.insert(schema.taskGroups).values([{ boardId: b.id, name: "MQA Esta semana", position: 0 }, { boardId: b.id, name: "MQA Depois", position: 1 }]).returning();
    const st = ["a_fazer", "em_andamento", "concluida"] as const;
    const pr = ["baixa", "media", "alta", "urgente"] as const;
    for (let i = 0; i < 14; i++)
      await db.insert(schema.tasks).values({
        title: i % 3 === 0 ? `MQA Tarefa com um título bem comprido para testar quebra de linha no celular número ${i}` : `MQA Tarefa ${i}`,
        boardId: b.id, groupId: gs[i % 2].id, status: st[i % 3], priority: pr[i % 4], assigneeId: i % 2 ? u.id : null,
        dueAt: day(i - 4), position: i, labels: i % 2 ? ["urgente", "igreja"] : [], custom: { c1: i * 3, c2: "Limpeza" },
        subtasks: [{ id: "s1", text: "Passo um", done: true }, { id: "s2", text: "Passo dois", done: false }], createdById: u.id,
      });
    const grid: Record<string, Record<string, unknown>> = {};
    for (let r = 0; r < 40; r++) { grid[r] = {}; for (let c = 0; c < 8; c++) grid[r][c] = r === 0 ? { v: "Col " + c, s: { b: 1 } } : { v: c === 0 ? "Item " + r : r * (c + 1) }; }
    const [sh] = await db.insert(schema.sheets).values({ name: "MQA Planilha mobile", ownerId: u.id }).returning();
    await db.insert(schema.sheetTabs).values([{ sheetId: sh.id, name: "Aba 1", position: 0, grid, layout: {} }, { sheetId: sh.id, name: "Aba 2", position: 1, grid: {}, layout: {} }, { sheetId: sh.id, name: "Orçamento 2026", position: 2, grid: {}, layout: {} }]);
    const [f] = await db.insert(schema.driveFolders).values({ name: "MQA Pasta A", createdById: u.id }).returning();
    await db.insert(schema.driveFolders).values({ name: "MQA Pasta B com nome muito comprido para estourar", createdById: u.id });
    for (let i = 0; i < 6; i++) await db.insert(schema.driveItems).values({ title: `MQA Arquivo ${i} com nome bem comprido.pdf`, url: "https://example.test/x" + i, kind: "pdf", folderId: i < 3 ? f.id : null, createdById: u.id, tags: ["a", "b"] });
    if (sdb) {
      for (let i = 0; i < 3; i++) {
        await sdb.insert(siteSchema.projects).values({ slug: "mqa-proj-" + i, title: "MQA Projeto " + i, summary: "Resumo", gallery: ["https://example.test/a.jpg", "https://example.test/b.jpg", "https://example.test/c.jpg"] });
        await sdb.insert(siteSchema.posts).values({ slug: "mqa-post-" + i, title: "MQA Artigo " + i });
        await sdb.insert(siteSchema.jobs).values({ slug: "mqa-vaga-" + i, title: "MQA Vaga " + i, requirements: ["a", "b"] });
      }
    }
    fs.mkdirSync(".tmp", { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ email: EMAIL, password, userId: u.id, boardId: b.id, sheetId: sh.id }, null, 2));
    console.log("MQA criado — credenciais em", FILE, "board", b.id, "sheet", sh.id);
  } else {
    await db.delete(schema.tasks).where(like(schema.tasks.title, "MQA%"));
    await db.delete(schema.taskBoards).where(like(schema.taskBoards.name, "MQA%"));
    await db.delete(schema.sheets).where(like(schema.sheets.name, "MQA%"));
    await db.delete(schema.driveItems).where(like(schema.driveItems.title, "MQA%"));
    await db.delete(schema.driveFolders).where(like(schema.driveFolders.name, "MQA%"));
    if (sdb) {
      await sdb.delete(siteSchema.projects).where(like(siteSchema.projects.title, "MQA%"));
      await sdb.delete(siteSchema.posts).where(like(siteSchema.posts.title, "MQA%"));
      await sdb.delete(siteSchema.jobs).where(like(siteSchema.jobs.title, "MQA%"));
    }
    await db.delete(schema.auditLog).where(like(schema.auditLog.actorName, "MQA%"));
    await db.delete(schema.users).where(eq(schema.users.email, EMAIL));
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
    console.log("MQA removido");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
