"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword, randomToken } from "@/lib/password";
import type { Role } from "@/lib/db/schema";
import {
  MODULES,
  PROFILES,
  SELECTABLE_PROFILES,
  atLeast,
  detectProfile,
  resolvePermissions,
  sanitizePermissions,
  type Permissions,
  type ProfileKey,
} from "@/lib/permissions";

const tempPassword = () => randomToken(8).replace(/[-_]/g, "x");
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Quem não é administrador não concede nível acima do que ele mesmo tem. */
function canGrant(actor: SessionUser, perms: Permissions) {
  if (actor.role === "admin") return true;
  return MODULES.every((m) => atLeast(actor.perms[m.key], perms[m.key]));
}

async function otherActiveAdmins(exceptId: string) {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true), ne(schema.users.id, exceptId)));
  return rows.length;
}

export async function createMember(_: unknown, form: FormData) {
  const actor = await requireAccess("equipe", "manage");
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const profile = String(form.get("profile")) as ProfileKey;
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe nome e um e-mail válido." };
  if (!SELECTABLE_PROFILES.includes(profile)) return { error: "Escolha um perfil." };
  if (profile === "administrador" && actor.role !== "admin") return { error: "Só um administrador cria outro administrador." };
  const preset = PROFILES[profile];
  if (!canGrant(actor, preset.perms)) return { error: "Você não pode conceder mais acesso do que você mesmo tem." };
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) return { error: "Já existe uma conta com esse e-mail." };

  const password = tempPassword();
  const [u] = await db
    .insert(schema.users)
    .values({
      name,
      email,
      role: preset.type,
      profile,
      permissions: null, // perfis prontos seguem a definição central
      ownOnly: preset.ownOnly,
      title: str(form.get("title")),
      phone: str(form.get("phone")),
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      calendarToken: randomToken(),
    })
    .returning({ id: schema.users.id });
  await audit(actor, "usuario_criado", `Criou a conta de ${name} (${email}) com o perfil ${preset.label}`, { entity: "usuario", entityId: u.id, meta: { profile } });
  revalidatePath("/equipe");
  return { ok: true, email, password };
}

export type AccessInput = {
  name: string;
  title: string;
  phone: string;
  /** perfil escolhido na tela; o servidor reconfere a partir da matriz */
  profile: string;
  permissions: Record<string, string>;
  ownOnly: boolean;
  /** gestor/supervisor (null = sem gestor; undefined = não mexe) */
  supervisorId?: string | null;
};

