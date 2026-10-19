import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { SiteTabs } from "@/components/site/site-tabs";
import { JobList } from "@/components/site/lists";
import { listJobs } from "@/lib/site";

export const metadata: Metadata = { title: "Vagas do site" };

export default async function VagasPage() {
  const user = await requireAccess("site");
  const canEdit = has(user, "site", "edit");
  const rows = await listJobs();
  return (
    <>
      <PageToolbar
        title="Vagas"
        tabs={<SiteTabs />}
        actions={
          canEdit && (
            <Button asChild size="sm" className="max-md:h-11">
              <Link href="/site/vagas/novo">
                <Plus /> Nova vaga
              </Link>
            </Button>
          )
        }
      />
      <div className="mx-auto grid max-w-4xl gap-3 p-3 sm:p-5">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-[13px] text-muted-foreground">Nenhuma vaga cadastrada. Enquanto não houver, o site mostra vagas de exemplo.</p>
        ) : (
          <JobList canEdit={canEdit} items={rows.map((r) => ({ id: r.id, title: r.title, area: r.area, type: r.type, location: r.location, published: r.published }))} />
        )}
      </div>
    </>
  );
}
