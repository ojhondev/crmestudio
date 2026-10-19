import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { SiteTabs } from "@/components/site/site-tabs";
import { ProjectList } from "@/components/site/lists";
import { listProjects } from "@/lib/site";

export const metadata: Metadata = { title: "Projetos do site" };

export default async function ProjetosPage() {
  const user = await requireAccess("site");
  const canEdit = has(user, "site", "edit");
  const rows = await listProjects();
  return (
    <>
      <PageToolbar
        title="Projetos"
        tabs={<SiteTabs />}
        actions={
          canEdit && (
            <Button asChild size="sm" className="max-md:h-11">
              <Link href="/site/projetos/novo">
                <Plus /> Novo projeto
              </Link>
            </Button>
          )
        }
      />
      <div className="mx-auto grid max-w-4xl gap-3 p-3 sm:p-5">
        <p className="text-[13px] text-muted-foreground">{canEdit ? "Arraste pela alça (ou use as setas ↑↓ no celular) para mudar a ordem em que aparecem no site. " : ""}A estrela marca os destaques da home.</p>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-[13px] text-muted-foreground">Nenhum projeto ainda. Enquanto não houver, o site mostra projetos de exemplo.</p>
        ) : (
          <ProjectList
            canEdit={canEdit}
            items={rows.map((r) => ({ id: r.id, title: r.title, category: r.category, location: r.location, year: r.year, coverUrl: r.coverUrl, published: r.published, featured: r.featured, photos: (r.gallery ?? []).length }))}
          />
        )}
      </div>
    </>
  );
}
