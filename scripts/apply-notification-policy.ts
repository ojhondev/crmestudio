/**
 * Política "só o necessário" nos avisos (idempotente):
 *  1) regras PRONTAS (builtin) que o usuário nunca alterou passam aos novos padrões de BUILTIN_RULES
 *     (regra editada/ligada/desligada à mão — updatedAt posterior à criação — é preservada); regras novas são criadas;
 *  2) apaga avisos de "edital novo" gerados pela coleta (title "Novo edital de restauro…");
 *  3) marca como lidos avisos antigos (> 7 dias) dos tipos agora desligados por padrão.
 * Não mexe em avisos de lead, tarefa e follow-up. Backup JSON em A:\.tmp\backups\.
 *
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/apply-notification-policy.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray, isNull, like, lt } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { BUILTIN_RULES } from "../src/lib/automations";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const DISABLED_TYPES = ["tarefa_concluida", "tarefa_travada", "tarefa_sem_responsavel", "negocio_valor_alto"];

async function main() {
  mkdirSync("A:\\.tmp\\backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rules = await db.select().from(schema.automationRules);
  const editalNovo = await db.select().from(schema.notifications).where(and(eq(schema.notifications.type, "edital_novo"), like(schema.notifications.title, "Novo edital de restauro%")));
  const old = await db
    .select()
    .from(schema.notifications)
    .where(and(inArray(schema.notifications.type, DISABLED_TYPES), isNull(schema.notifications.readAt), lt(schema.notifications.createdAt, new Date(Date.now() - 7 * 864e5))));
  const file = `A:\\.tmp\\backups\\notificacoes-politica-${stamp}.json`;
  writeFileSync(file, JSON.stringify({ rules, editalNovo, marcarLidas: old }, null, 2));
  console.log(`backup: ${file}`);

  let updated = 0;
  let kept = 0;
  let created = 0;
  for (const b of BUILTIN_RULES) {
    const row = rules.find((r) => r.key === b.key);
    if (!row) {
      await db.insert(schema.automationRules).values({ key: b.key, name: b.name, description: b.description, trigger: b.trigger, enabled: b.enabled, params: b.params, conditions: b.conditions, actions: b.actions, builtin: true }).onConflictDoNothing();
      created++;
      continue;
    }
    const touched = row.updatedAt.getTime() - row.createdAt.getTime() > 2000;
    if (touched) {
      kept++;
      console.log(`· preservada (editada pelo usuário): ${b.key}`);
      continue;
    }
    await db
      .update(schema.automationRules)
      .set({ name: b.name, description: b.description, enabled: b.enabled, params: b.params, conditions: b.conditions, actions: b.actions })
      .where(eq(schema.automationRules.id, row.id));
    updated++;
  }
  console.log(`regras: ${updated} atualizadas, ${kept} preservadas, ${created} criadas`);

  const del = await db.delete(schema.notifications).where(and(eq(schema.notifications.type, "edital_novo"), like(schema.notifications.title, "Novo edital de restauro%"))).returning({ id: schema.notifications.id });
  console.log(`avisos de edital novo apagados: ${del.length}`);
  const read = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(inArray(schema.notifications.type, DISABLED_TYPES), isNull(schema.notifications.readAt), lt(schema.notifications.createdAt, new Date(Date.now() - 7 * 864e5))))
    .returning({ id: schema.notifications.id });
  console.log(`avisos antigos de tipos desligados marcados como lidos: ${read.length}`);

  const after = await db.select({ key: schema.automationRules.key, enabled: schema.automationRules.enabled, params: schema.automationRules.params }).from(schema.automationRules);
  for (const r of after.sort((a, b) => String(a.key).localeCompare(String(b.key)))) console.log(`  ${r.enabled ? "ON " : "off"} ${r.key} ${JSON.stringify(r.params)}`);
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
