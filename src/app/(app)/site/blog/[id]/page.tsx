import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { SiteTabs } from "@/components/site/site-tabs";
import { PostForm } from "@/components/site/forms";
import { SITE_URL, getPostRow } from "@/lib/site";

export const metadata: Metadata = { title: "Artigo do site" };

export default async function PostPage({ params }: PageProps<"/site/blog/[id]">) {
  const { id } = await params;
  const user = await requireAccess("site");
  const isNew = id === "novo";
  const row = isNew ? null : /^\d+$/.test(id) ? await getPostRow(Number(id)) : null;
  if (!isNew && !row) notFound();
  return (
    <>
      <PageToolbar title={row ? row.title : "Novo artigo"} tabs={<SiteTabs />} />
      <PostForm
        canEdit={has(user, "site", "edit")}
        canDelete={has(user, "site", "manage")}
        viewUrl={row && row.published ? `${SITE_URL}/blog/${row.slug}` : undefined}
        initial={{
          id: row?.id,
          title: row?.title ?? "",
          slug: row?.slug ?? "",
          excerpt: row?.excerpt ?? "",
          body: row?.body ?? "",
          coverUrl: row?.coverUrl ?? "",
          tag: row?.tag ?? "Editorial",
          published: row?.published ?? false,
          publishedAt: (row?.publishedAt ?? new Date()).toISOString().slice(0, 10),
        }}
      />
    </>
  );
}
