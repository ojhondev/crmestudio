"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, BellOff, CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { NOTIF_GROUPS, NOTIF_TYPES, NOTIF_TYPE_KEYS, type NotifGroup, type NotifType } from "@/lib/notifications-types";
import { NotifIcon, NotifRow, type NotifItem } from "@/components/notifications/notif-row";
import { archiveAllRead, archiveNotifications, markAllRead, markRead, savePrefs } from "./actions";

export function NotificationsView({ initial, unread }: { initial: NotifItem[]; unread: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [type, setType] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [more, setMore] = useState(initial.length >= 30);
  const [sel, setSel] = useState<string[]>([]);
  const [now, setNow] = useState(0);
  const [pending, start] = useTransition();
  const [unreadN, setUnreadN] = useState(unread);

  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  async function load(reset: boolean, nextType = type, nextUnread = onlyUnread) {
    const q = new URLSearchParams({ limit: "30" });
    if (nextType) q.set("type", nextType);
    if (nextUnread) q.set("unread", "1");
    if (!reset && items.length) q.set("before", items[items.length - 1].at);
    const r = await fetch(`/api/notificacoes?${q}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { unread: number; items: NotifItem[] };
    setUnreadN(d.unread);
    setItems((l) => (reset ? d.items : [...l, ...d.items]));
    setMore(d.items.length >= 30);
    setNow(Date.now());
  }

  function pickType(t: string) {
    setType(t);
    setSel([]);
    void load(true, t, onlyUnread);
  }
  function toggleUnread() {
    setOnlyUnread(!onlyUnread);
    setSel([]);
    void load(true, type, !onlyUnread);
  }

  function open(n: NotifItem) {
    if (!n.read) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadN((u) => Math.max(0, u - 1));
      void markRead([n.id]);
    }
    if (n.href) router.push(n.href);
  }

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function readSelected() {
    start(async () => {
      await markRead(sel);
      setItems((l) => l.map((x) => (sel.includes(x.id) ? { ...x, read: true } : x)));
      setUnreadN((u) => Math.max(0, u - items.filter((x) => sel.includes(x.id) && !x.read).length));
      setSel([]);
    });
  }
  function archiveSelected() {
    start(async () => {
      await archiveNotifications(sel);
      setItems((l) => l.filter((x) => !sel.includes(x.id)));
      setSel([]);
      router.refresh();
    });
  }
  function readAll() {
    start(async () => {
      await markAllRead(type || undefined);
      setItems((l) => l.map((x) => ({ ...x, read: true })));
      setUnreadN(0);
      toast.success("Tudo marcado como lido");
    });
  }
  function clearRead() {
    start(async () => {
      await archiveAllRead();
      setItems((l) => l.filter((x) => !x.read));
      toast.success("Avisos lidos arquivados");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!type} onClick={() => pickType("")}>
          Tudo
        </Chip>
        {NOTIF_TYPE_KEYS.filter((k) => k !== "sistema" && k !== "automacao").map((k) => (
          <Chip key={k} active={type === k} onClick={() => pickType(k)}>
            {NOTIF_TYPES[k].label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-[13px]">
          <Switch checked={onlyUnread} onCheckedChange={toggleUnread} /> Só não lidas {unreadN ? `(${unreadN})` : ""}
        </label>
        {sel.length ? (
          <>
            <Button size="sm" variant="outline" className="max-md:h-10" onClick={readSelected} disabled={pending}>
              <CheckCheck /> Marcar {sel.length} como lidas
            </Button>
            <Button size="sm" variant="outline" className="max-md:h-10" onClick={archiveSelected} disabled={pending}>
              <Archive /> Arquivar
            </Button>
            <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => setSel([])}>
              Limpar seleção
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="max-md:h-10" onClick={readAll} disabled={pending || !unreadN}>
              <CheckCheck /> Marcar {type ? "desta categoria" : "todas"} como lidas
            </Button>
            <Button size="sm" variant="ghost" className="max-md:h-10" onClick={clearRead} disabled={pending || !items.some((i) => i.read)}>
              <Archive /> Arquivar lidas
            </Button>
          </>
        )}
      </div>

      {items.length ? (
        <ul className="overflow-hidden rounded-xl border bg-card">
          {items.map((n) => (
            <NotifRow key={n.id} item={n} onOpen={open} now={now} selected={sel.includes(n.id)} onToggle={toggle} />
          ))}
        </ul>
      ) : (
        <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="size-4.5" />
          </span>
          <p className="text-sm font-medium">{onlyUnread ? "Nenhum aviso não lido" : "Nenhum aviso ainda"}</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">Atrasos, prazos, leads parados, conclusões e menções aparecem aqui. Ajuste o que quer receber em Preferências.</p>
        </div>
      )}
      {more && items.length > 0 && (
        <Button variant="outline" className="max-md:h-11" onClick={() => load(false)}>
          Carregar mais
        </Button>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] whitespace-nowrap max-md:min-h-10", active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/30")}
    >
      {children}
    </button>
  );
}

export function PrefsView({ initial }: { initial: { muted: boolean; disabledTypes: NotifType[] } }) {
  const [muted, setMuted] = useState(initial.muted);
  const [off, setOff] = useState<string[]>(initial.disabledTypes);
  const [pending, start] = useTransition();

  function persist(nextMuted: boolean, nextOff: string[]) {
    setMuted(nextMuted);
    setOff(nextOff);
    start(async () => {
      const r = await savePrefs({ muted: nextMuted, disabledTypes: nextOff });
      if (!r.ok) toast.error("Não foi possível salvar.");
    });
  }

  const groups = (Object.keys(NOTIF_GROUPS) as NotifGroup[]).map((g) => ({ g, types: NOTIF_TYPE_KEYS.filter((k) => NOTIF_TYPES[k].group === g) }));

  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <Switch checked={muted} onCheckedChange={(v) => persist(v, off)} className="mt-0.5" />
        <span className="grid leading-tight">
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <BellOff className="size-4 text-muted-foreground" /> Silenciar todos os avisos
          </span>
          <span className="mt-0.5 text-[12.5px] text-muted-foreground">Nada novo aparece no sino nem na lista. Os fatos continuam sendo registrados, então ao voltar você não recebe uma enxurrada de avisos antigos.</span>
        </span>
      </label>

      {groups.map(({ g, types }) => (
        <section key={g} className={cn("overflow-hidden rounded-xl border bg-card", muted && "opacity-60")}>
          <h2 className="label border-b px-4 py-2.5">{NOTIF_GROUPS[g]}</h2>
          <ul className="divide-y">
            {types.map((k) => (
              <li key={k}>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5">
                  <NotifIcon type={k} />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="text-[13.5px] font-medium">{NOTIF_TYPES[k].label}</span>
                    <span className="text-xs text-muted-foreground">{NOTIF_TYPES[k].help}</span>
                  </span>
                  <Switch checked={!off.includes(k)} disabled={muted} onCheckedChange={(v) => persist(muted, v ? off.filter((x) => x !== k) : [...off, k])} aria-label={NOTIF_TYPES[k].label} />
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{pending ? "Salvando…" : "As escolhas são salvas na hora e valem só para você."}</p>
    </div>
  );
}
