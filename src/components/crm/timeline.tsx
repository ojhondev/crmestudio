import { ArrowRightLeft, CalendarCheck, Mail, MapPinned, MessageCircle, Phone, StickyNote } from "lucide-react";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";

const ICONS: Record<string, React.ElementType> = {
  nota: StickyNote,
  ligacao: Phone,
  email: Mail,
  reuniao: CalendarCheck,
  visita: MapPinned,
  etapa: ArrowRightLeft,
  whatsapp: MessageCircle,
};

export type TimelineItem = { id: string; type: string; body: string; createdAt: Date; userName: string | null };

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="py-4 text-[13px] text-muted-foreground">Nenhum registro ainda.</p>;
  return (
    <ol className="relative grid gap-5 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = ICONS[a.type] ?? StickyNote;
        const isStage = a.type === "etapa";
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="z-10 grid size-7 shrink-0 place-items-center rounded-full border bg-white text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[11.5px] text-muted-foreground">
                {ACTIVITY_TYPES[a.type] ?? a.type} · {a.userName ?? "Sistema"} · {fmtDateTime(a.createdAt)}
              </p>
              <p className={isStage ? "text-[13px] text-muted-foreground" : "mt-0.5 text-[13.5px] whitespace-pre-wrap"}>{a.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
