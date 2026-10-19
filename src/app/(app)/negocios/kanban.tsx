"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtDate, initials, money, moneyShort, todayISO } from "@/lib/format";
import type { Stage } from "@/lib/db/schema";
import type { BoardDeal } from "@/lib/deals";
import { moveDeal } from "./actions";

export function Kanban({ stages, deals: initial, canEdit = true, canLaunch = true }: { stages: Stage[]; deals: BoardDeal[]; canEdit?: boolean; canLaunch?: boolean }) {
  const [deals, setDeals] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  // novos dados do servidor substituem o estado otimista
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setDeals(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const byStage = useMemo(() => {
    const map = new Map<number, BoardDeal[]>();
    for (const s of stages) map.set(s.id, []);
    for (const d of [...deals].sort((a, b) => a.position - b.position)) map.get(d.stageId)?.push(d);
    return map;
  }, [deals, stages]);

  const active = deals.find((d) => d.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const dealId = String(e.active.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    let stageId: number;
    let position: number;
    if (over.startsWith("stage-")) {
      stageId = Number(over.slice(6));
      const col = (byStage.get(stageId) ?? []).filter((d) => d.id !== dealId);
      position = (col.at(-1)?.position ?? 0) + 1;
    } else {
      const target = deals.find((d) => d.id === over.slice(5));
      if (!target || target.id === dealId) return;
      stageId = target.stageId;
      const col = (byStage.get(stageId) ?? []).filter((d) => d.id !== dealId);
      const idx = col.findIndex((d) => d.id === target.id);
      const prev = col[idx - 1]?.position ?? target.position - 1;
      position = (prev + target.position) / 2;
    }
    if (stageId === deal.stageId && position === deal.position) return;

    setDeals((ds) => ds.map((d) => (d.id === dealId ? { ...d, stageId, position } : d)));
    startTransition(async () => {
      try {
        const { kind } = await moveDeal(dealId, stageId, position);
        if (kind === "ganho" && !canLaunch) toast.success("Negócio fechado! 🎉");
        else if (kind === "ganho")
          toast.success("Negócio fechado! 🎉", {
            description: "Quer lançar o valor no financeiro?",
            action: { label: "Lançar", onClick: () => router.push(`/financeiro/lancamentos?novo=receita&deal=${dealId}`) },
          });
      } catch {
        toast.error("Não foi possível mover o negócio");
        setDeals(initial);
      }
    });
  }

  return (
    <DndContext id="deals-board" sensors={canEdit ? sensors : []} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div data-tour="kanban" className="thin-scroll flex min-h-0 flex-1 snap-x snap-proximity gap-3 overflow-x-auto scroll-px-3 p-3 sm:scroll-px-5 sm:px-5">
        {stages.map((s) => {
          const list = byStage.get(s.id) ?? [];
          const total = list.reduce((sum, d) => sum + d.valueCents, 0);
          return <Column key={s.id} stage={s} count={list.length} total={total} deals={list} activeId={activeId} />;
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
        {active ? <Card deal={active} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Cor de texto (branco ou quase-preto) com maior contraste sobre a cor da etapa. */
function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const onWhite = 1.05 / (L + 0.05);
  const onDark = (L + 0.05) / 0.0675; // #111111
  return onWhite >= onDark ? "#ffffff" : "#111111";
}

function Column({
  stage,
  count,
  total,
  deals,
  activeId,
}: {
  stage: Stage;
  count: number;
  total: number;
  deals: BoardDeal[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  const fg = readableOn(stage.color);
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex h-full w-[82vw] max-w-[304px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-black/15 bg-[#e1ded9] shadow-sm transition-colors sm:w-[288px] dark:border-white/15 dark:bg-[#0a0909]",
        isOver && "ring-2 ring-brand",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5" style={{ background: stage.color, color: fg }}>
        <h2 className="min-w-0 truncate text-[13.5px] font-bold">{stage.name}</h2>
        <span className="rounded-full px-2 py-px text-[12px] leading-4 font-bold tabular-nums" style={{ background: fg, color: stage.color }}>
          {count}
        </span>
        <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums">{moneyShort(total)}</span>
      </header>
      <div className="thin-scroll grid min-h-24 flex-1 content-start gap-2.5 overflow-x-hidden overflow-y-auto p-2.5">
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} dimmed={activeId === d.id} />
        ))}
        {!deals.length && <p className="px-2 py-6 text-center text-[12.5px] font-medium text-muted-foreground">Coluna vazia. Arraste um negócio para cá.</p>}
      </div>
    </section>
  );
}

function DraggableCard({ deal, dimmed }: { deal: BoardDeal; dimmed: boolean }) {
  const drag = useDraggable({ id: deal.id });
  const drop = useDroppable({ id: `card-${deal.id}` });
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      {...drag.attributes}
      className={cn("touch-manipulation outline-none", dimmed && "opacity-30")}
    >
      {drop.isOver && !dimmed && <div className="mb-2 h-0.5 rounded bg-brand" />}
      <Card deal={deal} />
    </div>
  );
}

function Card({ deal, overlay }: { deal: BoardDeal; overlay?: boolean }) {
  const today = todayISO();
  const late = !!deal.expectedClose && deal.expectedClose < today;
  return (
    <Link
      href={`/negocios/${deal.id}`}
      draggable={false}
      className={cn(
        "block rounded-lg border border-black/20 bg-white p-3 shadow-[0_1px_3px_rgb(0_0_0/0.18)] transition-shadow hover:border-black/40 hover:shadow-md dark:border-white/20 dark:bg-[#232120] dark:shadow-[0_1px_3px_rgb(0_0_0/0.6)] dark:hover:border-white/40",
        late && "border-l-[3px] border-l-destructive",
        overlay && "rotate-[1.5deg] cursor-grabbing shadow-xl",
      )}
    >
      <p className="line-clamp-2 text-[14px] leading-snug font-semibold text-foreground">{deal.title}</p>
      {(deal.contactName || deal.company) && (
        <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
          {deal.contactName}
          {deal.company && deal.contactName ? " · " : ""}
          {deal.company}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="num text-[15px] font-bold text-foreground">{deal.valueCents ? money(deal.valueCents) : "—"}</span>
        {deal.ownerName && (
          <span
            title={deal.ownerName}
            className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background"
          >
            {initials(deal.ownerName)}
          </span>
        )}
      </div>
      {(deal.expectedClose || deal.location) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          {deal.expectedClose && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
                late ? "bg-[#fbe4e0] text-[#8f1f12] dark:bg-[#4a1a14] dark:text-[#ffb4a8]" : "bg-secondary text-foreground",
              )}
            >
              <CalendarClock className="size-3" /> {late ? "Atrasado · " : "Previsão · "}
              {fmtDate(deal.expectedClose, "dd/MM")}
            </span>
          )}
          {deal.location && (
            <span className="flex min-w-0 items-center gap-0.5 text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{deal.location}</span>
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
