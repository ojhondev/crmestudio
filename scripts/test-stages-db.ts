/**
 * Teste (COM banco, dados "QA-TEST") da migração de etapas do funil (scripts/migrate-stages.ts):
 * recria temporariamente as etapas aposentadas com um negócio QA em cada uma e uma regra QA que as referencia,
 * roda a migração duas vezes e confere: negócios movidos para a etapa anterior mais próxima (com registro na linha
 * do tempo), regras remapeadas, funil final sem lacunas e idempotência. Sempre limpa o que criou.
 *
 *   npm run test:stages:db
 */
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, like } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { FINAL_STAGES } from "./stages-def";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
let fail = 0;
let n = 0;
const eq2 = (a: unknown, b: unknown, m: string) => {
  n++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail++;
    console.log("FALHOU:", m, "→", JSON.stringify(a), "esperado", JSON.stringify(b));
  }
};

const migrate = () => {
  const r = spawnSync(process.execPath, ["--env-file=.env.local", "node_modules/tsx/dist/cli.mjs", "scripts/migrate-stages.ts"], { encoding: "utf8" });
  if (r.status !== 0) console.log(r.stdout, r.stderr);
  return r.status === 0;
};

async function cleanup() {
  const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(like(schema.deals.title, "QA-TEST-STAGES%"));
  if (deals.length) {
    const ids = deals.map((d) => d.id);
    await db.delete(schema.activities).where(inArray(schema.activities.dealId, ids));
    await db.delete(schema.deals).where(inArray(schema.deals.id, ids));
  }
  await db.delete(schema.automationRules).where(like(schema.automationRules.name, "QA-TEST-STAGES%"));
}

async function main() {
  await cleanup();
  const before = await db.select().from(schema.stages).orderBy(schema.stages.position);
  const [novo, prop, neg] = ["Novo lead", "Proposta enviada", "Negociação"].map((nm) => before.find((s) => s.name === nm)!);
  // etapas aposentadas voltam (posições 1 e 3 do funil final) com um negócio QA cada
  const [qual] = await db.insert(schema.stages).values({ name: "Qualificação", position: 1, kind: "aberto", probability: 25 }).returning();
  const [vis] = await db.insert(schema.stages).values({ name: "Visita técnica", position: 3, kind: "aberto", probability: 40 }).returning();
  const [d1] = await db.insert(schema.deals).values({ title: "QA-TEST-STAGES qualificação", stageId: qual.id }).returning();
  const [d2] = await db.insert(schema.deals).values({ title: "QA-TEST-STAGES visita", stageId: vis.id }).returning();
  const [d3] = await db.insert(schema.deals).values({ title: "QA-TEST-STAGES proposta", stageId: prop.id }).returning();
  const [rule] = await db
    .insert(schema.automationRules)
    .values({
      name: "QA-TEST-STAGES regra",
      trigger: "deal_stalled",
      enabled: false,
      params: { days: 7, stageIds: [qual.id, neg.id], stageDays: { [String(vis.id)]: 3 } },
      conditions: [{ field: "stageId", op: "in", value: [String(qual.id), String(prop.id)] }],
      actions: [{ type: "notify", to: ["owner"] }],
    })
    .returning();

  try {
    eq2(migrate(), true, "migração rodou (1ª vez)");
    const after = await db.select().from(schema.stages).orderBy(schema.stages.position);
    eq2(after.map((s) => s.name), FINAL_STAGES.map((s) => s.name), "ordem final do funil");
    eq2(after.map((s) => s.position), [0, 1, 2, 3, 4, 5], "posições sem lacunas");
    eq2(after.map((s) => s.kind), FINAL_STAGES.map((s) => s.kind), "tipos das etapas (Follow Up é aberta; Fechado ganho; Perdido perdido)");
    eq2(after.map((s) => s.probability), [10, 40, 60, 25, 100, 0], "probabilidades coerentes");
    eq2(after.some((s) => s.id === qual.id || s.id === vis.id), false, "etapas removidas não existem mais");
    eq2([novo.id, prop.id, neg.id].every((id) => after.some((s) => s.id === id)), true, "ids das etapas que ficam foram preservados");
    const f = after.find((s) => s.name === "Follow Up")!;
    eq2(f.kind, "aberto", "Follow Up é etapa aberta");
    const [r1] = await db.select().from(schema.deals).where(eq(schema.deals.id, d1.id));
    const [r2] = await db.select().from(schema.deals).where(eq(schema.deals.id, d2.id));
    const [r3] = await db.select().from(schema.deals).where(eq(schema.deals.id, d3.id));
    eq2(r1.stageId, novo.id, "negócio de Qualificação foi para a etapa anterior mais próxima (Novo lead)");
    eq2(r2.stageId, neg.id, "negócio de Visita técnica foi para a etapa anterior mais próxima (Negociação)");
    eq2(r3.stageId, prop.id, "negócio de etapa que fica não é tocado");
    const acts = await db.select().from(schema.activities).where(inArray(schema.activities.dealId, [d1.id, d2.id, d3.id]));
    eq2(acts.length, 2, "movimentos ficam registrados na linha do tempo (só dos 2 movidos)");
    eq2(acts.every((a) => a.type === "etapa"), true, "registro do tipo etapa");
    const [rr] = await db.select().from(schema.automationRules).where(eq(schema.automationRules.id, rule.id));
    eq2(rr.params.stageIds, [novo.id, neg.id], "regra: stageIds remapeados sem duplicar");
    eq2(rr.params.stageDays, { [String(neg.id)]: 3 }, "regra: stageDays remapeados");
    eq2(rr.conditions[0].value, [String(novo.id), String(prop.id)], "regra: condição de etapa remapeada");

    // idempotência: segunda rodada não muda nada
    const snap = JSON.stringify(after);
    eq2(migrate(), true, "migração rodou (2ª vez)");
    eq2(JSON.stringify(await db.select().from(schema.stages).orderBy(schema.stages.position)), snap, "2ª rodada: funil idêntico");
    const acts2 = await db.select().from(schema.activities).where(inArray(schema.activities.dealId, [d1.id, d2.id, d3.id]));
    eq2(acts2.length, 2, "2ª rodada não duplica registros");
  } finally {
    await cleanup();
    await db.delete(schema.stages).where(inArray(schema.stages.id, [qual.id, vis.id]));
  }
  console.log(fail ? `\n${fail} de ${n} verificações falharam` : `Todas as ${n} verificações passaram`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
