"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageToolbar, ToolbarGroup } from "@/components/toolbar";

const TABS = [
  { href: "/financeiro", label: "Painel" },
  { href: "/financeiro/lancamentos", label: "Lançamentos" },
  { href: "/financeiro/planilha", label: "Planilha" },
];

/** Barra de ferramentas do módulo: título e abas. Sem usar sub-menu da sidebar: funciona igual no celular. */
export function FinanceNav() {
  const pathname = usePathname();
  return (
    <PageToolbar
      title="Financeiro"
      filters={
        <nav data-tour="fin-tabs" aria-label="Seções do financeiro">
          <ToolbarGroup>
            {TABS.map((t) => {
              const active = t.href === "/financeiro" ? pathname === "/financeiro" : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors max-md:inline-flex max-md:min-h-11 max-md:items-center",
                    active ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </ToolbarGroup>
        </nav>
      }
    />
  );
}
