/**
 * Dados de QA para testar Tarefas/Planilhas/Site/Drive no celular. Tudo com prefixo "QA".
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa-mobile.ts create|cleanup
 * O cleanup de scripts/qa-docs.ts remove Drive/Site; este remove quadro, planilhas e (por garantia) o resto.
 */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, like } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import * as siteSchema from "../src/lib/site-schema";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const sdb = process.env.SITE_DATABASE_URL ? drizzle(neon(process.env.SITE_DATABASE_URL), { schema: siteSchema }) : null;
const qa = JSON.parse(fs.readFileSync(".tmp/qa-docs.json", "utf8"));
const day = (n: number) => new Date(Date.now() + n * 864e5);

async function main() {
  if (process.argv[2] === "create") {
    const cols: schema.TaskColumn[] = [
      { id: "c1", name: "Metragem", type: "numero" },
      { id: "c2", name: "Etapa", type: "selecao", options: ["Limpeza", "Reintegração"] },
      { id: "c3", name: "Obs. longa da obra", type: "texto" },
    ] as schema.TaskColumn[];
    const [b] = await db.insert(schema.taskBoards).values({ name: "QA Quadro mobile", createdById: qa.userId, columns: cols }).returning();
    const gs = await db.insert(schema.taskGroups).values([{ boardId: b.id, name: "QA Esta semana", position: 0 }, { boardId: b.id, name: "QA Depois", position: 1 }]).returning();
    const st = ["a_fazer", "em_andamento", "concluida"] as const;
    const pr = ["baixa", "media", "alta", "urgente"] as const;
    for (let i = 0; i < 14; i++)
      await db.insert(schema.tasks).values({
        title: i % 3 === 0 ? `QA Tarefa com um título bem comprido para testar quebra de linha no celular número ${i}` : `QA Tarefa ${i}`,
        boardId: b.id, groupId: gs[i % 2].id, status: st[i % 3], priority: pr[i % 4], assigneeId: i % 2 ? qa.userId : null,
        dueAt: day(i - 4), position: i, labels: i % 2 ? ["urgente", "igreja"] : [], custom: { c1: i * 3, c2: "Limpeza" },
        subtasks: [{ id: "s1", text: "Passo um", done: true }, { id: "s2", text: "Passo dois", done: false }], createdById: qa.userId,
      });
    const grid: Record<string, Record<string, unknown>> = {};
    for (let r = 0; r < 40; r++) { grid[r] = {}; for (let c = 0; c < 8; c++) grid[r][c] = r === 0 ? { v: "Col " + c, s: { b: 1 } } : { v: c === 0 ? "Item " + r : r * (c + 1) }; }
    const [sh] = await db.insert(schema.sheets).values({ name: "QA Planilha mobile", ownerId: qa.userId }).returning();
    await db.insert(schema.sheetTabs).values([{ sheetId: sh.id, name: "Aba 1", position: 0, grid, layout: {} }, { sheetId: sh.id, name: "Aba 2", position: 1, grid: {}, layout: {} }, { sheetId: sh.id, name: "Orçamento 2026", position: 2, grid: {}, layout: {} }]);
    const [f] = await db.insert(schema.driveFolders).values({ name: "QA Pasta A", createdById: qa.userId }).returning();
    await db.insert(schema.driveFolders).values({ name: "QA Pasta B com nome muito comprido para estourar", createdById: qa.userId });
    for (let i = 0; i < 6; i++) await db.insert(schema.driveItems).values({ title: `QA Arquivo ${i} com nome bem comprido.pdf`, url: "https://example.test/x" + i, kind: "pdf", folderId: i < 3 ? f.id : null, createdById: qa.userId, tags: ["a", "b"] });
    if (sdb) {
      for (let i = 0; i < 3; i++) {
        await sdb.insert(siteSchema.projects).values({ slug: "qa-proj-" + i, title: "QA Projeto " + i, summary: "Resumo", gallery: ["https://example.test/a.jpg", "https://example.test/b.jpg", "https://example.test/c.jpg"] });
        await sdb.insert(siteSchema.posts).values({ slug: "qa-post-" + i, title: "QA Artigo " + i });
        await sdb.insert(siteSchema.jobs).values({ slug: "qa-vaga-" + i, title: "QA Vaga " + i, requirements: ["a", "b"] });
      }
    }
    console.log("ok", b.id, sh.id);
  } else {
    await db.delete(schema.taskBoards).where(like(schema.taskBoards.name, "QA%"));
    await db.delete(schema.sheets).where(like(schema.sheets.name, "QA%"));
    await db.delete(schema.driveItems).where(like(schema.driveItems.title, "QA%"));
    await db.delete(schema.driveFolders).where(like(schema.driveFolders.name, "QA%"));
    if (sdb) {
      await sdb.delete(siteSchema.projects).where(like(siteSchema.projects.title, "QA%"));
      await sdb.delete(siteSchema.posts).where(like(siteSchema.posts.title, "QA%"));
      await sdb.delete(siteSchema.jobs).where(like(siteSchema.jobs.title, "QA%"));
    }
    console.log("limpo");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
