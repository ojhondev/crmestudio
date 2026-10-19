"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/site", label: "Visão geral" },
  { href: "/site/projetos", label: "Projetos" },
  { href: "/site/blog", label: "Blog" },
  { href: "/site/vagas", label: "Vagas" },
  { href: "/site/imagens", label: "Imagens" },
  { href: "/site/textos", label: "Textos e vídeo" },
];

export function SiteTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Seções do site" className="thin-scroll flex gap-1 overflow-x-auto border-t px-3 sm:px-5">
      {TABS.map((t) => {
        const active = t.href === "/site" ? path === "/site" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("shrink-0 inline-flex items-center border-b-2 px-3 py-2.5 text-[13px] max-md:min-h-11", active ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
