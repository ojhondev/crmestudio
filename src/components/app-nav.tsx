"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  KanbanSquare,
  Users,
  MessageCircle,
  CalendarDays,
  Wallet,
  UserCog,
  Settings,
  LogOut,
  Menu,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { logout } from "@/app/login/actions";
import { useAna } from "@/components/ana/ana-provider";
import type { SessionUser } from "@/lib/auth";

type Item = { href: string; label: string; icon: React.ElementType; show: boolean; badge?: number };

function items(user: SessionUser, unread: number): Item[] {
  const staff = user.role !== "parceiro";
  return [
    { href: "/", label: "Painel", icon: LayoutGrid, show: true },
    { href: "/negocios", label: "Negócios", icon: KanbanSquare, show: true },
    { href: "/contatos", label: "Leads e contatos", icon: Users, show: staff },
    { href: "/atendimento", label: "Atendimento", icon: MessageCircle, show: staff, badge: unread },
    { href: "/agenda", label: "Agenda", icon: CalendarDays, show: true },
    { href: "/financeiro", label: "Financeiro", icon: Wallet, show: staff },
    { href: "/equipe", label: "Equipe e parceiros", icon: UserCog, show: user.role === "admin" },
    { href: "/ajustes", label: "Ajustes", icon: Settings, show: true },
  ].filter((i) => i.show);
}

function NavList({ user, unread, onNavigate }: { user: SessionUser; unread: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const ana = useAna();
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 pt-6 pb-7">
        <BrandMark className="h-6" />
        <span className="text-[15px] font-medium tracking-tight">
          estúdio <span className="font-semibold">restaura</span>
        </span>
      </Link>

      <nav className="grid gap-0.5 px-3">
        {items(user, unread).map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active && "bg-sidebar-accent font-medium text-sidebar-foreground",
              )}
            >
              <Icon className={cn("size-4 opacity-70", active && "text-brand opacity-100")} />
              <span className="flex-1">{label}</span>
              {!!badge && (
                <span className="rounded-full bg-brand px-1.5 text-[11px] leading-5 font-medium text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-3 p-3">
        <button
          onClick={() => {
            onNavigate?.();
            ana.open();
          }}
          className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-white px-3 py-2.5 text-left transition-colors hover:border-brand/40"
        >
          <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand">
            <Sparkles className="size-3.5" />
          </span>
          <span className="grid leading-tight">
            <span className="text-[13px] font-medium">Falar com a Ana</span>
            <span className="text-[11.5px] text-muted-foreground">sua copiloto · ⌘J</span>
          </span>
        </button>

        <div className="flex items-center gap-2.5 px-2 py-1">
          <Avatar className="size-8">
            <AvatarFallback className="bg-secondary text-[11px] font-medium">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[13px] font-medium">{user.name}</span>
            <span className="truncate text-[11.5px] text-muted-foreground capitalize">
              {user.role === "admin" ? "Administrador" : user.role === "equipe" ? "Equipe" : "Parceiro"}
            </span>
          </div>
          <form action={logout}>
            <button
              aria-label="Sair"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar({ user, unread }: { user: SessionUser; unread: number }) {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
      <NavList user={user} unread={unread} />
    </aside>
  );
}

export function MobileBar({ user, unread }: { user: SessionUser; unread: number }) {
  const [open, setOpen] = useState(false);
  const ana = useAna();
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur lg:hidden">
      <button aria-label="Menu" onClick={() => setOpen(true)} className="-ml-1 grid size-9 place-items-center rounded-md hover:bg-muted">
        <Menu className="size-5" />
      </button>
      <BrandMark className="h-5" />
      <span className="text-sm font-medium">restaura</span>
      <button
        onClick={() => ana.open()}
        className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand"
      >
        <Sparkles className="size-3.5" /> Ana
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <NavList user={user} unread={unread} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
