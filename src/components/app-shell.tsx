"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileSignature,
  ListChecks,
  Table2,
  HardDrive,
  Globe,
  ChevronsUpDown,
  KanbanSquare,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  UserCog,
  X,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { logout } from "@/app/login/actions";
import type { SessionUser } from "@/lib/auth";
import { PROFILES, atLeast } from "@/lib/permissions";
import { ANA_UI_ENABLED } from "@/lib/ana-flag";
import { useAna } from "@/components/ana/ana-provider";
import { HelpMenu } from "@/components/help/help-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type Item = { key: string; href: string; label: string; icon: React.ElementType; badge?: number };
type Group = { label: string; items: Item[] };

const has = (u: SessionUser, m: keyof SessionUser["perms"]) => atLeast(u.perms[m], "view");
const profileLabel = (u: SessionUser) => (u.profile in PROFILES ? PROFILES[u.profile as keyof typeof PROFILES].label : "Equipe");

function groups(user: SessionUser): Group[] {
  const g: Group[] = [];
  const operacao: Item[] = [{ key: "painel", href: "/", label: "Painel", icon: LayoutDashboard }];
  if (has(user, "negocios")) operacao.push({ key: "negocios", href: "/negocios", label: "Negócios", icon: KanbanSquare });
  if (has(user, "tarefas")) operacao.push({ key: "tarefas", href: "/tarefas", label: "Tarefas", icon: ListChecks });
  if (has(user, "contatos")) operacao.push({ key: "contatos", href: "/contatos", label: "Leads e contatos", icon: Users });
  if (has(user, "agenda")) operacao.push({ key: "agenda", href: "/agenda", label: "Agenda", icon: CalendarDays });
  g.push({ label: "Operação", items: operacao });

  const gestao: Item[] = [];
  if (has(user, "financeiro")) gestao.push({ key: "financeiro", href: "/financeiro", label: "Financeiro", icon: Wallet });
  if (has(user, "planilhas")) gestao.push({ key: "planilhas", href: "/planilhas", label: "Planilhas", icon: Table2 });
  if (has(user, "drive")) gestao.push({ key: "drive", href: "/drive", label: "Drive", icon: HardDrive });
  if (has(user, "site")) gestao.push({ key: "site", href: "/site", label: "Site", icon: Globe });
  if (has(user, "documentos")) gestao.push({ key: "documentos", href: "/documentos", label: "Documentos", icon: FileSignature });
  if (gestao.length) g.push({ label: "Gestão", items: gestao });

  const sistema: Item[] = [];
  if (has(user, "equipe")) sistema.push({ key: "equipe", href: "/equipe", label: "Equipe e acessos", icon: UserCog });
  sistema.push({ key: "ajustes", href: "/ajustes", label: "Ajustes", icon: Settings });
  g.push({ label: "Sistema", items: sistema });
  return g;
}

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function Brand({ collapsedMark }: { collapsedMark?: boolean }) {
  return (
    <Link href="/" className="flex h-9 items-center" aria-label="Estúdio Restaura — início">
      {/* eslint-disable @next/next/no-img-element */}
      {collapsedMark ? (
        <img src="/mark.png" alt="" className="mx-auto h-7 w-auto" />
      ) : (
        <>
          <img src="/logo.png" alt="Estúdio Restaura" className="h-8 w-auto dark:hidden" />
          <img src="/logo-white.png" alt="Estúdio Restaura" className="hidden h-8 w-auto dark:block" />
        </>
      )}
      {/* eslint-enable @next/next/no-img-element */}
    </Link>
  );
}

