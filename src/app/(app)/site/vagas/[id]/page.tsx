import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { SiteTabs } from "@/components/site/site-tabs";
import { JobForm } from "@/components/site/forms";
import { SITE_URL, getJobRow } from "@/lib/site";

export const metadata: Metadata = { title: "Vaga do site" };

export default async function VagaPage({ params }: PageProps<"/site/vagas/[id]">) {
  const { id } = await params;
  const user = await requireAccess("site");
  const isNew = id === "novo";
  const row = isNew ? null : /^\d+$/.test(id) ? await getJobRow(Number(id)) : null;
  if (!isNew && !row) notFound();
  return (
    <>
      <PageToolbar title={row ? row.title : "Nova vaga"} tabs={<SiteTabs />} />
      <JobForm
        canEdit={has(user, "site", "edit")}
        canDelete={has(user, "site", "manage")}
        viewUrl={row && row.published ? `${SITE_URL}/vagas/${row.slug}` : undefined}
        initial={{
          id: row?.id,
          title: row?.title ?? "",
          slug: row?.slug ?? "",
          area: row?.area ?? "",
          type: row?.type ?? "Efetivo",
          location: row?.location ?? "São Paulo · SP",
          body: row?.body ?? "",
          requirements: row?.requirements ?? [],
          published: row?.published ?? true,
          sort: row?.sort ?? 0,
        }}
      />
    </>
  );
}
