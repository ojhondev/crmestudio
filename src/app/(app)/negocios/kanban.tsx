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

export function Kanban({ stages, deals: initial }: { stages: Stage[]; deals: BoardDeal[] }) {
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
        if (kind === "ganho")
          toast.success("Negócio fechado! 🎉", {
            description: "Quer lançar o valor no financeiro?",
            action: { label: "Lançar", onClick: () => router.push(`/financeiro?novo=receita&deal=${dealId}`) },
          });
      } catch {
        toast.error("Não foi possível mover o negócio");
        setDeals(initial);
      }
    });
  }

  return (
    <DndContext id="deals-board" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div data-tour="kanban" className="thin-scroll flex min-h-0 flex-1 snap-x snap-proximity gap-3 overflow-x-auto scroll-px-5 px-5 pb-6 sm:px-8 lg:px-10">
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
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[80vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl bg-muted/60 transition-colors sm:w-[272px]",
        isOver && "bg-brand-soft/70 ring-1 ring-brand/30",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="size-2 rounded-full" style={{ background: stage.color }} />
        <h2 className="text-[13px] font-medium">{stage.name}</h2>
        <span className="text-[12px] text-muted-foreground">{count}</span>
        <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">{total ? moneyShort(total) : ""}</span>
      </header>
      <div className="thin-scroll grid max-h-[calc(100svh-230px)] min-h-24 content-start gap-2 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} dimmed={activeId === d.id} />
        ))}
        {!deals.length && <p className="px-2 py-6 text-center text-[12px] text-muted-foreground/70">Arraste negócios para cá</p>}
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
  const late = deal.expectedClose && deal.expectedClose < todayISO();
  return (
    <Link
      href={`/negocios/${deal.id}`}
      draggable={false}
      className={cn(
        "block rounded-lg border bg-card p-3 transition-shadow hover:border-foreground/25",
        overlay && "rotate-[1.5deg] cursor-grabbing shadow-lg",
      )}
    >
      <p className="line-clamp-2 text-[13px] leading-snug font-medium">{deal.title}</p>
      {(deal.contactName || deal.company) && (
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {deal.contactName}
          {deal.company && deal.contactName ? " · " : ""}
          {deal.company}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <span className="num text-[13px] text-foreground">{deal.valueCents ? money(deal.valueCents) : "—"}</span>
        {deal.location && (
          <span className="flex min-w-0 items-center gap-0.5 truncate">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{deal.location}</span>
          </span>
        )}
        {deal.ownerName && (
          <span
            title={deal.ownerName}
            className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[9.5px] font-medium text-foreground"
          >
            {initials(deal.ownerName)}
          </span>
        )}
      </div>
      {deal.expectedClose && (
        <p className={cn("mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground", late && "text-destructive")}>
          <CalendarClock className="size-3" /> {fmtDate(deal.expectedClose, "dd/MM")}
        </p>
      )}
    </Link>
  );
}
