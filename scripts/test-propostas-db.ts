/**
 * Testes da esteira de proposta COM banco (cria e apaga dados "QA-TEST"): idempotência de “Vou participar”,
 * do checklist, das tarefas (inclusive em chamadas simultâneas), dos documentos e da planilha; resultado → negócio.
 *
 *   npm run test:propostas:db
 */
import "./_server-only.cjs";

let fail = 0;
let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  n++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};

async function main() {
  const { and, eq: deq, like, inArray, or } = await import("drizzle-orm");
  const { db, schema } = await import("../src/lib/db");
  const { PROFILES } = await import("../src/lib/permissions");
  const ops = await import("../src/lib/propostas/ops");
  const { loadBundle, listTemplates } = await import("../src/lib/propostas/server");
  const { hashPassword } = await import("../src/lib/password");
  const crypto = await import("node:crypto");

  const EMAIL = "qa-propostas-db@example.test";
  const cleanup = async () => {
    const eds = await db.select({ id: schema.editais.id }).from(schema.editais).where(like(schema.editais.externalId, "QA-TEST-PROP-%"));
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(deq(schema.users.email, EMAIL));
    if (u) {
      await db.delete(schema.tasks).where(deq(schema.tasks.createdById, u.id));
      await db.delete(schema.taskBoards).where(and(deq(schema.taskBoards.createdById, u.id)));
    }
    await db.delete(schema.taskGroups).where(like(schema.taskGroups.name, "QA%"));
    if (eds.length) {
      await db.delete(schema.documents).where(inArray(schema.documents.editalId, eds.map((e) => e.id)));
      await db.delete(schema.sheets).where(like(schema.sheets.name, "%QA%"));
    }
    await db.delete(schema.deals).where(like(schema.deals.title, "QA-TEST%"));
    await db.delete(schema.contacts).where(like(schema.contacts.company, "QA-TEST%"));
    await db.delete(schema.editais).where(like(schema.editais.externalId, "QA-TEST-PROP-%"));
    await db.delete(schema.notifications).where(or(like(schema.notifications.title, "%QA-TEST%"), like(schema.notifications.body, "%QA-TEST%")));
    await db.delete(schema.auditLog).where(like(schema.auditLog.actorName, "QA-TEST%"));
    await db.delete(schema.users).where(deq(schema.users.email, EMAIL));
  };
  await cleanup();

  try {
    const [u] = await db
      .insert(schema.users)
      .values({ name: "QA-TEST Propostas", email: EMAIL, passwordHash: hashPassword(crypto.randomBytes(9).toString("base64url")), role: "admin", profile: "administrador", calendarToken: crypto.randomBytes(12).toString("hex") })
      .returning({ id: schema.users.id });
    const actor = { id: u.id, name: "QA-TEST Propostas", role: "admin" as const, ownOnly: false, perms: PROFILES.administrador.perms };

    const close = new Date(Date.now() + 20 * 864e5);
    const [e] = await db
      .insert(schema.editais)
      .values({ externalId: "QA-TEST-PROP-1", title: "QA-TEST Restauração do forro", object: "Obra de restauração do forro da Igreja Matriz", organ: "QA-TEST Prefeitura", uf: "SP", city: "Itu", kind: "execucao", score: 90, modalidade: "Concorrência", valueCents: 50_000_000, closeAt: close, openAt: close, situation: "aberto" })
      .returning();

    // “Vou participar” duas vezes (e em paralelo): um dossiê só, sem itens duplicados
    const [r1, r2] = await Promise.all([ops.startProposta(actor, e.id), ops.startProposta(actor, e.id)]);
    eq("ok" in r1 && "ok" in r2, true, "as duas chamadas simultâneas terminam bem");
    const dossies = await db.select().from(schema.propostaDossies).where(deq(schema.propostaDossies.editalId, e.id));
    eq(dossies.length, 1, "um dossiê por edital");
    const d = dossies[0];
    const tpl = (await listTemplates("checklist")).find((t) => t.key === "obra")!;
    const steps = await db.select().from(schema.propostaSteps).where(deq(schema.propostaSteps.dossieId, d.id));
    eq(steps.length, 8, "8 etapas");
    const items = await db.select().from(schema.propostaItems).where(deq(schema.propostaItems.dossieId, d.id));
    eq(items.length, (tpl.items as unknown[]).length, "itens do modelo, sem duplicar");
    const reqs = await db.select().from(schema.propostaRequirements).where(deq(schema.propostaRequirements.dossieId, d.id));
    ok(reqs.length >= 10, "matriz de habilitação criada");
    const taskIds = items.map((i) => i.taskId).filter(Boolean);
    eq(taskIds.length, items.length, "uma tarefa por item");
    eq(new Set(taskIds).size, taskIds.length, "tarefas não repetidas");
    const tasks = await db.select().from(schema.tasks).where(inArray(schema.tasks.id, taskIds as string[]));
    eq(tasks.length, items.length, "tarefas existem no banco (sem órfãs de corrida)");
    const boards = await db.select().from(schema.taskBoards).where(deq(schema.taskBoards.createdById, u.id));
    const groupIds = new Set(tasks.map((t) => t.groupId));
    eq(groupIds.size, 1, "todas as tarefas do edital no mesmo grupo");
    ok(boards.length <= 1, "quadro “Editais” criado uma vez (ou já existia)");
    const [after] = await db.select().from(schema.editais).where(deq(schema.editais.id, e.id));
    eq(after.triage, "em_proposta", "edital passa a “em proposta”");
    ok(!!after.dealId, "negócio criado");

    // reaplicar: nada novo; remover item e reaplicar recria só o que sumiu
    eq((await ops.applyChecklist(actor, d.id)).created, 0, "reaplicar o checklist não cria nada");
    eq((await ops.syncTasks(actor, d.id)).created, 0, "reaplicar as tarefas não cria nada");
    const [first] = items;
    await db.delete(schema.propostaItems).where(deq(schema.propostaItems.id, first.id));
    if (first.taskId) await db.delete(schema.tasks).where(deq(schema.tasks.id, first.taskId)); // como faz “remover item” na tela
    eq((await ops.applyChecklist(actor, d.id)).created, 1, "reaplicar recria só o item removido");
    const sims = await Promise.all([ops.syncTasks(actor, d.id), ops.syncTasks(actor, d.id), ops.syncTasks(actor, d.id)]);
    eq(sims.reduce((a, s) => a + s.created, 0), 1, "tarefas simultâneas: só uma é criada");
    const itemsAfter = await db.select().from(schema.propostaItems).where(deq(schema.propostaItems.dossieId, d.id));
    eq(itemsAfter.filter((i) => !i.taskId).length, 0, "todos os itens têm tarefa");
    const orphan = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(and(deq(schema.tasks.createdById, u.id), like(schema.tasks.description, "%/editais/proposta/%")));
    eq(orphan.length, itemsAfter.length, "nenhuma tarefa órfã depois das corridas");

    // documentos e planilha
    const g1 = await ops.generateDocs(actor, e.id);
    eq(g1.created.length, 4, "4 documentos padrão");
    const g2 = await ops.generateDocs(actor, e.id);
    eq([g2.created.length, g2.skipped], [0, 4], "gerar de novo não duplica");
    const docs = await db.select().from(schema.documents).where(deq(schema.documents.editalId, e.id));
    eq(docs.every((x) => x.dealId === after.dealId), true, "documentos ligados ao negócio");
    eq(new Set(docs.map((x) => x.number)).size, 4, "números de documento únicos");
    const p1 = await ops.createPriceSheet(actor, e.id);
    const p2 = await ops.createPriceSheet(actor, e.id);
    eq("id" in p1 && "id" in p2 && p1.id === p2.id, true, "planilha criada uma vez");

    // resultado: ganhou → negócio fechado ganho
    const moved = await ops.moveDealFor(actor, after.dealId, "ganho");
    ok(moved, "negócio vai para a etapa de ganho");
    const [deal] = await db.select().from(schema.deals).where(deq(schema.deals.id, after.dealId!));
    const [stage] = await db.select().from(schema.stages).where(deq(schema.stages.id, deal.stageId));
    eq(stage.kind, "ganho", "etapa de destino é do tipo ganho");
    ok(deal.closedAt, "fechamento registrado");

    const b = await loadBundle(e.id);
    eq(b?.items.length, itemsAfter.length, "o dossiê completo carrega");
    ok((b?.progress.totalItems ?? 0) > 0, "progresso calculado");
  } finally {
    await cleanup();
  }
  console.log(fail ? `\n${fail} falha(s) em ${n} verificações` : `\nTudo certo: ${n} verificações (banco)`);
  process.exit(fail ? 1 : 0);
}
const ok = (v: unknown, m: string) => eq(!!v, true, m);
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
