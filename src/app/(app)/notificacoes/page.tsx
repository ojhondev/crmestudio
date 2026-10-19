import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPrefs, listNotifications, unreadCount } from "@/lib/notifications";
import { PageToolbar, ToolArea } from "@/components/toolbar";
import { cn } from "@/lib/utils";
import { NotificationsView, PrefsView } from "./notifications-view";

export const metadata: Metadata = { title: "Avisos" };

export default async function NotificacoesPage({ searchParams }: PageProps<"/notificacoes">) {
  const user = await requireUser();
  const sp = await searchParams;
  const aba = sp.aba === "preferencias" ? "preferencias" : "avisos";

  const [items, unread, prefs] = await Promise.all([
    aba === "avisos" ? listNotifications(user.id, { limit: 30 }) : Promise.resolve([]),
    unreadCount(user.id),
    getPrefs(user.id),
  ]);

  const tab = (key: string, label: string, href: string) => (
    <Link
      href={href}
      className={cn("rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors max-md:py-2.5", aba === key ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageToolbar
        title="Avisos"
        filters={
          <div data-tour="notif-tabs" className="flex gap-1">
            {tab("avisos", unread ? `Avisos (${unread})` : "Avisos", "/notificacoes")}
            {tab("preferencias", "Preferências", "/notificacoes?aba=preferencias")}
          </div>
        }
      />
      <ToolArea>
        <div className="grid gap-4 p-3 sm:p-5">
          {aba === "avisos" ? <NotificationsView initial={items} unread={unread} /> : <PrefsView initial={prefs} />}
        </div>
      </ToolArea>
    </>
  );
}
