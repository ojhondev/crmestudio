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
import { and, asc, eq, ilike, like, or, sql } from "drizzle-orm";
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
    // Esteira de proposta: edital de teste (fecha em 12 dias), certidões no cofre e itens do portfólio
    const close = new Date(Date.now() + 12 * 864e5);
    await db.insert(schema.editais).values({
      externalId: "QA-PROP-1",
      title: "QA — Restauração do forro e dos retábulos da Igreja Matriz de Itu",
      object: "Contratação de empresa especializada para execução de obra de restauração do forro e dos retábulos da Igreja Matriz, bem tombado pelo IPHAN, com douramento e consolidação estrutural.",
      organ: "QA Prefeitura de Itu",
      unit: "Secretaria de Cultura",
      esfera: "municipal",
      uf: "SP",
      city: "Itu",
      modalidade: "Concorrência",
      kind: "execucao",
      score: 92,
      matched: ["restauração", "forro", "retábulo"],
      valueCents: 85_000_000,
      publishedAt: new Date(),
      openAt: new Date(close.getTime() - 2 * 36e5),
      closeAt: close,
      situation: "aberto",
      url: "https://pncp.gov.br/app/editais/qa",
      sourceUrl: "https://portal.example.test/qa",
    });
    const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    await db.insert(schema.cofreDocs).values([
      { type: "certidao_federal", title: "QA — Certidão federal", validUntil: iso(5), issuer: "Receita Federal", ownerId: u.id },
      { type: "certidao_fgts", title: "QA — CRF FGTS", validUntil: iso(90), issuer: "Caixa", ownerId: u.id },
      { type: "contrato_social", title: "QA — Contrato social", ownerId: u.id },
    ]);
    await db.insert(schema.portfolioItems).values([
      { title: "QA — Restauração do forro da Matriz de Sorocaba", client: "Mitra Diocesana", year: 2024, valueCents: 42_000_000, kind: "execucao", tags: ["restauração de forro", "igreja"], tombamento: "iphan", description: "Restauração de forro em madeira pintada, 320 m².", links: [] },
      { title: "QA — Douramento do retábulo-mor", client: "Paróquia QA", year: 2022, kind: "execucao", tags: ["douramento", "retábulo"], tombamento: "estadual", description: "Douramento a folha de ouro.", links: [] },
      { title: "QA — Projeto de pintura de fachada comercial", client: "Cliente QA", year: 2011, kind: "outro", tags: ["fachada"], description: "Pintura simples." },
    ]);
    // Parceiro de editais (app Editais): vê só o edital QA-PROP-1 compartilhado; QA-PROP-2 fica oculto para testar o isolamento
    const partnerPassword = crypto.randomBytes(9).toString("base64url");
    const [pu] = await db
      .insert(schema.users)
      .values({ name: "QA Parceiro", email: "qa-parceiro@example.test", passwordHash: hashPassword(partnerPassword), role: "parceiro", profile: "parceiro_editais", ownOnly: true, calendarToken: crypto.randomBytes(12).toString("hex") })
      .returning({ id: schema.users.id });
    await db.insert(schema.editalPartners).values({ userId: pu.id, company: "QA Engenharia", invitedById: u.id });
    const [qaEd] = await db.select({ id: schema.editais.id }).from(schema.editais).where(eq(schema.editais.externalId, "QA-PROP-1"));
    await db.insert(schema.editais).values({ externalId: "QA-PROP-2", title: "QA — Edital NÃO compartilhado", object: "Obra de restauração de fachada, bem tombado, para teste de isolamento do parceiro", organ: "QA Prefeitura Oculta", uf: "MG", city: "Ouro Preto", kind: "execucao", score: 88, matched: ["restauração"], valueCents: 30_000_000, closeAt: new Date(Date.now() + 20 * 864e5), situation: "aberto" });
    await db.insert(schema.editalShares).values({ editalId: qaEd.id, partnerId: pu.id, role: "contribuir", scope: "proposta", createdById: u.id });
    fs.mkdirSync(".tmp", { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ email: EMAIL, password, userId: u.id, contactId: c.id, dealId: d.id, partner: { email: "qa-parceiro@example.test", password: partnerPassword, userId: pu.id } }, null, 2));
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
    // Avisos e Automações: tarefas, regras, execuções e contas de QA (avisos saem em cascata com a conta)
    await db.delete(schema.tasks).where(like(schema.tasks.title, "QA%"));
    // Editais: editais de teste (QA-…), contatos criados a partir deles e avisos de teste
    await db.delete(schema.editais).where(like(schema.editais.externalId, "QA-%"));
    await db.delete(schema.contacts).where(like(schema.contacts.company, "QA%"));
    await db.delete(schema.notifications).where(like(schema.notifications.title, "%QA —%"));
    await db.delete(schema.automationRuns).where(like(schema.automationRuns.entityLabel, "QA%"));
    await db.delete(schema.automationRules).where(like(schema.automationRules.name, "QA%"));
    await db.delete(schema.auditLog).where(like(schema.auditLog.actorName, "QA %"));
    // Esteira de proposta (dossiês, etapas, itens e matriz saem em cascata com o edital)
    const qaUsers = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "qa-%@example.test"));
    for (const qu of qaUsers) {
      await db.delete(schema.tasks).where(eq(schema.tasks.createdById, qu.id));
      await db.delete(schema.taskBoards).where(and(eq(schema.taskBoards.createdById, qu.id), ilike(schema.taskBoards.name, "Editais")));
    }
    await db.delete(schema.taskGroups).where(like(schema.taskGroups.name, "QA%"));
    await db.delete(schema.sheets).where(like(schema.sheets.name, "%QA%"));
    await db.delete(schema.cofreDocs).where(like(schema.cofreDocs.title, "QA%"));
    await db.delete(schema.portfolioItems).where(like(schema.portfolioItems.title, "QA%"));
    await db.delete(schema.propostaTemplates).where(and(eq(schema.propostaTemplates.builtin, false), like(schema.propostaTemplates.name, "QA%")));
    await db.delete(schema.notifications).where(or(like(schema.notifications.title, "%QA%"), like(schema.notifications.body, "%QA%")));
    await db.delete(schema.editalEvents).where(like(schema.editalEvents.body, "%QA%"));
    // configuração gravada durante o teste (só se tiver marca de QA)
    await db.delete(schema.appSettings).where(and(eq(schema.appSettings.key, "propostas_config"), sql`${schema.appSettings.value}::text like '%QA%'`));
    await db.delete(schema.appSettings).where(and(eq(schema.appSettings.key, "studio"), sql`${schema.appSettings.value}::text like '%QA%'`));
    await db.delete(schema.users).where(like(schema.users.email, "qa-%@example.test"));
    await db.delete(schema.users).where(eq(schema.users.email, EMAIL));
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
    console.log("QA removido:", docs.length, "documento(s)");
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
