import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpBlocks } from "@/components/help/blocks";
import { TourButton } from "@/components/help/help-center";
import { articleBySlug, articles } from "@/lib/help";

export async function generateMetadata({ params }: PageProps<"/ajuda/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: articleBySlug(slug)?.title ?? "Ajuda" };
}

export default async function ArticlePage({ params }: PageProps<"/ajuda/[slug]">) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();
  const i = articles.indexOf(article);
  const prev = articles[i - 1];
  const next = articles[i + 1];

  return (
    <article className="px-5 pt-6 pb-12 sm:px-8 lg:px-10">
      <Link href="/ajuda" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Central de ajuda
      </Link>
      <div className="max-w-2xl">
        <p className="label mb-1.5">{article.module}</p>
        <h1 className="h-display text-[28px] sm:text-[34px]">{article.title}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{article.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {article.href && (
            <Button asChild>
              <Link href={article.href}>
                <ExternalLink /> Abrir {article.title.split(" (")[0]}
              </Link>
            </Button>
          )}
          {article.tour && <TourButton id={article.tour} label={article.tour === "welcome" ? "Fazer o tour de boas-vindas" : "Fazer o tour desta tela"} />}
        </div>
        <div className="mt-8">
          <HelpBlocks blocks={article.body} />
        </div>
        <nav className="mt-10 grid gap-2 border-t pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={`/ajuda/${prev.slug}`} className="grid gap-0.5 rounded-xl border bg-card p-3.5 hover:border-foreground/25">
              <span className="label flex items-center gap-1">
                <ArrowLeft className="size-3" /> Anterior
              </span>
              <span className="text-[14px] font-medium">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/ajuda/${next.slug}`} className="grid gap-0.5 rounded-xl border bg-card p-3.5 text-right hover:border-foreground/25">
              <span className="label flex items-center justify-end gap-1">
                Próximo <ArrowRight className="size-3" />
              </span>
              <span className="text-[14px] font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </div>
    </article>
  );
}
