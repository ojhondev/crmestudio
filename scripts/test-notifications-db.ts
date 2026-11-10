/**
 * Política "só o necessário" nos avisos, COM banco (usuários e editais "QA-TEST", sempre limpos no fim):
 *  - coleta de editais não avisa; interesse da equipe avisa gestor (não o autor), com dedupe de 24 h;
 *  - preferências por tipo respeitadas; limite diário por pessoa; resumo quando há 3+ avisos do mesmo tipo.
 *
 *   npm run test:notifications:db
 */
import "./_server-only.cjs";
import { readFileSync } from "node:fs";

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
  const { and, eq: deq, inArray, isNull, like, or } = await import("drizzle-orm");
  const { db, schema } = await import("../src/lib/db");
  const { fireEditalEvent, flushCollector } = await import("../src/lib/automations-engine");
  const { notifyUsers, DAILY_CAP } = await import("../src/lib/notifications");
  const { hashPassword } = await import("../src/lib/password");
  const crypto = await import("node:crypto");

  const E = ["qa-notif-b@example.test", "qa-notif-c@example.test"];
  const cleanup = async () => {
    const us = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, E));
    const ids = us.map((u) => u.id);
    const eds = await db.select({ id: schema.editais.id }).from(schema.editais).where(like(schema.editais.externalId, "QA-TEST-NOTIF-%"));
    if (eds.length) await db.delete(schema.automationRuns).where(inArray(schema.automationRuns.entityId, eds.map((e) => e.id)));
    if (ids.length) {
      await db.delete(schema.notifications).where(inArray(schema.notifications.userId, ids));
      await db.delete(schema.notificationPrefs).where(inArray(schema.notificationPrefs.userId, ids));
      await db.update(schema.users).set({ supervisorId: null }).where(inArray(schema.users.id, ids));
    }
    await db.delete(schema.notifications).where(or(like(schema.notifications.title, "%QA-TEST%"), like(schema.notifications.body, "%QA-TEST%")));
    await db.delete(schema.editais).where(like(schema.editais.externalId, "QA-TEST-NOTIF-%"));
    await db.delete(schema.users).where(inArray(schema.users.email, E));
  };
  await cleanup();

  try {
    const mk = (email: string, name: string, supervisorId: string | null = null) =>
      db
        .insert(schema.users)
        .values({ name, email, passwordHash: hashPassword(crypto.randomBytes(9).toString("base64url")), role: "equipe", profile: "gestor", supervisorId, calendarToken: crypto.randomBytes(12).toString("hex") })
        .returning({ id: schema.users.id });
    const [c] = await mk(E[1], "QA-TEST Gestor");
    const [b] = await mk(E[0], "QA-TEST Membro", c.id);
    const close = new Date(Date.now() + 20 * 864e5);
    const [ed] = await db
      .insert(schema.editais)
      .values({ externalId: "QA-TEST-NOTIF-1", title: "QA-TEST Restauração", object: "Obra de restauração", organ: "QA-TEST Prefeitura", uf: "SP", city: "Itu", kind: "execucao", score: 95, modalidade: "Concorrência", valueCents: 1_000_000, closeAt: close, openAt: close, situation: "aberto", ownerId: b.id })
      .returning();
    const count = async (uid: string, type?: string) =>
      (await db.select().from(schema.notifications).where(and(deq(schema.notifications.userId, uid), isNull(schema.notifications.archivedAt), type ? deq(schema.notifications.type, type as "sistema") : undefined))).length;

    // coleta de edital NÃO avisa (a regra "edital novo" vem desligada e a coleta nem dispara mais o evento)
    eq(readFileSync("src/lib/editais/ingest.ts", "utf8").includes("fireEditalEvent"), false, "ingest.ts não dispara avisos de edital");
    await fireEditalEvent(["edital_new"], ed.id);
    eq(await count(c.id), 0, "edital novo coletado: nenhum aviso ao gestor");
    eq(await count(b.id), 0, "edital novo coletado: nenhum aviso ao responsável");

    // interesse da equipe: avisa o gestor, nunca o autor
    await fireEditalEvent(["edital_interest"], ed.id, { id: b.id, name: "QA-TEST Membro" }, { eventKey: "interessante:1" });
    eq(await count(c.id, "edital_interesse"), 1, "interesse: o gestor recebe 1 aviso");
    eq(await count(b.id), 0, "interesse: o autor (responsável) não é avisado");
    await fireEditalEvent(["edital_interest"], ed.id, { id: b.id, name: "QA-TEST Membro" }, { eventKey: "interessante:1" });
    eq(await count(c.id, "edital_interesse"), 1, "marcar/desmarcar no mesmo dia não duplica");
    await fireEditalEvent(["edital_interest"], ed.id, { id: b.id, name: "QA-TEST Membro" }, { eventKey: "em_proposta:1" });
    eq(await count(c.id, "edital_interesse"), 2, "outra ação (vou participar) é outro aviso");

    // preferências por tipo
    await db.insert(schema.notificationPrefs).values({ userId: c.id, disabledTypes: ["edital_interesse"] });
    await fireEditalEvent(["edital_interest"], ed.id, { id: b.id, name: "QA-TEST Membro" }, { eventKey: "interessante:2" });
    eq(await count(c.id, "edital_interesse"), 2, "tipo desligado nas preferências: nada novo aparece");
    await db.delete(schema.notificationPrefs).where(deq(schema.notificationPrefs.userId, c.id));

    // limite diário
    await db.delete(schema.notifications).where(deq(schema.notifications.userId, c.id));
    await db.insert(schema.notifications).values(Array.from({ length: DAILY_CAP }, (_, i) => ({ userId: c.id, type: "sistema" as const, title: `QA-TEST aviso ${i}`, dedupeKey: `qa-cap-${i}` })));
    const sent = await notifyUsers([c.id], { type: "lead_novo", title: "QA-TEST lead extra", dedupeKey: "qa-extra-1" });
    eq(sent, [], "acima do limite diário: nada é entregue como aviso normal");
    eq(await count(c.id), DAILY_CAP + 1, "só o aviso de “limite atingido” é acrescentado");
    await notifyUsers([c.id], { type: "lead_novo", title: "QA-TEST lead extra 2", dedupeKey: "qa-extra-2" });
    eq(await count(c.id), DAILY_CAP + 1, "o aviso de limite não se repete no dia");
    eq((await db.select().from(schema.notifications).where(and(deq(schema.notifications.userId, c.id), like(schema.notifications.title, "Limite diário%")))).length, 1, "um aviso de limite por dia");

    // resumo diário
    await db.delete(schema.notifications).where(deq(schema.notifications.userId, c.id));
    const rule = { id: "qa-rule-1", trigger: "task_overdue" } as Parameters<typeof flushCollector>[0];
    const item = (i: number) => ({ type: "tarefa_atrasada" as const, title: `Tarefa atrasada: QA-TEST ${i}`, body: "x QA-TEST", href: "/tarefas", dedupeKey: `qa-rule-1:k${i}` });
    await flushCollector(rule, new Map([[c.id, [item(1), item(2)]]]), "2026-01-01");
    eq(await count(c.id, "tarefa_atrasada"), 2, "1–2 avisos saem individualmente");
    await db.delete(schema.notifications).where(deq(schema.notifications.userId, c.id));
    await flushCollector(rule, new Map([[c.id, [item(1), item(2), item(3), item(4), item(5)]]]), "2026-01-01");
    const rows = await db.select().from(schema.notifications).where(deq(schema.notifications.userId, c.id));
    eq(rows.length, 1, "5 avisos do mesmo tipo viram um único resumo");
    eq(rows[0]?.title, "5 avisos: tarefa atrasada", "título do resumo");
    eq(rows[0]?.body?.includes("e mais 1"), true, "resumo lista os primeiros e conta o resto");
    await flushCollector(rule, new Map([[c.id, [item(1), item(2), item(3)]]]), "2026-01-01");
    eq((await db.select().from(schema.notifications).where(deq(schema.notifications.userId, c.id))).length, 1, "o resumo do dia não se repete");
  } finally {
    await cleanup();
  }
  console.log(fail ? `\n${fail} de ${n} verificações falharam` : `Todas as ${n} verificações passaram`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
