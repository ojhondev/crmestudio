"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NOTIF_GROUPS, NOTIF_TYPES, type NotifGroup } from "@/lib/notifications-types";
import { markAllRead, markRead } from "@/app/(app)/notificacoes/actions";
import { NotifRow, type NotifItem } from "./notif-row";

const POLL_MS = 60_000;

type Filter = "todas" | "nao-lidas" | NotifGroup;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "nao-lidas", label: "Não lidas" },
  { key: "tarefas", label: NOTIF_GROUPS.tarefas },
  { key: "negocios", label: NOTIF_GROUPS.negocios },
];

/** Sino no topo: contador de não lidas, atualização a cada ~60 s e ao voltar para a aba, gaveta com a lista. */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("todas");
  const [now, setNow] = useState(0);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch("/api/notificacoes?limit=40", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { unread: number; items: NotifItem[] };
      setUnread(d.unread);
      setItems(d.items);
      setNow(Date.now());
      setLoaded(true);
    } catch {
      /* sem rede: tenta de novo na próxima rodada */
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const wake = () => document.visibilityState === "visible" && refresh();
    const timer = setInterval(wake, POLL_MS);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [open, refresh]);

  const shown = items.filter((n) => {
    if (filter === "todas") return true;
    if (filter === "nao-lidas") return !n.read;
    return (NOTIF_TYPES as Record<string, { group: string }>)[n.type]?.group === filter;
  });

  function openItem(n: NotifItem) {
    if (!n.read) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markRead([n.id]);
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  }

  async function readAll() {
    setItems((l) => l.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await markAllRead();
  }

  return (
    <>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label={unread ? `Avisos: ${unread} não lidos` : "Avisos"} data-tour="bell">
        <Bell />
        {unread > 0 && (
          <span className="absolute top-1 right-0.5 grid min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[11px] leading-[18px] font-semibold text-on-brand" aria-hidden>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md" data-tour="bell-panel">
          <SheetHeader className="gap-1 border-b px-4 py-3 pr-12">
            <SheetTitle className="text-base font-semibold">Avisos</SheetTitle>
            <SheetDescription className="text-xs">{unread ? `${unread} não ${unread === 1 ? "lido" : "lidos"}` : "Tudo em dia"}</SheetDescription>
          </SheetHeader>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b px-3 py-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] max-md:min-h-10", filter === f.key ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30")}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            {!loaded ? (
              <p className="p-6 text-center text-[13px] text-muted-foreground">Carregando…</p>
            ) : shown.length ? (
              <ul>
                {shown.map((n) => (
                  <NotifRow key={n.id} item={n} onOpen={openItem} now={now} />
                ))}
              </ul>
            ) : (
              <div className="grid place-items-center gap-2 px-6 py-14 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Bell className="size-4.5" />
                </span>
                <p className="text-sm font-medium">Nenhum aviso por aqui</p>
                <p className="max-w-xs text-[13px] text-muted-foreground">Atrasos, prazos, leads e menções aparecem neste lugar assim que acontecerem.</p>
              </div>
            )}
          </div>
          <div className="safe-bottom flex items-center gap-2 border-t px-3 py-2">
            <Button variant="ghost" size="sm" className="max-md:h-10" onClick={readAll} disabled={!unread}>
              <CheckCheck /> Marcar todas como lidas
            </Button>
            <Link href="/notificacoes" onClick={() => setOpen(false)} className="ml-auto text-[13px] text-brand underline-offset-2 hover:underline max-md:py-2.5">
              Ver todas
            </Link>
            <Link href="/notificacoes?aba=preferencias" onClick={() => setOpen(false)} aria-label="Preferências de aviso" className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:size-9">
              <Settings2 className="size-4.5" />
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
