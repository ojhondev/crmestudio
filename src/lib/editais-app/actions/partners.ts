"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { atLeast } from "@/lib/permissions";
import { invitePartner, reactivatePartner, resendInvite, resetPartnerPassword, revokePartner, setRadarCompleto, type InvitePack, type PartnerInput } from "../partners";
import { requireEditais } from "../session";
import { parceiroRules } from "../flow-rules";
import type { WizardResult } from "@/components/editais-app/wizard/wizard";

type Err = { error: string };

/** Gerenciar parceiros exige “gerenciar” em Editais. */
async function manager() {
  const s = await requireEditais();
  if (s.actor.kind !== "staff" || !atLeast(s.actor.level, "manage")) return null;
  return { ...s, actor: s.actor };
}

/** Endereço do app para o link do convite: produção usa o domínio oficial; em desenvolvimento, o da própria requisição. */
async function origin() {
  if (process.env.NODE_ENV === "production") return "https://crm.estudiorestaura.com.br";
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3021";
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

const NO: Err = { error: "Só quem gerencia Editais convida e altera parceiros." };

/** Fim do assistente "Convidar parceiro": cria a conta e dispara o convite (e-mail se houver provedor; senão, texto pronto). */
export async function invitePartnerFlow(input: PartnerInput): Promise<WizardResult> {
  const m = await manager();
  if (!m) return NO;
  const bad = parceiroRules.nome(input.name) ?? parceiroRules.email(input.email);
  if (bad) return { error: bad };
  const r = await invitePartner({ id: m.actor.id, name: m.actor.name }, input, await origin());
  if ("error" in r) return r;
  await audit(m.actor, "parceiro_convidado", `Convidou o parceiro ${input.name.trim()} (${input.email.trim().toLowerCase()})`, { entity: "usuario", entityId: r.partnerId });
  revalidatePath("/editais/parceiros");
  return { ok: true, href: `/editais/parceiros/${r.partnerId}`, title: r.pack.emailed ? "Convite enviado" : "Convite pronto", data: { partnerId: r.partnerId, name: input.name.trim(), pack: r.pack } };
}

export async function resendInviteAction(partnerId: string): Promise<Err | { ok: true; pack: InvitePack }> {
  const m = await manager();
  if (!m) return NO;
  const r = await resendInvite({ id: m.actor.id, name: m.actor.name }, partnerId, await origin());
  revalidatePath("/editais/parceiros", "layout");
  return r;
}

export async function resetPartnerPasswordAction(partnerId: string): Promise<Err | { ok: true; pack: InvitePack }> {
  const m = await manager();
  if (!m) return NO;
  const r = await resetPartnerPassword({ id: m.actor.id, name: m.actor.name }, partnerId, await origin());
  if ("ok" in r) await audit(m.actor, "senha_redefinida", "Gerou nova senha provisória para um parceiro", { entity: "usuario", entityId: partnerId });
  revalidatePath("/editais/parceiros", "layout");
  return r;
}

export async function revokePartnerAction(partnerId: string): Promise<Err | { ok: true }> {
  const m = await manager();
  if (!m) return NO;
  const r = await revokePartner(partnerId);
  if ("ok" in r) await audit(m.actor, "parceiro_revogado", "Revogou o acesso de um parceiro", { entity: "usuario", entityId: partnerId });
  revalidatePath("/editais/parceiros", "layout");
  return r;
}

export async function reactivatePartnerAction(partnerId: string): Promise<Err | { ok: true; pack: InvitePack }> {
  const m = await manager();
  if (!m) return NO;
  const r = await reactivatePartner({ id: m.actor.id, name: m.actor.name }, partnerId, await origin());
  if ("ok" in r) await audit(m.actor, "parceiro_reativado", "Reativou o acesso de um parceiro", { entity: "usuario", entityId: partnerId });
  revalidatePath("/editais/parceiros", "layout");
  return r;
}

export async function radarCompletoAction(partnerId: string, on: boolean): Promise<Err | { ok: true }> {
  const m = await manager();
  if (!m) return NO;
  const r = await setRadarCompleto(partnerId, on);
  if ("ok" in r) await audit(m.actor, "parceiro_radar", `${on ? "Liberou" : "Tirou"} o Radar completo de um parceiro`, { entity: "usuario", entityId: partnerId });
  revalidatePath("/editais", "layout");
  return r;
}
