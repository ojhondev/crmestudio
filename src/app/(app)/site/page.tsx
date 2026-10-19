import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileText, Film, Images, Briefcase, FolderOpen, Type } from "lucide-react";
import { has, requireAccess } from "@/lib/auth";
import { PageToolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { SiteTabs } from "@/components/site/site-tabs";
import { SITE_URL, listJobs, listMedia, listPosts, listProjects } from "@/lib/site";

export const metadata: Metadata = { title: "Site" };

export default async function SiteHome() {
  const user = await requireAccess("site");
  const [projects, posts, jobs, media] = await Promise.all([listProjects(), listPosts(), listJobs(), listMedia()]);
  const pub = (a: { published: boolean }[]) => a.filter((x) => x.published).length;
  const canEdit = has(user, "site", "edit");

  const cards = [
    { href: "/site/projetos", icon: FolderOpen, title: "Projetos", line: `${pub(projects)} publicados de ${projects.length}`, text: "Portfólio: capa, galeria, texto, destaque e ordem." },
    { href: "/site/blog", icon: FileText, title: "Blog", line: `${pub(posts)} publicados de ${posts.length}`, text: "Artigos com capa, data e rascunho." },
    { href: "/site/vagas", icon: Briefcase, title: "Vagas", line: `${pub(jobs)} abertas de ${jobs.length}`, text: "Trabalhe conosco: descrição e requisitos." },
    { href: "/site/imagens", icon: Images, title: "Imagens", line: `${media.length} na biblioteca`, text: "Biblioteca e imagens de cada seção da home." },
    { href: "/site/textos", icon: Type, title: "Textos e vídeo", line: "Home e Trabalhe conosco", text: "Abertura, manifesto, vídeo da home e chamadas." },
  ];

  return (
    <>
      <PageToolbar
        title="Site"
        tabs={<SiteTabs />}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={SITE_URL} target="_blank" rel="noreferrer">
              <ArrowUpRight /> Ver no site
            </a>
          </Button>
        }
      />
      <div className="mx-auto grid max-w-5xl gap-5 p-3 sm:p-5">
        <p className="text-[13px] text-muted-foreground">
          O que você salva aqui vai direto para {SITE_URL.replace("https://", "")}. {canEdit ? "" : "Você tem acesso só para consulta."}
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ href, icon: Icon, title, line, text }) => (
            <li key={href}>
              <Link href={href} className="grid h-full gap-1.5 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30">
                <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="size-4.5" />
                </span>
                <span className="text-[15px] font-medium">{title}</span>
                <span className="text-[13px] text-foreground/80">{line}</span>
                <span className="text-xs text-muted-foreground">{text}</span>
              </Link>
            </li>
          ))}
          <li className="grid gap-1.5 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
            <Film className="size-4" />
            <span>
              O <strong>/admin</strong> do próprio site continua ativo como reserva. Textos longos aqui são parágrafos simples, como o site exibe.
            </span>
          </li>
        </ul>
      </div>
    </>
  );
}