function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const ana = useAna();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon" data-tour="sidebar">
      <SidebarHeader className="relative h-14 justify-center border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-2">
        {isMobile && (
          <button
            type="button"
            onClick={() => setOpenMobile(false)}
            aria-label="Fechar menu"
            className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
          >
            <X className="size-5" />
          </button>
        )}
        <div className="group-data-[collapsible=icon]:hidden">
          <Brand />
        </div>
        <div className="hidden group-data-[collapsible=icon]:block">
          <Brand collapsedMark />
        </div>
      </SidebarHeader>

      <SidebarContent className="thin-scroll gap-0 py-2">
        {groups(user).map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            <SidebarGroupLabel className="label h-6 px-2 text-xs tracking-[0.16em]">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ key, href, label, icon: Icon, badge }) => (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild isActive={isActive(pathname, href)} tooltip={label} className="h-11 text-[13.5px] md:h-9">
                      <Link href={href} onClick={close} data-tour={`nav-${key}`}>
                        <Icon className={cn(isActive(pathname, href) && "text-brand")} />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {!!badge && <SidebarMenuBadge className="rounded-full bg-brand text-xs font-semibold text-on-brand peer-data-active/menu-button:text-on-brand">{badge}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <SidebarMenu>
          {ANA_UI_ENABLED && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Falar com a Ana"
                onClick={() => {
                  close();
                  ana.open();
                }}
                className="h-11 border border-sidebar-border bg-card hover:border-brand/40 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent"
                data-tour="ana"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="grid text-left leading-tight">
                  <span className="text-[13px] font-medium">Falar com a Ana</span>
                  <span className="text-xs text-muted-foreground">copiloto · ⌘J</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Central de ajuda" isActive={pathname.startsWith("/ajuda")}>
              <Link href="/ajuda" onClick={close} data-tour="nav-ajuda">
                <LifeBuoy />
                <span>Central de ajuda</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-12 w-full items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              aria-label="Minha conta"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-secondary text-xs font-medium">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[13px] font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{profileLabel(user)}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : state === "collapsed" ? "right" : "top"} align="start" className="w-60">
            <DropdownMenuLabel className="grid font-normal">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/ajustes" onClick={close}>
                <Settings /> Meu perfil e senha
              </Link>
            </DropdownMenuItem>
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function TopBar() {
  const ana = useAna();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b bg-background px-3 md:px-4">
      <SidebarTrigger className="hidden md:inline-flex" data-tour="sidebar-toggle" aria-label="Recolher ou expandir menu" />
      <Link href="/" className="flex h-11 min-w-11 items-center justify-center md:hidden" aria-label="Início">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.png" alt="" className="h-6 w-auto" />
      </Link>
      <div className="ml-auto flex items-center gap-0.5">
        <HelpMenu />
        <ThemeToggle />
        {ANA_UI_ENABLED && (
          <button
            onClick={() => ana.open()}
            className="ml-1 flex h-10 items-center gap-1.5 rounded-full bg-brand-soft px-3.5 text-[13px] font-medium text-brand md:hidden"
            data-tour="ana-top"
          >
            <Sparkles className="size-3.5" /> Ana
          </button>
        )}
      </div>
    </header>
  );
}

/** Menu inferior estilo app nativo (somente celular). "Mais" abre o menu completo. */
function BottomNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const tabs: Item[] = [
    { key: "painel", href: "/", label: "Painel", icon: LayoutDashboard },
    ...(has(user, "negocios") ? [{ key: "negocios", href: "/negocios", label: "Negócios", icon: KanbanSquare }] : []),
    ...(has(user, "tarefas") ? [{ key: "tarefas", href: "/tarefas", label: "Tarefas", icon: ListChecks }] : []),
    ...(has(user, "agenda") ? [{ key: "agenda", href: "/agenda", label: "Agenda", icon: CalendarDays }] : []),
  ];
  return (
    <nav
      aria-label="Navegação principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden"
      data-tour="bottom-nav"
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch">
        {tabs.map(({ key, href, label, icon: Icon, badge }) => {
          const active = isActive(pathname, href);
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                data-tour={`nav-${key}`}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground transition-colors", active && "font-medium text-foreground")}
              >
                <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-brand-soft text-brand")}>
                  <Icon className="size-[21px]" strokeWidth={active ? 2.2 : 1.8} />
                  {!!badge && (
                    <span className="absolute -top-0.5 right-1 min-w-4 rounded-full bg-brand px-1 text-center text-xs leading-4 font-semibold text-on-brand">{badge}</span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button onClick={() => setOpenMobile(true)} className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground" data-tour="nav-mais">
            <span className="grid h-7 w-12 place-items-center rounded-full">
              <Menu className="size-[21px]" strokeWidth={1.8} />
            </span>
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function AppShell({
  user,
  defaultOpen,
  children,
}: {
  user: SessionUser;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} style={{ "--sidebar-width": "15.5rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
      <AppSidebar user={user} />
      <SidebarInset className="min-w-0 bg-background">
        <TopBar />
        <div className="flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      </SidebarInset>
      <BottomNav user={user} />
    </SidebarProvider>
  );
}
