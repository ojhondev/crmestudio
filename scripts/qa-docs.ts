/**
 * Dados temporários para testar Documentos em ambiente local (usuário, contato e negócio de QA).
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa-docs.ts create
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa-docs.ts cleanup
 * A senha é gerada na hora e gravada em .tmp/qa-docs.json (fora do git).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc, eq, like } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import * as siteSchema from "../src/lib/site-schema";
import { del } from "@vercel/blob";
import { hashPassword } from "../src/lib/password";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const EMAIL = "qa-docs@example.test";
const FILE = ".tmp/qa-docs.json";

async function main() {
  const cmd = process.argv[2];
  if (cmd === "create") {
    const password = crypto.randomBytes(9).toString("base64url");
    const [u] = await db
      .insert(schema.users)
      .values({ name: "QA Documentos", email: EMAIL, passwordHash: hashPassword(password), role: "admin", profile: "administrador", calendarToken: crypto.randomBytes(12).toString("hex") })
      .returning({ id: schema.users.id });
    const [c] = await db
      .insert(schema.contacts)
      .values({ name: "Pe. Antônio QA", company: "Paróquia N. Sra. da Candelária", email: "qa-cliente@example.test", phone: "5511990000001", city: "Itu", state: "SP", document: "123.456.789-09", address: "Praça da Matriz, 100, Centro", source: "qa-docs" })
      .returning({ id: schema.contacts.id });
    const [stage] = await db.select().from(schema.stages).orderBy(asc(schema.stages.position)).limit(1);
    const [d] = await db
      .insert(schema.deals)
      .values({ title: "QA — Restauro do forro", contactId: c.id, stageId: stage.id, valueCents: 1850000, service: "Restauro", property: "Igreja Matriz", location: "Itu/SP", ownerId: u.id })
      .returning({ id: schema.deals.id });
    fs.mkdirSync(".tmp", { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ email: EMAIL, password, userId: u.id, contactId: c.id, dealId: d.id }, null, 2));
    console.log("QA criado — credenciais em", FILE);
  } else if (cmd === "cleanup") {
    const docs = await db.select({ id: schema.documents.id }).from(schema.documents).where(like(schema.documents.title, "%QA%"));
    for (const x of docs) await db.delete(schema.documents).where(eq(schema.documents.id, x.id));
    await db.delete(schema.deals).where(like(schema.deals.title, "QA —%"));
    await db.delete(schema.contacts).where(eq(schema.contacts.source, "qa-docs"));
    // Drive (itens e pastas de QA)
    await db.delete(schema.driveItems).where(like(schema.driveItems.title, "QA%"));
    await db.delete(schema.driveFolders).where(like(schema.driveFolders.name, "QA%"));
    // Site (banco separado): projetos, artigos, vagas e mídia de QA
    if (process.env.SITE_DATABASE_URL) {
      const sdb = drizzle(neon(process.env.SITE_DATABASE_URL), { schema: siteSchema });
      await sdb.delete(siteSchema.projects).where(like(siteSchema.projects.title, "QA%"));
      await sdb.delete(siteSchema.posts).where(like(siteSchema.posts.title, "QA%"));
      await sdb.delete(siteSchema.jobs).where(like(siteSchema.jobs.title, "QA%"));
      const media = await sdb.select().from(siteSchema.media).where(like(siteSchema.media.label, "QA%"));
      for (const m of media) {
        try {
          await del(m.url, { token: process.env.SITE_BLOB_READ_WRITE_TOKEN });
        } catch {}
        await sdb.delete(siteSchema.media).where(eq(siteSchema.media.id, m.id));
      }
    }
    await db.delete(schema.auditLog).where(like(schema.auditLog.actorName, "QA Documentos"));
    await db.delete(schema.sheets).where(like(schema.sheets.name, "QA%")); // planilhas de teste (abas e versões saem em cascata)
    await db.delete(schema.taskBoards).where(like(schema.taskBoards.name, "QA%"));
    await db.delete(schema.users).where(eq(schema.users.email, EMAIL));
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
    console.log("QA removido:", docs.length, "documento(s)");
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
