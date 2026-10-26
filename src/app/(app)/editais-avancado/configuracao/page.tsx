import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { getStudio } from "@/lib/docs/server";
import { activeUsers, counts, ensureTemplates, getConfig } from "@/lib/propostas/server";
import { EditaisTabs } from "../tabs";
import { ConfigClient } from "./config-client";

export const metadata: Metadata = { title: "Configuração da esteira de proposta" };

export default async function ConfigPage() {
  await requireAccess("editais", "manage");
  await ensureTemplates();
  const [studio, cfg, team, templates, c, stages] = await Promise.all([
    getStudio(),
    getConfig(),
    activeUsers(),
    db.select().from(schema.propostaTemplates).orderBy(asc(schema.propostaTemplates.name)),
    counts().catch(() => ({ andamento: 0, cofreAlerta: 0 })),
    db.select({ name: schema.stages.name, kind: schema.stages.kind }).from(schema.stages).orderBy(asc(schema.stages.position)),
  ]);
  return (
    <>
      <PageToolbar title="Editais" tabs={<EditaisTabs canManage andamento={c.andamento} cofreAlerta={c.cofreAlerta} />} />
      <ToolArea>
        <ConfigClient
          studio={{ name: studio.name, legalName: studio.legalName, document: studio.document, address: studio.address, city: studio.city, email: studio.email, phone: studio.phone, forum: studio.forum }}
          cfg={cfg}
          team={team}
          stages={stages.filter((s) => s.kind === "aberto").map((s) => s.name)}
          templates={templates.map((t) => ({ key: t.key, type: t.type as "checklist" | "matriz", name: t.name, description: t.description ?? "", items: t.items as unknown as Record<string, unknown>[], builtin: t.builtin, active: t.active }))}
        />
      </ToolArea>
    </>
  );
}
