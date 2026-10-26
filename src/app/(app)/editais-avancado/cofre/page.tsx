import type { Metadata } from "next";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { todayISO } from "@/lib/format";
import { activeUsers, counts, listCofre } from "@/lib/propostas/server";
import { validityOf } from "@/lib/propostas/cofre";
import { EditaisTabs } from "../tabs";
import { CofreClient } from "./cofre-client";

export const metadata: Metadata = { title: "Cofre de habilitação" };

export default async function CofrePage() {
  const user = await requireAccess("editais");
  const [rows, team, c] = await Promise.all([listCofre(), activeUsers(), counts().catch(() => ({ andamento: 0, cofreAlerta: 0 }))]);
  const today = todayISO();
  return (
    <>
      <PageToolbar title="Editais" tabs={<EditaisTabs canManage={has(user, "editais", "manage")} andamento={c.andamento} cofreAlerta={c.cofreAlerta} />} />
      <ToolArea>
        <CofreClient
          canEdit={has(user, "editais", "edit")}
          canManage={has(user, "editais", "manage")}
          team={team}
          items={rows.map(({ c: d, ownerName }) => ({
            id: d.id,
            type: d.type,
            title: d.title,
            number: d.number,
            issuer: d.issuer,
            issuedAt: d.issuedAt,
            validUntil: d.validUntil,
            url: d.url,
            notes: d.notes,
            ownerId: d.ownerId,
            ownerName,
            validity: validityOf(d.validUntil, today),
          }))}
        />
      </ToolArea>
    </>
  );
}