export async function saveMemberAccess(id: string, input: AccessInput) {
  const actor = await requireAccess("equipe", "manage");
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!target) return { error: "Pessoa não encontrada." };
  if (target.role === "admin" && actor.role !== "admin") return { error: "Só um administrador altera outro administrador." };
  const name = input.name.trim();
  if (!name) return { error: "Informe o nome." };

  const base: { name: string; title: string | null; phone: string | null; supervisorId?: string | null } = { name, title: input.title.trim() || null, phone: input.phone.trim() || null };

  // gestor/supervisor: precisa ser outra pessoa ativa e nunca pode formar um ciclo (A responde a B que responde a A)
  if (input.supervisorId !== undefined && id !== actor.id) {
    const wanted = input.supervisorId && /^[0-9a-f-]{36}$/i.test(input.supervisorId) ? input.supervisorId : null;
    if (wanted) {
      const all = await db.select({ id: schema.users.id, supervisorId: schema.users.supervisorId, active: schema.users.active }).from(schema.users);
      const sup = all.find((u) => u.id === wanted);
      if (!sup || !sup.active || wanted === id) return { error: "Escolha outra pessoa ativa como gestor." };
      for (let cur: string | null | undefined = sup.supervisorId, hops = 0; cur && hops < 20; hops++) {
        if (cur === id) return { error: "Esse gestor já responde a esta pessoa — escolha outro para não formar um ciclo." };
        cur = all.find((u) => u.id === cur)?.supervisorId;
      }
    }
    if ((wanted ?? null) !== (target.supervisorId ?? null)) {
      base.supervisorId = wanted;
      const supName = wanted ? (await db.select({ n: schema.users.name }).from(schema.users).where(eq(schema.users.id, wanted)))[0]?.n : null;
      await audit(actor, "supervisor_alterado", `Definiu ${supName ? `${supName} como gestor de ${name}` : `${name} sem gestor (avisos vão para os administradores)`}`, { entity: "usuario", entityId: id, meta: { supervisorId: wanted } });
    }
  }

  // ninguém altera o próprio nível de acesso: no máximo os dados pessoais
  if (id === actor.id) {
    await db.update(schema.users).set(base).where(eq(schema.users.id, id));
    revalidatePath("/equipe");
    return { ok: true };
  }

  // administrador que continua administrador: só dados pessoais
  const wantsAdmin = input.profile === "administrador";
  if (target.role === "admin" && wantsAdmin) {
    await db.update(schema.users).set(base).where(eq(schema.users.id, id));
    revalidatePath("/equipe");
    return { ok: true };
  }
  if (wantsAdmin) {
    if (actor.role !== "admin") return { error: "Só um administrador cria outro administrador." };
    await db
      .update(schema.users)
      .set({ ...base, role: "admin", profile: "administrador", permissions: null, ownOnly: false })
      .where(eq(schema.users.id, id));
    await audit(actor, "permissoes_alteradas", `Tornou ${name} administrador`, { entity: "usuario", entityId: id });
    revalidatePath("/equipe");
    return { ok: true };
  }
  if (target.role === "admin" && (await otherActiveAdmins(id)) === 0) return { error: "Este é o único administrador ativo — não dá para rebaixá-lo." };

  const perms = sanitizePermissions(input.permissions);
  if (!canGrant(actor, perms)) return { error: "Você não pode conceder mais acesso do que você mesmo tem." };
  const ownOnly = !!input.ownOnly;
  const profile = detectProfile(perms, ownOnly); // bate com um perfil pronto? senão, personalizado
  const role: Role = profile === "parceiro" || target.role === "parceiro" ? "parceiro" : "equipe";

  const before = resolvePermissions(target);
  await db
    .update(schema.users)
    .set({ ...base, role, profile, permissions: profile === "personalizado" ? perms : null, ownOnly })
    .where(eq(schema.users.id, id));

  const changed = MODULES.filter((m) => before[m.key] !== perms[m.key]).map((m) => `${m.label}: ${before[m.key]} → ${perms[m.key]}`);
  await audit(
    actor,
    "permissoes_alteradas",
    `Alterou o acesso de ${name} (perfil ${PROFILES[profile].label})${changed.length ? ` — ${changed.join("; ")}` : ""}${ownOnly !== target.ownOnly ? `; só os próprios: ${ownOnly ? "sim" : "não"}` : ""}`,
    { entity: "usuario", entityId: id, meta: { profile, ownOnly, changed } },
  );
  revalidatePath("/equipe");
  return { ok: true };
}

export async function setMemberActive(id: string, active: boolean) {
  const actor = await requireAccess("equipe", "manage");
  if (id === actor.id) return { error: "Você não pode desativar a própria conta." };
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!target) return { error: "Pessoa não encontrada." };
  if (target.role === "admin" && actor.role !== "admin") return { error: "Só um administrador altera outro administrador." };
  if (!active && target.role === "admin" && (await otherActiveAdmins(id)) === 0) return { error: "Este é o único administrador ativo." };
  await db
    .update(schema.users)
    .set({ active, sessionVersion: target.sessionVersion + (active ? 0 : 1) }) // desativar derruba as sessões abertas
    .where(eq(schema.users.id, id));
  await audit(actor, active ? "usuario_ativado" : "usuario_desativado", `${active ? "Reativou" : "Desativou"} a conta de ${target.name}`, { entity: "usuario", entityId: id });
  revalidatePath("/equipe");
  return { ok: true };
}

export async function resetPassword(id: string) {
  const actor = await requireAccess("equipe", "manage");
  if (id === actor.id) return { error: "Troque a sua própria senha em Ajustes." };
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!target) return { error: "Pessoa não encontrada." };
  if (target.role === "admin" && actor.role !== "admin") return { error: "Só um administrador altera outro administrador." };
  const password = tempPassword();
  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(password), mustChangePassword: true, sessionVersion: target.sessionVersion + 1 })
    .where(eq(schema.users.id, id));
  await audit(actor, "senha_redefinida", `Gerou nova senha provisória para ${target.name}`, { entity: "usuario", entityId: id });
  return { ok: true, email: target.email, password };
}
