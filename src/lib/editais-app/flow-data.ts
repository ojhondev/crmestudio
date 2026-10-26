import "server-only";
import { notFound, redirect } from "next/navigation";
import { loadBundle } from "@/lib/propostas/server";
import { requireStaff } from "./session";

/** Porta de entrada dos assistentes da proposta: só equipe que edita; sem proposta iniciada, vai para o "Vou participar". */
export async function loadFlowBundle(id: string) {
  const { actor, user } = await requireStaff("edit");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await loadBundle(id);
  if (!b) redirect(`/editais/participar/${id}`);
  return { actor, user, b };
}
