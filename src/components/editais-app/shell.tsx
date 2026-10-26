"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, ArrowLeftToLine, CircleHelp, ClipboardList, Handshake, House, LogOut, Radar, ScrollText, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { logout } from "@/app/login/actions";
import { NotificationBell } from "@/components/notifications/bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type ShellUser = { name: string; email: string; kind: "staff" | "partner"; canManage: boolean };

type Item = { href: string; label: string; icon: React.ElementType; match: (p: string) => boolean };

const staffItems = (canManage: boolean): Item[] => [
  { href: "/editais/radar", label: "Radar", icon: Radar, match: (p) => p.startsWith("/editais/radar") || p === "/editais" || p.startsWith("/editais/participar") },
  { href: "/editais/propostas", label: "Propostas", icon: ClipboardList, match: (p) => p.startsWith("/editais/propostas") },
  { href: "/editais/acervo", label: "Acervo", icon: Archive, match: (p) => p.startsWith("/editais/acervo") },
  ...(canManage ? [{ href: "/editais/parceiros", label: "Parceiros", icon: Handshake, match: (p: string) => p.startsWith("/editais/parceiros") }] : []),
  { href: "/editais/ajustes", label: "Ajustes", icon: SlidersHorizontal, match: (p) => p.startsWith("/editais/ajustes") },
];

const partnerItems: Item[] = [
  { href: "/editais", label: "Início", icon: House, match: (p) => p === "/editais" },
  { href: "/editais/radar", label: "Radar", icon: Radar, match: (p) => p.startsWith("/editais/radar") },
  { href: "/editais/propostas", label: "Propostas", icon: ClipboardList, match: (p) => p.startsWith("/editais/propostas") },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-on-brand", className)} aria-hidden>
      <ScrollText className="size-5" strokeWidth={1.9} />
    </span>
  );
}

export function EditaisShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = user.kind === "staff" ? staffItems(user.canManage) : partnerItems;
  const [searching, setSearching] = useState(false);
  // no Radar a busca fica na própria lista (uma só, sem duplicar)
  const onRadar = pathname === "/editais/radar";

  return (
    <div className="min-h-svh overflow-x-clip bg-background text-foreground md:pl-[84px]">
      {/* navegação lateral (computador) */}
      <nav aria-label="Editais" className="fixed inset-y-0 left-0 z-40 hidden w-[84px] flex-col items-center gap-1 border-r bg-card py-4 md:flex">
        <Link href={user.kind === "staff" ? "/editais/radar" : "/editais"} className="mb-3 grid place-items-center gap-1 rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Editais — início">
          <BrandMark />
          <span className="ed-title text-[13px]">Editais</span>
        </Link>
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 w-[68px] flex-col items-center justify-center gap-1 rounded-xl text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-brand-soft font-semibold text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
        <div className="mt-auto grid gap-1">
          {user.kind === "staff" && (
            <Link href="/negocios" className="flex min-h-12 w-[68px] flex-col items-center justify-center gap-1 rounded-xl text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" title="Voltar ao CRM">
              <ArrowLeftToLine className="size-[18px]" />
              CRM
            </Link>
          )}
        </div>
      </nav>

      {/* topo */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-6">
        <Link href={user.kind === "staff" ? "/editais/radar" : "/editais"} className="flex items-center gap-2 md:hidden" aria-label="Editais — início">
          <BrandMark className="size-8 rounded-lg" />
          <span className="ed-title text-base">Editais</span>
        </Link>
        <form action="/editais/radar" role="search" className={cn("relative ml-auto min-w-0 flex-1 md:ml-0 md:max-w-md", searching ? "block" : "max-md:hidden", onRadar && "hidden")}>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            name="q"
            aria-label="Buscar editais"
            placeholder="Buscar edital, órgão ou cidade"
            autoFocus={searching}
            className="h-10 w-full rounded-full border bg-card pr-4 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-9 md:text-sm"
          />
          {user.kind === "staff" && <input type="hidden" name="aba" value="todos" />}
        </form>
        <div className="ml-auto flex items-center gap-0.5 max-md:ml-0">
          <Button variant="ghost" size="icon" className={cn("md:hidden", onRadar && "hidden")} onClick={() => setSearching((s) => !s)} aria-label={searching ? "Fechar busca" : "Buscar"} aria-pressed={searching}>
            {searching ? <X /> : <Search />}
          </Button>
          <NotificationBell />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-10" aria-label="Minha conta">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand">{initials(user.name)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="grid font-normal">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                <span className="mt-1 text-xs text-muted-foreground">{user.kind === "staff" ? "Equipe" : "Parceiro convidado"}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/editais/ajustes?aba=conta">
                  <UserRound /> Minha conta
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/editais/como-usar">
                  <CircleHelp /> Como usar
                </Link>
              </DropdownMenuItem>
              {user.kind === "staff" && (
                <DropdownMenuItem asChild>
                  <Link href="/negocios">
                    <ArrowLeftToLine /> Voltar ao CRM
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <form action={logout}>
                <DropdownMenuItem asChild variant="destructive">
                  <button type="submit" className="w-full">
                    <LogOut /> Sair
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main id="conteudo" className="min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10">
        {children}
      </main>

      {/* navegação inferior (celular) */}
      <nav aria-label="Editais" className="ed-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card md:hidden">
        <ul className="mx-auto flex h-16 max-w-xl items-stretch">
          {items.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-xs outline-none focus-visible:bg-muted", active ? "font-semibold text-brand" : "text-muted-foreground")}
                >
                  <span className={cn("grid h-7 w-14 place-items-center rounded-full transition-colors", active && "bg-brand-soft")}>
                    <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
