"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/** Abas do módulo Editais: oportunidades, propostas em andamento, cofre, atestados e configuração. */
export function EditaisTabs({ canManage, andamento, cofreAlerta }: { canManage: boolean; andamento?: number; cofreAlerta?: number }) {
  const path = usePathname();
  const sp = useSearchParams();
  const aba = sp.get("aba");
  const tabs = [
    { href: "/editais-avancado", label: "Oportunidades", active: path === "/editais-avancado" && aba !== "propostas", tour: "edital-tab-oportunidades" },
    { href: "/editais-avancado?aba=propostas", label: "Propostas em andamento", badge: andamento, active: (path === "/editais-avancado" && aba === "propostas") || path.startsWith("/editais-avancado/proposta/"), tour: "edital-tab-propostas" },
    { href: "/editais-avancado/cofre", label: "Cofre de habilitação", badge: cofreAlerta, warn: true, active: path.startsWith("/editais-avancado/cofre"), tour: "edital-tab-cofre" },
    { href: "/editais-avancado/portfolio", label: "Atestados e portfólio", active: path.startsWith("/editais-avancado/portfolio"), tour: "edital-tab-portfolio" },
    ...(canManage ? [{ href: "/editais-avancado/configuracao", label: "Configuração", active: path.startsWith("/editais-avancado/configuracao"), tour: "edital-tab-config" }] : []),
  ];
  const help = path.startsWith("/editais-avancado/como-usar");
  return (
    <div className="flex items-stretch border-t">
      <nav aria-label="Seções de Editais" className="thin-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto px-3 sm:px-5">
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
      <div className="flex shrink-0 items-center border-l px-2 sm:px-3">
        <Link
          href="/editais-avancado/como-usar"
          data-tour="edital-como-usar"
          aria-current={help ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium max-md:min-h-11",
            help ? "border-brand bg-brand text-on-brand" : "border-brand/50 bg-brand-soft text-brand hover:border-brand",
          )}
        >
          <BookOpen className="size-4" aria-hidden /> Como usar
        </Link>
      </div>
    </div>
  );
}
