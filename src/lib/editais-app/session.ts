import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { atLeast, type Level } from "@/lib/permissions";
import { actorFromUser } from "./authz";
import type { EditaisActor } from "./access";

export type EditaisSession = { user: NonNullable<Awaited<ReturnType<typeof getUser>>>; actor: EditaisActor };

/** Sessão do app Editais (memoizada por request) ou null. Não redireciona. */
export const getEditaisSession = cache(async (): Promise<EditaisSession | null> => {
  const user = await getUser();
  if (!user || user.mustChangePassword) return null;
  const actor = await actorFromUser({ id: user.id, name: user.name, role: user.role, profile: user.profile, perms: user.perms });
  return actor ? { user, actor } : null;
});

/** Exige login + acesso ao app. Parceiro sem convite válido e equipe sem o módulo "editais" não passam. */
export async function requireEditais(): Promise<EditaisSession> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/primeiro-acesso");
  const s = await getEditaisSession();
  if (!s) redirect(user.role === "parceiro" ? "/login?erro=sem_acesso" : "/?negado=1");
  return s;
}

/** Só equipe, com um nível mínimo no módulo (parceiro volta para o início do app). */
export async function requireStaff(level: Level = "view"): Promise<EditaisSession & { actor: Extract<EditaisActor, { kind: "staff" }> }> {
  const s = await requireEditais();
  if (s.actor.kind !== "staff" || !atLeast(s.actor.level, level)) redirect("/editais");
  return s as EditaisSession & { actor: Extract<EditaisActor, { kind: "staff" }> };
}
