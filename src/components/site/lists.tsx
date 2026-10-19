"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { previewSrc } from "./image-field";
import { reorderProjects, toggleJob, togglePost, toggleProject } from "@/app/(app)/site/actions";

type Res = { ok: boolean; error?: string };

function PublishSwitch({ checked, canEdit, run, label = "Publicado" }: { checked: boolean; canEdit: boolean; run: (v: boolean) => Promise<Res>; label?: string }) {
  const router = useRouter();
  const [val, setVal] = useState(checked);
  const [pending, start] = useTransition();
  return (
    <Switch
      aria-label={label}
      checked={val}
      disabled={!canEdit || pending}
      onCheckedChange={(v) => {
        setVal(v);
        start(async () => {
          const r = await run(v);
          if (!r.ok) {
            setVal(!v);
            toast.error(r.error ?? "Não foi possível salvar.");
          } else router.refresh();
        });
      }}
    />
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={previewSrc(url)} alt="" loading="lazy" className="size-full object-cover" /> : null}
    </div>
  );
}

export type ProjectItem = { id: number; title: string; category: string; location: string; year: string; coverUrl: string | null; published: boolean; featured: boolean; photos: number };

function ProjectRow({ p, canEdit }: { p: ProjectItem; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id, disabled: !canEdit });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex items-center gap-3 rounded-xl border bg-card p-2.5", isDragging && "z-10 shadow-lg")}>
      {canEdit && (
        <button type="button" aria-label="Arrastar para reordenar" className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
      )}
      <Thumb url={p.coverUrl} />
      <Link href={`/site/projetos/${p.id}`} className="grid min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5 truncate text-[14px] font-medium">
          {p.title}
          {p.featured && <Star className="size-3.5 shrink-0 fill-current text-brand" aria-label="Destaque" />}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[p.category, p.location, p.year].filter(Boolean).join(" · ")} · {p.photos} foto{p.photos === 1 ? "" : "s"}
        </span>
      </Link>
      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">{p.published ? "Publicado" : "Rascunho"}</span>
        <PublishSwitch checked={p.published} canEdit={canEdit} run={(v) => toggleProject(p.id, "published", v)} />
      </label>
    </li>
  );
}

export function ProjectList({ items, canEdit }: { items: ProjectItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [prev, setPrev] = useState(items);
  if (items !== prev) {
    setPrev(items);
    setList(items);
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = list.findIndex((x) => x.id === e.active.id);
    const to = list.findIndex((x) => x.id === e.over!.id);
    const next = arrayMove(list, from, to);
    setList(next);
    const r = await reorderProjects(next.map((x) => x.id));
    if (!r.ok) toast.error("Não foi possível salvar a ordem.");
    else {
      toast.success("Ordem atualizada no site.");
      router.refresh();
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={list.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <ul className="grid gap-2">
          {list.map((p) => (
            <ProjectRow key={p.id} p={p} canEdit={canEdit} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export type PostItem = { id: number; title: string; tag: string; coverUrl: string | null; published: boolean; date: string };

export function PostList({ items, canEdit }: { items: PostItem[]; canEdit: boolean }) {
  return (
    <ul className="grid gap-2">
      {items.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
          <Thumb url={p.coverUrl} />
          <Link href={`/site/blog/${p.id}`} className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[14px] font-medium">{p.title}</span>
            <span className="truncate text-xs text-muted-foreground">
              {p.tag} · {p.date}
            </span>
          </Link>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{p.published ? "Publicado" : "Rascunho"}</span>
            <PublishSwitch checked={p.published} canEdit={canEdit} run={(v) => togglePost(p.id, v)} />
          </label>
        </li>
      ))}
    </ul>
  );
}

export type JobItem = { id: number; title: string; area: string; type: string; location: string; published: boolean };

export function JobList({ items, canEdit }: { items: JobItem[]; canEdit: boolean }) {
  return (
    <ul className="grid gap-2">
      {items.map((j) => (
        <li key={j.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <Link href={`/site/vagas/${j.id}`} className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[14px] font-medium">{j.title}</span>
            <span className="truncate text-xs text-muted-foreground">{[j.area, j.type, j.location].filter(Boolean).join(" · ")}</span>
          </Link>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{j.published ? "Publicada" : "Rascunho"}</span>
            <PublishSwitch checked={j.published} canEdit={canEdit} label="Publicada" run={(v) => toggleJob(j.id, v)} />
          </label>
        </li>
      ))}
    </ul>
  );
}
