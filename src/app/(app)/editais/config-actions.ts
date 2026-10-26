"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { EMPTY_STUDIO, type StudioProfile } from "@/lib/docs/types";
import { getStudio } from "@/lib/docs/server";
import { getConfig, setConfig } from "@/lib/propostas/server";
import { COFRE_LABEL, DEFAULT_LOSS_REASONS, ROLES, isRoleKey, isStepKey, type MatrixItem, type PropostasConfig, type RoleKey, type TemplateItem } from "@/lib/propostas/types";

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : fallback;
};

export type ConfigInput = {
  studio: Partial<Pick<StudioProfile, "name" | "legalName" | "document" | "address" | "city" | "email" | "phone" | "forum">>;
  legalRep: { name: string; cpf: string; role: string };
  technical: { id?: string; name: string; profession: string; registry: string; cpf: string }[];
  bdiPercent: string | number;
  encargosPercent: string | number;
  validityDays: string | number;
  roles: Record<string, string>;
  lossReasons: string[];
  stageSent: string;
  defaultTemplate: { execucao: string; projeto: string; outro: string };
};

/** Dados do estúdio e padrões da esteira de proposta. Só quem gerencia Editais altera. */
export async function saveConfigAction(input: ConfigInput): Promise<{ error: string } | { ok: true }> {
  const user = await requireAccess("editais", "manage");
  const studio = await getStudio();
  const next: StudioProfile = { ...EMPTY_STUDIO, ...studio };
  for (const k of ["name", "legalName", "document", "address", "city", "email", "phone", "forum"] as const) {
    if (input.studio?.[k] !== undefined) next[k] = str(input.studio[k], 300);
  }
  if (!next.name) return { error: "Informe o nome do estúdio." };
  // o responsável técnico principal dos contratos acompanha o primeiro da lista (uma fonte só)
  const technical = (input.technical ?? [])
    .slice(0, 12)
    .map((t, i) => ({ id: isId(t.id) || (typeof t.id === "string" && /^[a-z0-9-]{4,40}$/.test(t.id)) ? (t.id as string) : `t${Date.now().toString(36)}${i}`, name: str(t.name, 120), profession: str(t.profession, 80), registry: str(t.registry, 80), cpf: str(t.cpf, 20) }))
    .filter((t) => t.name);
  if (technical[0] && !next.responsible) {
    next.responsible = technical[0].name;
    next.responsibleDocument = technical[0].cpf;
  }
  const roles: Partial<Record<RoleKey, string>> = {};
  for (const r of ROLES) {
    const id = input.roles?.[r.key];
    if (isId(id)) {
      const [u] = await db.select({ active: schema.users.active }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
      if (u?.active) roles[r.key] = id;
    }
  }
  const current = await getConfig();
  const templates = await db.select({ key: schema.propostaTemplates.key, type: schema.propostaTemplates.type }).from(schema.propostaTemplates);
  const keys = new Set(templates.filter((t) => t.type === "checklist").map((t) => t.key));
  const pickKey = (v: string, fallback: string) => (keys.has(v) ? v : keys.has(fallback) ? fallback : [...keys][0] ?? fallback);
  const cfg: PropostasConfig = {
    legalRep: { name: str(input.legalRep?.name, 120), cpf: str(input.legalRep?.cpf, 20), role: str(input.legalRep?.role, 80) || "Sócio administrador" },
    technical,
    bdiPercent: num(input.bdiPercent, 0, 200, current.bdiPercent),
    encargosPercent: num(input.encargosPercent, 0, 300, current.encargosPercent),
    validityDays: Math.round(num(input.validityDays, 1, 730, current.validityDays)),
    roles,
    lossReasons: [...new Set((input.lossReasons ?? []).map((r) => str(r, 80)).filter(Boolean))].slice(0, 20),
    stageSent: str(input.stageSent, 80) || "Proposta enviada",
    defaultTemplate: {
      execucao: pickKey(str(input.defaultTemplate?.execucao, 60), "obra"),
      projeto: pickKey(str(input.defaultTemplate?.projeto, 60), "projeto"),
      outro: pickKey(str(input.defaultTemplate?.outro, 60), "dispensa"),
    },
  };
  if (!cfg.lossReasons.length) cfg.lossReasons = DEFAULT_LOSS_REASONS;
  await db
    .insert(schema.appSettings)
    .values({ key: "studio", value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: next, updatedAt: new Date() } });
  await setConfig(cfg);
  await audit(user, "proposta_config", "Atualizou os dados do estúdio e os padrões da esteira de proposta", { entity: "configuracao" });
  revalidatePath("/editais", "layout");
  revalidatePath("/ajustes");
  return { ok: true };
}

