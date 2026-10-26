import type { Metadata } from "next";
import { requireEditais } from "@/lib/editais-app/session";
import { noteAcceptance } from "@/lib/editais-app/partners";

export const metadata: Metadata = {
  title: { default: "Editais", template: "%s · Editais" },
  applicationName: "Editais",
  description: "Editais de restauro: Radar, propostas, acervo e parceiros.",
};

/** Porteiro do app Editais: exige login e acesso (equipe com o módulo, ou parceiro convidado e ativo). */
export default async function EditaisLayout({ children }: LayoutProps<"/editais">) {
  const { actor } = await requireEditais();
  // primeiro acesso do parceiro: avisa quem convidou (uma única vez)
  if (actor.kind === "partner") await noteAcceptance(actor.id).catch(() => undefined);
  return children;
}
