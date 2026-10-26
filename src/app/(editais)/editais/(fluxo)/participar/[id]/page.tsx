import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fmtDateTime, toLocalInput, todayISO } from "@/lib/format";
import { daysLeft } from "@/lib/editais/filters";
import { getConfig, listTemplates } from "@/lib/propostas/server";
import { suggestTemplateKey } from "@/lib/propostas/templates";
import { requireStaff } from "@/lib/editais-app/session";
import { activePartners } from "@/lib/editais-app/partners";
import { ParticiparFlow } from "@/components/editais-app/flows/participar-flow";

export const metadata: Metadata = { title: "Vou participar" };

export default async function ParticiparPage({ params }: PageProps<"/editais/participar/[id]">) {
  const { actor } = await requireStaff("edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [e] = await db.select().from(schema.editais).where(eq(schema.editais.id, id)).limit(1);
  if (!e) notFound();
  const [dossie] = await db.select({ id: schema.propostaDossies.id }).from(schema.propostaDossies).where(eq(schema.propostaDossies.editalId, id)).limit(1);
  const [tpls, cfg, partners, people] = await Promise.all([
    listTemplates("checklist"),
    getConfig(),
    activePartners(),
    db.select({ id: schema.users.id, name: schema.users.name, profile: schema.users.profile, role: schema.users.role }).from(schema.users).where(eq(schema.users.active, true)),
  ]);
  const tipoToTemplate = { obra: cfg.defaultTemplate.execucao, projeto: cfg.defaultTemplate.projeto, dispensa: cfg.defaultTemplate.outro } as const;
  const guess = suggestTemplateKey(e.kind, e.modalidade, e.valueCents) as "obra" | "projeto" | "dispensa";
  const fix = (k: string) => (tpls.some((t) => t.key === k) ? k : (tpls[0]?.key ?? "obra"));
  const portalLocal = toLocalInput(e.closeAt ?? e.openAt);
  return (
    <ParticiparFlow
      edital={{
        id: e.id,
        title: e.title,
        object: e.object,
        organ: e.organ,
        place: [e.city, e.uf].filter(Boolean).join(" / "),
        kind: e.kind,
        valueCents: e.valueCents,
        closeLabel: e.closeAt ? fmtDateTime(e.closeAt) : "sem data informada",
        daysLeft: daysLeft(e.closeAt),
      }}
      portalLocal={portalLocal}
      portalDay={portalLocal ? portalLocal.slice(0, 10) : null}
      today={todayISO()}
      templates={tpls.map((t) => ({ key: t.key, name: t.name, description: t.description, items: t.items as never }))}
      tipoToTemplate={{ obra: fix(tipoToTemplate.obra), projeto: fix(tipoToTemplate.projeto), dispensa: fix(tipoToTemplate.dispensa) }}
      initialTipo={["obra", "projeto", "dispensa"].includes(guess) ? guess : "obra"}
      team={people.filter((u) => u.profile !== "parceiro_editais" && u.role !== "parceiro").map((u) => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name))}
      meId={actor.id}
      partners={partners.map((p) => ({ id: p.id, name: p.name, company: p.company }))}
      exists={!!dossie}
    />
  );
}
