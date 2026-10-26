import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/format";
import { validityOf } from "@/lib/propostas/cofre";
import { listCofre, listPortfolio, activeUsers, getConfig, ensureTemplates } from "@/lib/propostas/server";
import { getStudio } from "@/lib/docs/server";
import { requireStaff } from "@/lib/editais-app/session";
import { ConfigClient } from "@/app/(app)/editais-avancado/configuracao/config-client";
import { CofreView, ObrasView } from "@/components/editais-app/acervo-view";
import { PageTitle, PageWrap } from "@/components/editais-app/primitives";

export const metadata: Metadata = { title: "Acervo" };

const TABS = [
  { key: "cofre", label: "Cofre" },
  { key: "obras", label: "Obras" },
  { key: "modelos", label: "Modelos" },
] as const;

export default async function AcervoPage({ searchParams }: PageProps<"/editais/acervo">) {
  const { actor } = await requireStaff("view");
  const sp = await searchParams;
  const aba = TABS.some((t) => t.key === sp.aba) ? (sp.aba as (typeof TABS)[number]["key"]) : "cofre";
  const canEdit = atLeast(actor.level, "edit");
  const canManage = atLeast(actor.level, "manage");
  const today = todayISO();

  let body: React.ReactNode = null;
  if (aba === "cofre") {
    const rows = await listCofre();
    body = (
      <CofreView
        canEdit={canEdit}
        canManage={canManage}
        items={rows.map(({ c: d }) => ({ id: d.id, type: d.type, title: d.title, number: d.number, issuer: d.issuer, validUntil: d.validUntil, url: d.url, validity: validityOf(d.validUntil, today) }))}
      />
    );
  } else if (aba === "obras") {
    const rows = await listPortfolio();
    body = <ObrasView canEdit={canEdit} canManage={canManage} items={rows.map((r) => ({ id: r.id, title: r.title, client: r.client, year: r.year, valueCents: r.valueCents, kind: r.kind, tags: r.tags ?? [], tombamento: r.tombamento, description: r.description, links: r.links ?? [] }))} />;
  } else {
    await ensureTemplates();
    const [studio, cfg, team, templates, stages] = await Promise.all([
      getStudio(),
      getConfig(),
      activeUsers(),
      db.select().from(schema.propostaTemplates).orderBy(asc(schema.propostaTemplates.name)),
      db.select({ name: schema.stages.name, kind: schema.stages.kind }).from(schema.stages).orderBy(asc(schema.stages.position)),
    ]);
    body = canManage ? (
      <ConfigClient
        part="modelos"
        studio={{ name: studio.name, legalName: studio.legalName, document: studio.document, address: studio.address, city: studio.city, email: studio.email, phone: studio.phone, forum: studio.forum }}
        cfg={cfg}
        team={team}
        stages={stages.filter((s) => s.kind === "aberto").map((s) => s.name)}
        templates={templates.map((t) => ({ key: t.key, type: t.type as "checklist" | "matriz", name: t.name, description: t.description ?? "", items: t.items as unknown as Record<string, unknown>[], builtin: t.builtin, active: t.active }))}
      />
    ) : (
      <ul className="grid gap-2 md:grid-cols-2">
        {templates.filter((t) => t.active).map((t) => (
          <li key={t.key} className="ed-card p-4">
            <p className="text-[16px] font-medium">{t.name}</p>
            <p className="text-sm text-muted-foreground">{t.type === "checklist" ? "Checklist" : "Habilitação"}{t.description ? ` · ${t.description}` : ""}</p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <PageWrap>
      <PageTitle title="Acervo" sub="O que o estúdio já tem pronto para qualquer edital: documentos, obras e modelos." />
      <div role="tablist" aria-label="Acervo" className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link key={t.key} role="tab" aria-selected={aba === t.key} href={`/editais/acervo?aba=${t.key}`} className={cn("flex min-h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10", aba === t.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </div>
      {body}
    </PageWrap>
  );
}
