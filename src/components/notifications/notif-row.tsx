"use client";

import {
  AlarmClock, ArrowRightLeft, BadgeDollarSign, CalendarClock, CircleCheck, Clock, Info, MessageSquare, OctagonAlert, PhoneCall, Repeat, Sparkles, Trophy, UserPlus, UserRoundX, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTIF_TYPES, isNotifType, timeAgo } from "@/lib/notifications-types";

export type NotifItem = { id: string; type: string; title: string; body: string | null; href: string | null; read: boolean; at: string };

const ICON: Record<string, React.ElementType> = {
  tarefa_atrasada: AlarmClock,
  tarefa_prazo: Clock,
  tarefa_concluida: CircleCheck,
  tarefa_atribuida: UserPlus,
  tarefa_travada: OctagonAlert,
  tarefa_comentario: MessageSquare,
  tarefa_sem_responsavel: UserRoundX,
  tarefa_recorrente: Repeat,
  lead_novo: Sparkles,
  lead_followup: PhoneCall,
  negocio_previsao: CalendarClock,
  negocio_resultado: Trophy,
  negocio_etapa: ArrowRightLeft,
  negocio_valor_alto: BadgeDollarSign,
  automacao: Zap,
  sistema: Info,
};

const WARN = "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
const BAD = "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
const GOOD = "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
/** Tom do ícone: alerta (atraso/travada), atenção (prazo/follow-up), positivo (concluída/ganho) ou neutro. */
const TONE: Record<string, string> = {
  tarefa_atrasada: BAD,
  tarefa_travada: BAD,
  negocio_valor_alto: WARN,
  lead_followup: WARN,
  tarefa_prazo: WARN,
  negocio_previsao: WARN,
  tarefa_concluida: GOOD,
  negocio_resultado: GOOD,
};

export function NotifIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICON[type] ?? Info;
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand", TONE[type], className)}>
      <Icon className="size-4" />
    </span>
  );
}

export function NotifRow({ item, onOpen, now, selected, onToggle }: { item: NotifItem; onOpen: (n: NotifItem) => void; now: number; selected?: boolean; onToggle?: (id: string) => void }) {
  return (
    <li className={cn("flex items-stretch gap-1 border-b last:border-b-0", !item.read && "bg-brand-soft/40")}>
      {onToggle && (
        <label className="grid w-10 shrink-0 cursor-pointer place-items-center">
          <input type="checkbox" checked={!!selected} onChange={() => onToggle(item.id)} className="size-4 accent-[var(--brand)]" aria-label={`Selecionar: ${item.title}`} />
        </label>
      )}
      <button type="button" onClick={() => onOpen(item)} className={cn("flex min-h-14 min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60", onToggle && "pl-1")}>
        <NotifIcon type={item.type} />
        <span className="grid min-w-0 flex-1 gap-0.5 leading-snug">
          <span className={cn("text-[13.5px] break-words", !item.read ? "font-semibold" : "font-medium")}>{item.title}</span>
          {item.body && <span className="line-clamp-2 text-[12.5px] break-words text-muted-foreground">{item.body}</span>}
          <span className="text-xs text-muted-foreground">
            {isNotifType(item.type) ? NOTIF_TYPES[item.type].label : "Aviso"} · {timeAgo(item.at, now)}
          </span>
        </span>
        {!item.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Não lida" />}
      </button>
    </li>
  );
}
