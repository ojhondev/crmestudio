import Link from "next/link";
import { cn } from "@/lib/utils";

/** Segunda linha da barra de ferramentas: alterna entre Leads/contatos e Banco de Talentos. */
export function ContatosTabs({ active, novos = 0 }: { active: "contatos" | "talentos"; novos?: number }) {
  const tabs = [
    { key: "contatos", href: "/contatos", label: "Leads e contatos" },
    { key: "talentos", href: "/contatos/talentos", label: "Banco de Talentos" },
  ] as const;
  return (
    <nav aria-label="Seções" data-tour="contacts-tabs" className="flex gap-1 border-t px-3 sm:px-5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] whitespace-nowrap transition-colors max-md:min-h-11",
            active === t.key ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.key === "talentos" && novos > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-px text-[11px] leading-4 font-medium text-primary-foreground tabular-nums">{novos}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
