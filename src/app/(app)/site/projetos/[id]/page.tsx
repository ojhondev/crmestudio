import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { SiteTabs } from "@/components/site/site-tabs";
import { ProjectForm } from "@/components/site/forms";
import { SITE_URL, getProjectRow } from "@/lib/site";

export const metadata: Metadata = { title: "Projeto do site" };

export default async function ProjetoPage({ params }: PageProps<"/site/projetos/[id]">) {
  const { id } = await params;
  const user = await requireAccess("site");
  const isNew = id === "novo";
  const row = isNew ? null : /^\d+$/.test(id) ? await getProjectRow(Number(id)) : null;
  if (!isNew && !row) notFound();
  return (
    <>
      <PageToolbar title={row ? row.title : "Novo projeto"} tabs={<SiteTabs />} />
      <ProjectForm
        canEdit={has(user, "site", "edit")}
        canDelete={has(user, "site", "manage")}
        viewUrl={row && row.published ? `${SITE_URL}/projetos/${row.slug}` : undefined}
        initial={{
          id: row?.id,
          title: row?.title ?? "",
          slug: row?.slug ?? "",
          category: row?.category ?? "Restauro",
          location: row?.location ?? "",
          year: row?.year ?? "",
          area: row?.area ?? "",
          summary: row?.summary ?? "",
          body: row?.body ?? "",
          coverUrl: row?.coverUrl ?? "",
          gallery: row?.gallery ?? [],
          published: row?.published ?? false,
          featured: row?.featured ?? false,
          sort: row?.sort ?? 0,
        }}
      />
    </>
  );
}
