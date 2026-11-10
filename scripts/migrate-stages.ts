/**
 * Migração (idempotente) do funil de Negócios para:
 *   Novo lead → Proposta enviada → Negociação → Follow Up → Fechado   (+ Perdido, etapa de sistema)
 * Remove "Qualificação" e "Visita técnica" (negócios que estiverem nelas vão para a etapa anterior mais próxima
 * que permanece, com registro na linha do tempo) e limpa referências em regras de automação.
 *
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/migrate-stages.ts
 *
 * Neon-http não tem transação multi-statement: cada passo é seguro para reexecutar.
 * Backup JSON do estado anterior em A:\.tmp\backups\.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { FINAL_STAGES, REMOVED_STAGE_NAMES, normName } from "./stages-def";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

type Rule = typeof schema.automationRules.$inferSelect;

async function main() {
  const stages = await db.select().from(schema.stages).orderBy(schema.stages.position);
  const deals = await db.select({ id: schema.deals.id, stageId: schema.deals.stageId }).from(schema.deals);
  const rules = await db.select().from(schema.automationRules);

  // backup do estado anterior
  mkdirSync("A:\\.tmp\\backups", { recursive: true });
  const file = `A:\\.tmp\\backups\\stages-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ stages, deals, rules: rules.map((r) => ({ id: r.id, key: r.key, params: r.params, conditions: r.conditions })) }, null, 2));
  console.log(`backup: ${file}`);

  const removed = stages.filter((s) => REMOVED_STAGE_NAMES.includes(normName(s.name)));
  const keepers = stages.filter((s) => !removed.includes(s));
  // destino de cada etapa removida: a etapa anterior mais próxima que permanece (senão, a primeira)
  const dest = new Map<number, number>();
  for (const r of removed) {
    const before = keepers.filter((k) => k.position < r.position && k.kind === "aberto");
    const target = before[before.length - 1] ?? keepers.find((k) => k.kind === "aberto") ?? keepers[0];
    dest.set(r.id, target.id);
  }

  // 1) Follow Up
  let followUp = stages.find((s) => normName(s.name) === "follow up");
  if (!followUp) {
    const def = FINAL_STAGES.find((s) => s.name === "Follow Up")!;
    [followUp] = await db.insert(schema.stages).values({ ...def, position: 99 }).returning();
    console.log(`+ etapa criada: Follow Up (id ${followUp.id})`);
  }

  // 2) negócios nas etapas removidas
  let moved = 0;
  for (const [fromId, toId] of dest) {
    const rows = await db.select({ id: schema.deals.id, contactId: schema.deals.contactId }).from(schema.deals).where(eq(schema.deals.stageId, fromId));
    if (!rows.length) continue;
    const from = stages.find((s) => s.id === fromId)!;
    const to = stages.find((s) => s.id === toId)!;
    await db.update(schema.deals).set({ stageId: toId, updatedAt: new Date() }).where(eq(schema.deals.stageId, fromId));
    await db.insert(schema.activities).values(
      rows.map((d) => ({ dealId: d.id, contactId: d.contactId, userId: null, type: "etapa", body: `Movido para “${to.name}” (a etapa “${from.name}” foi removida do funil)` })),
    );
    moved += rows.length;
    console.log(`→ ${rows.length} negócio(s) de “${from.name}” para “${to.name}”`);
  }

  // 3) referências em regras de automação (troca o id removido pelo destino)
  const mapId = (id: number) => dest.get(id) ?? id;
  let ruleFixes = 0;
  for (const r of rules as Rule[]) {
    const params = { ...(r.params ?? {}) };
    const conditions = [...(r.conditions ?? [])];
    let changed = false;
    if (params.stageIds?.some((x) => dest.has(x))) {
      params.stageIds = [...new Set(params.stageIds.map(mapId))];
      changed = true;
    }
    if (params.stageDays && Object.keys(params.stageDays).some((k) => dest.has(Number(k)))) {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(params.stageDays)) {
        const to = String(mapId(Number(k)));
        if (!dest.has(Number(k)) || !(to in params.stageDays)) next[to] = v;
      }
      params.stageDays = next;
      changed = true;
    }
    const cond = conditions.map((c) => {
      if (c.field !== "stageId" || c.value === undefined) return c;
      const list = (Array.isArray(c.value) ? c.value : [c.value]).map(String);
      if (!list.some((v) => dest.has(Number(v)))) return c;
      changed = true;
      const mapped = [...new Set(list.map((v) => String(mapId(Number(v)))))];
      return { ...c, value: c.op === "in" ? mapped : mapped[0] };
    });
    if (changed) {
      await db.update(schema.automationRules).set({ params, conditions: cond, updatedAt: new Date() }).where(eq(schema.automationRules.id, r.id));
      ruleFixes++;
    }
  }

  // 4) remove as etapas aposentadas (só se não sobrou negócio nelas)
  for (const r of removed) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.deals).where(eq(schema.deals.stageId, r.id));
    if (n > 0) throw new Error(`Etapa ${r.name} ainda tem ${n} negócios — abortando sem apagar`);
    await db.delete(schema.stages).where(eq(schema.stages.id, r.id));
    console.log(`− etapa removida: ${r.name} (id ${r.id})`);
  }

  // 5) nomes, cores, kinds, probabilidades e posições finais (sem lacunas)
  const now = await db.select().from(schema.stages);
  const byName = new Map(now.map((s) => [normName(s.name), s]));
  for (let i = 0; i < FINAL_STAGES.length; i++) {
    const def = FINAL_STAGES[i];
    const cur = byName.get(normName(def.name));
    if (!cur) throw new Error(`Etapa esperada não encontrada: ${def.name}`);
    await db.update(schema.stages).set({ name: def.name, color: def.color, kind: def.kind, probability: def.probability, position: i }).where(eq(schema.stages.id, cur.id));
  }
  // etapas extras criadas manualmente em Ajustes ficam ao final, na ordem em que estavam
  const extras = now.filter((s) => !FINAL_STAGES.some((d) => normName(d.name) === normName(s.name))).sort((a, b) => a.position - b.position);
  let pos = FINAL_STAGES.length;
  for (const e of extras) await db.update(schema.stages).set({ position: pos++ }).where(eq(schema.stages.id, e.id));

  // verificação
  const after = await db.select().from(schema.stages).orderBy(schema.stages.position);
  console.log("\nEtapas finais:");
  for (const s of after) console.log(`  ${s.position}  #${s.id}  ${s.name}  (${s.kind}, ${s.probability}%, ${s.color})`);
  const positions = after.map((s) => s.position);
  if (positions.some((p, i) => p !== i)) throw new Error("posições com lacunas");
  const names = after.map((s) => s.name);
  const expect = [...FINAL_STAGES.map((s) => s.name), ...extras.map((e) => e.name)];
  if (JSON.stringify(names) !== JSON.stringify(expect)) throw new Error(`ordem inesperada: ${names.join(" > ")}`);
  const orphan = await db.select({ id: schema.deals.id }).from(schema.deals).where(sql`${schema.deals.stageId} not in (select id from stages)`);
  if (orphan.length) throw new Error("negócios órfãos");
  const stale = await db.select({ id: schema.stages.id }).from(schema.stages).where(inArray(schema.stages.id, [...dest.keys()].length ? [...dest.keys()] : [-1]));
  if (stale.length) throw new Error("etapas removidas ainda existem");
  console.log(`\nOK — ${moved} negócio(s) movido(s), ${ruleFixes} regra(s) ajustada(s), ${removed.length} etapa(s) removida(s).`);
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