type TemplateInput = { key?: string; type: "checklist" | "matriz"; name: string; description?: string; items: unknown[]; active?: boolean };

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

/** Cria ou altera um modelo de checklist / matriz de habilitação. Os modelos que acompanham o sistema podem ser editados e desativados, não apagados. */
export async function saveTemplateAction(input: TemplateInput): Promise<{ error: string } | { ok: true; key: string }> {
  const user = await requireAccess("editais", "manage");
  const name = str(input.name, 100);
  if (!name) return { error: "Dê um nome ao modelo." };
  if (input.type !== "checklist" && input.type !== "matriz") return { error: "Tipo inválido." };
  const seen = new Set<string>();
  const rows: (TemplateItem | MatrixItem)[] = [];
  for (const [n, raw] of (Array.isArray(input.items) ? input.items : []).slice(0, 80).entries()) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const title = str(it.title, 200);
    if (!title) continue;
    let key = str(it.key, 40).replace(/[^a-z0-9_-]/gi, "") || `${slug(title).slice(0, 20) || "item"}_${n}`;
    while (seen.has(key)) key = `${key}_x`;
    seen.add(key);
    if (input.type === "checklist") {
      const step = isStepKey(it.step) ? it.step : "analisar";
      const off = it.offsetDays === null || it.offsetDays === "" || it.offsetDays === undefined ? null : Math.round(Number(it.offsetDays));
      rows.push({ key, step, title, offsetDays: off !== null && Number.isFinite(off) && off >= 0 && off <= 60 ? off : null, role: isRoleKey(it.role) ? it.role : null } satisfies TemplateItem);
    } else {
      const t = str(it.cofreType, 40);
      rows.push({ key, title, cofreType: t in COFRE_LABEL ? (t as MatrixItem["cofreType"]) : null } satisfies MatrixItem);
    }
  }
  if (!rows.length) return { error: "Coloque pelo menos um item no modelo." };
  let key = input.key && /^[a-z0-9-]{1,40}$/.test(input.key) ? input.key : "";
  if (key) {
    const [cur] = await db.select({ key: schema.propostaTemplates.key, type: schema.propostaTemplates.type }).from(schema.propostaTemplates).where(eq(schema.propostaTemplates.key, key)).limit(1);
    if (!cur || cur.type !== input.type) return { error: "Modelo não encontrado." };
    await db.update(schema.propostaTemplates).set({ name, description: str(input.description, 300) || null, items: rows as TemplateItem[], active: input.active !== false, updatedAt: new Date() }).where(eq(schema.propostaTemplates.key, key));
  } else {
    const base = (input.type === "matriz" ? "matriz-" : "") + (slug(name) || "modelo");
    key = base;
    for (let i = 2; i < 30; i++) {
      const [dup] = await db.select({ key: schema.propostaTemplates.key }).from(schema.propostaTemplates).where(eq(schema.propostaTemplates.key, key)).limit(1);
      if (!dup) break;
      key = `${base}-${i}`;
    }
    await db.insert(schema.propostaTemplates).values({ key, type: input.type, name, description: str(input.description, 300) || null, items: rows as TemplateItem[], builtin: false });
  }
  await audit(user, "proposta_modelo", `Salvou o modelo “${name}” (${input.type === "matriz" ? "matriz de habilitação" : "checklist"})`, { entity: "configuracao", entityId: key });
  revalidatePath("/editais/configuracao");
  return { ok: true, key };
}

export async function deleteTemplateAction(key: string): Promise<{ error: string } | { ok: true }> {
  const user = await requireAccess("editais", "manage");
  const [t] = await db.select().from(schema.propostaTemplates).where(eq(schema.propostaTemplates.key, str(key, 60))).limit(1);
  if (!t) return { error: "Modelo não encontrado." };
  if (t.builtin) return { error: "Os modelos que acompanham o sistema não podem ser apagados. Desative-o ou edite como quiser." };
  await db.delete(schema.propostaTemplates).where(eq(schema.propostaTemplates.key, t.key));
  await audit(user, "proposta_modelo_excluido", `Apagou o modelo “${t.name}”`, { entity: "configuracao", entityId: t.key });
  revalidatePath("/editais/configuracao");
  return { ok: true };
}

export async function toggleTemplateAction(key: string, active: boolean): Promise<{ error: string } | { ok: true }> {
  await requireAccess("editais", "manage");
  await db.update(schema.propostaTemplates).set({ active, updatedAt: new Date() }).where(eq(schema.propostaTemplates.key, str(key, 60)));
  revalidatePath("/editais/configuracao");
  return { ok: true };
}
