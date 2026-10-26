import type { Metadata } from "next";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { counts, listPortfolio } from "@/lib/propostas/server";
import { EditaisTabs } from "../tabs";
import { PortfolioClient } from "./portfolio-client";

export const metadata: Metadata = { title: "Atestados e portfólio" };

export default async function PortfolioPage() {
  const user = await requireAccess("editais");
  const [rows, c] = await Promise.all([listPortfolio(), counts().catch(() => ({ andamento: 0, cofreAlerta: 0 }))]);
  return (
    <>
      <PageToolbar title="Editais" tabs={<EditaisTabs canManage={has(user, "editais", "manage")} andamento={c.andamento} cofreAlerta={c.cofreAlerta} />} />
      <ToolArea>
        <PortfolioClient
          canEdit={has(user, "editais", "edit")}
          canManage={has(user, "editais", "manage")}
          items={rows.map((r) => ({ id: r.id, title: r.title, client: r.client, year: r.year, valueCents: r.valueCents, kind: r.kind, tags: r.tags ?? [], tombamento: r.tombamento, responsible: r.responsible, description: r.description, links: r.links ?? [] }))}
        />
      </ToolArea>
    </>
  );
}
