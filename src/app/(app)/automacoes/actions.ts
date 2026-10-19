"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BUILTIN_RULES, TRIGGER_BY_ID, sanitizeRule, type RuleInput, type TriggerId } from "@/lib/automations";
import { ensureBuiltinRules, runTimeRules } from "@/lib/automations-engine";

/**
 * Permissão do módulo Automações: reaproveita "Configurações do sistema" —
 * Ver = consulta regras e registro · Gerenciar = liga/desliga, edita, cria, exclui e roda agora.
 */
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function setRuleEnabled(id: string, enabled: boolean) {
  const user = await requireAccess("configuracoes", "manage");
  if (!isId(id)) return { error: "Regra inválida." };
  const [r] = await db.update(schema.automationRules).set({ enabled: !!enabled, updatedAt: new Date() }).where(eq(schema.automationRules.id, id)).returning();
  if (!r) return { error: "Regra não encontrada." };
  await audit(user, enabled ? "automacao_ligada" : "automacao_desligada", `${enabled ? "Ligou" : "Desligou"} a automação “${r.name}”`, { entity: "automacao", entityId: id });
  revalidatePath("/automacoes");
  return { ok: true };
}

export async function saveRule(id: string | null, input: RuleInput & { enabled?: boolean }) {
  const user = await requireAccess("configuracoes", "manage");
  let locked: TriggerId | undefined;
  let before: typeof schema.automationRules.$inferSelect | undefined;
  if (id) {
    if (!isId(id)) return { error: "Regra inválida." };
    [before] = await db.select().from(schema.automationRules).where(eq(schema.automationRules.id, id));
    if (!before) return { error: "Regra não encontrada." };
    if (before.builtin) locked = before.trigger as TriggerId;
  }
  const clean = sanitizeRule(input, locked);
  if ("error" in clean) return clean;
  const enabled = input.enabled === undefined ? (before?.enabled ?? true) : !!input.enabled;
  if (before) {
    await db
      .update(schema.automationRules)
      .set({ name: clean.name, description: clean.description, trigger: clean.trigger, params: clean.params, conditions: clean.conditions, actions: clean.actions, enabled, updatedAt: new Date() })
      .where(eq(schema.automationRules.id, before.id));
    await audit(user, "automacao_alterada", `Alterou a automação “${clean.name}”`, { entity: "automacao", entityId: before.id, meta: { antes: { params: before.params, conditions: before.conditions, actions: before.actions, enabled: before.enabled }, depois: { params: clean.params, conditions: clean.conditions, actions: clean.actions, enabled } } });
    revalidatePath("/automacoes");
    return { ok: true, id: before.id };
  }
  const [r] = await db
    .insert(schema.automationRules)
    .values({ name: clean.name, description: clean.description, trigger: clean.trigger, params: clean.params, conditions: clean.conditions, actions: clean.actions, enabled, builtin: false, createdById: user.id })
    .returning({ id: schema.automationRules.id });
  await audit(user, "automacao_criada", `Criou a automação “${clean.name}” (${TRIGGER_BY_ID[clean.trigger].label})`, { entity: "automacao", entityId: r.id, meta: { actions: clean.actions } });
  revalidatePath("/automacoes");
  return { ok: true, id: r.id };
}

export async function deleteRule(id: string) {
  const user = await requireAccess("configuracoes", "manage");
  if (!isId(id)) return { error: "Regra inválida." };
  const [r] = await db.select().from(schema.automationRules).where(eq(schema.automationRules.id, id));
  if (!r) return { ok: true };
  if (r.builtin) return { error: "As regras prontas não podem ser excluídas. Desligue-a se não quiser usar." };
  await db.delete(schema.automationRules).where(eq(schema.automationRules.id, id));
  await audit(user, "automacao_excluida", `Excluiu a automação “${r.name}”`, { entity: "automacao", entityId: id });
  revalidatePath("/automacoes");
  return { ok: true };
}

/** Volta uma regra pronta ao padrão que acompanha o sistema. */
export async function resetBuiltinRule(id: string) {
  const user = await requireAccess("configuracoes", "manage");
  if (!isId(id)) return { error: "Regra inválida." };
  const [r] = await db.select().from(schema.automationRules).where(eq(schema.automationRules.id, id));
  const b = r?.builtin ? BUILTIN_RULES.find((x) => x.key === r.key) : null;
  if (!r || !b) return { error: "Só as regras prontas têm padrão para restaurar." };
  await db
    .update(schema.automationRules)
    .set({ name: b.name, description: b.description, params: b.params, conditions: b.conditions, actions: b.actions, enabled: b.enabled, updatedAt: new Date() })
    .where(eq(schema.automationRules.id, id));
  await audit(user, "automacao_alterada", `Restaurou o padrão da automação “${b.name}”`, { entity: "automacao", entityId: id });
  revalidatePath("/automacoes");
  return { ok: true };
}

/** Avalia agora as regras de tempo (o cron diário e a rodada preguiçosa fazem o mesmo). Idempotente. */
export async function runNow() {
  const user = await requireAccess("configuracoes", "manage");
  await ensureBuiltinRules();
  const r = await runTimeRules();
  await audit(user, "automacao_rodada", `Rodou as automações de tempo manualmente (${r.fired} novas execuções)`, { entity: "automacao", meta: { ...r } });
  revalidatePath("/automacoes");
  return { ok: true, ...r };
}
