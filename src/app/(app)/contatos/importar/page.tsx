import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { has, requireUser } from "@/lib/auth";
import { getFormOptions } from "@/lib/options";
import { getConnection, publicInfo } from "@/lib/contacts-import/google";
import { pendingCount } from "@/lib/contacts-import/service";
import { Button } from "@/components/ui/button";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Importar contatos" };

export default async function ImportPage({ searchParams }: PageProps<"/contatos/importar">) {
  const user = await requireUser();
  if (!has(user, "contatos", "edit") || user.ownOnly) redirect("/?negado=1");
  const sp = await searchParams;
  const [conn, options, recent] = await Promise.all([
    getConnection(user.id),
    getFormOptions(user),
    db
      .select()
      .from(schema.contactImports)
      .where(has(user, "contatos", "manage") ? undefined : eq(schema.contactImports.userId, user.id))
      .orderBy(desc(schema.contactImports.createdAt))
      .limit(8),
  ]);
  const pending = await pendingCount(user.id);
  return (
    <>
      <PageToolbar
        title="Importar contatos"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/contatos">
              <ArrowLeft /> Contatos
            </Link>
          </Button>
        }
      />
      <ToolArea>
        <Importer
          info={publicInfo(conn)}
          team={options.team}
          me={user.id}
          pending={pending}
          googleResult={typeof sp.google === "string" ? sp.google : undefined}
          recent={recent.map((b) => ({
            id: b.id,
            label: b.label,
            source: b.source,
            status: b.status,
            created: b.created,
            updated: b.updated,
            skipped: b.skipped,
            undoneCount: b.undoneCount,
            at: b.createdAt.toISOString(),
            mine: b.userId === user.id,
          }))}
        />
      </ToolArea>
    </>
  );
}
