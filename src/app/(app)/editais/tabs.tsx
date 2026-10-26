"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Abas do módulo Editais: oportunidades, propostas em andamento, cofre, atestados e configuração. */
export function EditaisTabs({ canManage, andamento, cofreAlerta }: { canManage: boolean; andamento?: number; cofreAlerta?: number }) {
  const path = usePathname();
  const sp = useSearchParams();
  const aba = sp.get("aba");
  const tabs = [
    { href: "/editais", label: "Oportunidades", active: path === "/editais" && aba !== "propostas", tour: "edital-tab-oportunidades" },
    { href: "/editais?aba=propostas", label: "Propostas em andamento", badge: andamento, active: (path === "/editais" && aba === "propostas") || path.startsWith("/editais/proposta/"), tour: "edital-tab-propostas" },
    { href: "/editais/cofre", label: "Cofre de habilitação", badge: cofreAlerta, warn: true, active: path.startsWith("/editais/cofre"), tour: "edital-tab-cofre" },
    { href: "/editais/portfolio", label: "Atestados e portfólio", active: path.startsWith("/editais/portfolio"), tour: "edital-tab-portfolio" },
    ...(canManage ? [{ href: "/editais/configuracao", label: "Configuração", active: path.startsWith("/editais/configuracao"), tour: "edital-tab-config" }] : []),
  ];
  return (
    <nav aria-label="Seções de Editais" className="thin-scroll flex gap-1 overflow-x-auto border-t px-3 sm:px-5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          data-tour={t.tour}
          aria-current={t.active ? "page" : undefined}
          className={cn("inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] max-md:min-h-11", t.active ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {t.label}
          {t.badge ? <span className={cn("num grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-5 font-semibold", t.warn ? "bg-brand text-on-brand" : "bg-muted text-foreground")}>{t.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
