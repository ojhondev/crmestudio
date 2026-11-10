/**
 * Cadência de follow-up COM banco (negócio/contato "QA-TEST", limpos no fim): confere que loadOpenDeals entrega
 * os fatos certos (entrada na etapa Follow Up pela última mudança de etapa, telefone, Follow Up reconhecido e as
 * regras de "parado" ignorando a etapa), que o marco certo dispara conforme os dias passam e que sair/voltar da
 * etapa reinicia a cadência. Não dispara avisos (não roda o motor de tempo: evita avisar pessoas reais).
 *
 *   npm run test:followup:db
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
  const { and, eq: deq, inArray, like } = await import("drizzle-orm");
  const { db, schema } = await import("../src/lib/db");
  const { loadOpenDeals } = await import("../src/lib/automations-engine");
  const { evalDealTime, nowOf } = await import("../src/lib/automations");
  const DAY = 864e5;

  const cleanup = async () => {
    const ds = await db.select({ id: schema.deals.id }).from(schema.deals).where(like(schema.deals.title, "QA-TEST-FU%"));
    if (ds.length) {
      await db.delete(schema.activities).where(inArray(schema.activities.dealId, ds.map((d) => d.id)));
      await db.delete(schema.deals).where(inArray(schema.deals.id, ds.map((d) => d.id)));
    }
    await db.delete(schema.contacts).where(like(schema.contacts.name, "QA-TEST-FU%"));
  };
  await cleanup();
  try {
    const stages = await db.select().from(schema.stages);
    const fu = stages.find((s) => s.name === "Follow Up")!;
    const prop = stages.find((s) => s.name === "Proposta enviada")!;
    const [c] = await db.insert(schema.contacts).values({ name: "QA-TEST-FU Padre", phone: "5511990000009" }).returning({ id: schema.contacts.id });
    const [d] = await db.insert(schema.deals).values({ title: "QA-TEST-FU Matriz", contactId: c.id, stageId: fu.id }).returning();
    const [rule] = await db.select().from(schema.automationRules).where(deq(schema.automationRules.key, "followup_cadencia"));
    eq(rule?.enabled, true, "regra de cadência existe e está ligada no banco");
    const entry = Date.now() - 6 * DAY;
    await db.insert(schema.activities).values({ dealId: d.id, contactId: c.id, userId: null, type: "etapa", body: "Movido para “Follow Up”", createdAt: new Date(entry) });
    const find = async () => (await loadOpenDeals()).find((o) => o.deal.id === d.id);

    let o = await find();
    eq(o?.facts.isFollowUp, true, "negócio na etapa Follow Up é reconhecido");
    eq(o?.facts.phone, "5511990000009", "telefone do contato chega aos fatos");
    eq(Math.abs((o?.facts.stageEntryMs ?? 0) - entry) < 2000, true, "entrada na etapa = última atividade de etapa");
    const now = nowOf();
    const hit = evalDealTime("deal_followup_cadence", rule.params, o!.facts, now);
    eq(hit?.vars.marco, "5", "6 dias na etapa → marco do dia 5 (2º follow-up)");
    eq(hit?.vars.orientacao.includes("https://wa.me/5511990000009"), true, "aviso traz o link do WhatsApp do contato");
    eq(evalDealTime("deal_stalled", { days: 7 }, { ...o!.facts, stageEntryMs: Date.now() - 20 * DAY }, now), null, "“parado” ignora Follow Up (cadência ligada)");

    // sai da etapa e volta: nova entrada → cadência recomeça
    await db.update(schema.deals).set({ stageId: prop.id }).where(deq(schema.deals.id, d.id));
    await db.insert(schema.activities).values({ dealId: d.id, contactId: c.id, userId: null, type: "etapa", body: "Movido para “Proposta enviada”" });
    o = await find();
    eq(o?.facts.isFollowUp, false, "fora de Follow Up: não é coberto pela cadência");
    eq(evalDealTime("deal_followup_cadence", rule.params, o!.facts, now), null, "fora da etapa não há aviso de cadência");
    await db.update(schema.deals).set({ stageId: fu.id }).where(deq(schema.deals.id, d.id));
    await db.insert(schema.activities).values({ dealId: d.id, contactId: c.id, userId: null, type: "etapa", body: "Movido para “Follow Up”" });
    o = await find();
    eq(o?.facts.isFollowUp, true, "voltou para Follow Up");
    eq(evalDealTime("deal_followup_cadence", rule.params, o!.facts, now), null, "voltou agora: cadência reiniciada (sem marco ainda)");
    // ganho/perdido não entram
    const won = stages.find((s) => s.kind === "ganho")!;
    await db.update(schema.deals).set({ stageId: won.id }).where(and(deq(schema.deals.id, d.id)));
    eq(await find(), undefined, "negócio fechado sai da lista de abertos");
  } finally {
    await cleanup();
  }
  console.log(fail ? `\n${fail} de ${n} verificações falharam` : `Todas as ${n} verificações passaram`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
