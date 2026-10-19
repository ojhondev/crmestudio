"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, SimpleSelect } from "@/components/form";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { EVENT_TYPES } from "@/lib/constants";
import { fmtDate, fmtTime, isoDateBR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteEvent, saveEvent } from "./actions";

type Ev = {
  id: string;
  title: string;
  type: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  dealId: string | null;
  contactId: string | null;
  userId: string | null;
  dealTitle: string | null;
  userName: string | null;
};
type Opt = { id: string; name: string };

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function AgendaView({
  month,
  days,
  today,
  events,
  deals,
  contacts,
  team,
  userId,
  isPartner,
  openNew,
  presetDeal,
}: {
  month: string;
  days: string[];
  today: string;
  events: Ev[];
  deals: Opt[];
  contacts: Opt[];
  team: Opt[];
  userId: string;
  isPartner: boolean;
  openNew?: boolean;
  presetDeal?: string;
}) {
  const [dialog, setDialog] = useState<{ event?: Ev; date?: string; dealId?: string } | null>(
    openNew ? { date: today, dealId: presetDeal } : null,
  );
  const [mine, setMine] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const e of events) {
      if (mine && e.userId !== userId) continue;
      let d = isoDateBR(new Date(e.startsAt));
      const last = isoDateBR(new Date(e.endsAt));
      for (let i = 0; i < 62 && d <= last; i++) {
        map.set(d, [...(map.get(d) ?? []), e]);
        d = new Date(new Date(d + "T12:00:00Z").getTime() + 864e5).toISOString().slice(0, 10);
      }
    }
    return map;
  }, [events, mine, userId]);

  const upcoming = events.filter((e) => isoDateBR(new Date(e.endsAt)) >= today && (!mine || e.userId === userId)).slice(0, 12);
  const monthLabel = fmtDate(month + "-15", "MMMM 'de' yyyy");

  return (
    <div className="grid gap-5 px-5 pb-12 sm:px-8 lg:px-10 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Mês anterior">
            <Link href={`/agenda?m=${shiftMonth(month, -1)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Próximo mês">
            <Link href={`/agenda?m=${shiftMonth(month, 1)}`}>
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="ml-1 text-lg font-light capitalize">{monthLabel}</h2>
          {month !== today.slice(0, 7) && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/agenda">Hoje</Link>
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {!isPartner && (
              <div className="flex items-center gap-2">
                <Switch id="mine" checked={mine} onCheckedChange={setMine} />
                <Label htmlFor="mine" className="text-[12.5px] font-normal text-muted-foreground">
                  Só os meus
                </Label>
              </div>
            )}
            <Button onClick={() => setDialog({ date: today })}>
              <Plus /> Evento
            </Button>
          </div>
        </div>

        <div data-tour="agenda-grid" className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {WEEK.map((w) => (
              <div key={w} className="px-2 py-2 text-center text-[11px] tracking-wider text-muted-foreground uppercase">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const outside = d.slice(0, 7) !== month;
              return (
                <div
                  key={d}
                  onClick={() => setDialog({ date: d })}
                  className={cn(
                    "group min-h-[92px] cursor-pointer border-r border-b p-1.5 transition-colors last:border-r-0 hover:bg-muted/40 sm:min-h-[112px] [&:nth-child(7n)]:border-r-0",
                    outside && "bg-muted/25",
                  )}
                >
                  <div className="mb-1 flex items-center">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-[12px]",
                        outside && "text-muted-foreground/60",
                        d === today && "bg-brand font-medium text-white",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    <Plus className="ml-auto size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                  <div className="grid gap-0.5">
                    {list.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setDialog({ event: e });
                        }}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-muted"
                        style={{ background: `${EVENT_TYPES[e.type]?.color ?? "#776157"}14` }}
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: EVENT_TYPES[e.type]?.color }} />
                        {!e.allDay && <span className="hidden text-muted-foreground sm:inline">{fmtTime(e.startsAt)}</span>}
                        <span className="truncate">{e.title}</span>
                      </button>
                    ))}
                    {list.length > 3 && <span className="px-1 text-[10.5px] text-muted-foreground">+{list.length - 3} mais</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="grid content-start gap-3">
        <h3 className="label">Próximos</h3>
        {upcoming.length ? (
          upcoming.map((e) => (
            <button key={e.id} onClick={() => setDialog({ event: e })} className="grid gap-0.5 rounded-lg border bg-card p-3 text-left hover:border-foreground/20">
              <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ background: EVENT_TYPES[e.type]?.color }} />
                {fmtDate(e.startsAt, "EEE, dd/MM")} {e.allDay ? "· dia todo" : `· ${fmtTime(e.startsAt)}`}
              </span>
              <span className="text-[13px] font-medium">{e.title}</span>
              {e.location && (
                <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                  <MapPin className="size-3" /> {e.location}
                </span>
              )}
            </button>
          ))
        ) : (
          <p className="text-[13px] text-muted-foreground">Nada marcado neste mês.</p>
        )}
      </aside>

      <EventDialog state={dialog} onClose={() => setDialog(null)} deals={deals} contacts={contacts} team={team} isPartner={isPartner} />
    </div>
  );
}

function EventDialog({
  state,
  onClose,
  deals,
  contacts,
  team,
  isPartner,
}: {
  state: { event?: Ev; date?: string; dealId?: string } | null;
  onClose: () => void;
  deals: Opt[];
  contacts: Opt[];
  team: Opt[];
  isPartner: boolean;
}) {
  const router = useRouter();
  const [result, action, pending] = useActionState(saveEvent, null);
  const [, start] = useTransition();
  const e = state?.event;
  const [allDay, setAllDay] = useState(false);
  const [prevEvent, setPrevEvent] = useState(e);
  if (e !== prevEvent) {
    setPrevEvent(e);
    setAllDay(!!e?.allDay);
  }
  useEffect(() => {
    if (result?.ok) {
      toast.success("Evento salvo");
      onClose();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const date = e ? isoDateBR(new Date(e.startsAt)) : (state?.date ?? "");
  const endDate = e ? isoDateBR(new Date(e.endsAt)) : date;

  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-normal">{e ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>
        <form key={e?.id ?? date} action={action} className="grid gap-4">
          {e && <input type="hidden" name="id" value={e.id} />}
          <Field label="Título" htmlFor="ev-title">
            <Input id="ev-title" name="title" required defaultValue={e?.title} placeholder="Visita técnica — Igreja do Carmo" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <SimpleSelect
                name="type"
                defaultValue={e?.type ?? "reuniao"}
                options={Object.entries(EVENT_TYPES).map(([value, t]) => ({ value, label: t.label }))}
              />
            </Field>
            <div className="flex items-end gap-2 pb-1.5">
              <Switch id="allDay" name="allDay" checked={allDay} onCheckedChange={setAllDay} />
              <Label htmlFor="allDay" className="text-[13px] font-normal">
                Dia inteiro
              </Label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Data" htmlFor="ev-date" className="col-span-2 sm:col-span-2">
              <Input id="ev-date" name="date" type="date" required defaultValue={date} />
            </Field>
            {allDay ? (
              <Field label="Até" htmlFor="ev-endDate" className="col-span-2">
                <Input id="ev-endDate" name="endDate" type="date" defaultValue={endDate} />
              </Field>
            ) : (
              <>
                <Field label="Início" htmlFor="ev-start">
                  <Input id="ev-start" name="start" type="time" defaultValue={e && !e.allDay ? fmtTime(e.startsAt) : "09:00"} />
                </Field>
                <Field label="Fim" htmlFor="ev-end">
                  <Input id="ev-end" name="end" type="time" defaultValue={e && !e.allDay ? fmtTime(e.endsAt) : "10:00"} />
                </Field>
              </>
            )}
          </div>
          <Field label="Local" htmlFor="ev-location">
            <Input id="ev-location" name="location" defaultValue={e?.location ?? ""} placeholder="Endereço ou link da reunião" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Negócio">
              <SimpleSelect name="dealId" allowNone defaultValue={e?.dealId ?? state?.dealId} options={deals.map((d) => ({ value: d.id, label: d.name }))} />
            </Field>
            {!isPartner && (
              <Field label="Contato">
                <SimpleSelect name="contactId" allowNone defaultValue={e?.contactId} options={contacts.map((c) => ({ value: c.id, label: c.name }))} />
              </Field>
            )}
            {!isPartner && (
              <Field label="Responsável">
                <SimpleSelect name="userId" defaultValue={e?.userId ?? undefined} placeholder="Eu" options={team.map((u) => ({ value: u.id, label: u.name }))} />
              </Field>
            )}
          </div>
          <Field label="Descrição" htmlFor="ev-desc">
            <Textarea id="ev-desc" name="description" rows={2} defaultValue={e?.description ?? ""} />
          </Field>
          {result?.error && <p className="text-sm text-destructive">{result.error}</p>}
          <div className="flex items-center gap-2">
            {e && (
              <ConfirmButton
                title="Excluir evento?"
                action={async () => {
                  await deleteEvent(e.id);
                  onClose();
                  start(() => router.refresh());
                }}
              />
            )}
            <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
