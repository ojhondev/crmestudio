"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/financeiro", label: "Painel" },
  { href: "/financeiro/lancamentos", label: "Lançamentos" },
  { href: "/financeiro/planilha", label: "Planilha" },
];

/** Abas do módulo. Sem usar sub-menu da sidebar: funciona igual no celular. */
export function FinanceNav() {
  const pathname = usePathname();
  return (
    <nav data-tour="fin-tabs" aria-label="Seções do financeiro" className="thin-scroll flex gap-6 overflow-x-auto border-b px-5 pt-3 sm:px-8 lg:px-10">
      {TABS.map((t) => {
        const active = t.href === "/financeiro" ? pathname === "/financeiro" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-0.5 pb-2.5 text-[13.5px] max-md:pt-2.5 whitespace-nowrap transition-colors",
              active ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
