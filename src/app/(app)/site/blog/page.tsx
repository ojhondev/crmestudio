import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { SiteTabs } from "@/components/site/site-tabs";
import { PostList } from "@/components/site/lists";
import { listPosts } from "@/lib/site";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Blog do site" };

export default async function BlogPage() {
  const user = await requireAccess("site");
  const canEdit = has(user, "site", "edit");
  const rows = await listPosts();
  return (
    <>
      <PageToolbar
        title="Blog"
        tabs={<SiteTabs />}
        actions={
          canEdit && (
            <Button asChild size="sm">
              <Link href="/site/blog/novo">
                <Plus /> Novo artigo
              </Link>
            </Button>
          )
        }
      />
      <div className="mx-auto grid max-w-4xl gap-3 p-3 sm:p-5">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-[13px] text-muted-foreground">Nenhum artigo ainda. Enquanto não houver, o site mostra textos de exemplo.</p>
        ) : (
          <PostList canEdit={canEdit} items={rows.map((r) => ({ id: r.id, title: r.title, tag: r.tag, coverUrl: r.coverUrl, published: r.published, date: fmtDate(r.publishedAt) }))} />
        )}
      </div>
    </>
  );
}
