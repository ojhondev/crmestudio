"use client";

import { useState } from "react";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibraryDialog, previewSrc } from "./image-field";

function Tile({ url, index, total, onRemove, onCover, onMove }: { url: string; index: number; total: number; onRemove: () => void; onCover: () => void; onMove: (dir: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className="group relative overflow-hidden rounded-lg border bg-muted"
    >
      <div className="relative aspect-[4/3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewSrc(url)} alt={`Imagem ${index + 1}`} className="size-full object-cover" draggable={false} />
        <button type="button" aria-label="Arrastar para ordenar" className="absolute left-1 top-1 grid size-8 cursor-grab touch-none place-items-center rounded-md bg-black/60 text-white active:cursor-grabbing max-md:hidden" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">{index + 1}</span>
        <div className="absolute right-1 top-1 flex gap-1">
          <button type="button" aria-label="Usar como capa" title="Usar como capa" onClick={onCover} className="grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80 max-md:size-11">
            <Star className="size-4" />
          </button>
          <button type="button" aria-label="Remover da galeria" onClick={onRemove} className="grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-destructive max-md:size-11">
            <X className="size-4" />
          </button>
        </div>
      </div>
      {/* toque: ordenar por botões (arrastar fica para o mouse) */}
      <div className="grid grid-cols-2 border-t bg-card md:hidden">
        <button type="button" aria-label={`Mover imagem ${index + 1} para antes`} disabled={index === 0} onClick={() => onMove(-1)} className="grid h-11 place-items-center border-r text-muted-foreground disabled:opacity-30 active:bg-muted">
          <ArrowUp className="size-5" />
        </button>
        <button type="button" aria-label={`Mover imagem ${index + 1} para depois`} disabled={index === total - 1} onClick={() => onMove(1)} className="grid h-11 place-items-center text-muted-foreground disabled:opacity-30 active:bg-muted">
          <ArrowDown className="size-5" />
        </button>
      </div>
    </li>
  );
}

/** Galeria ordenável: arraste pela alça para mudar a ordem. */
export function GalleryEditor({ value, onChange, onCover }: { value: string[]; onChange: (v: string[]) => void; onCover: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = value.indexOf(String(e.active.id));
    const to = value.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onChange(arrayMove(value, from, to));
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium">Galeria ({value.length})</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto max-md:h-11" onClick={() => setOpen(true)}>
          <ImagePlus /> Adicionar imagens
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">Sem imagens na galeria. Quando vazia, o site mostra imagens padrão.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={value} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {value.map((u, i) => (
                <Tile key={u} url={u} index={i} total={value.length} onRemove={() => onChange(value.filter((x) => x !== u))} onCover={() => onCover(u)} onMove={(d) => onChange(arrayMove(value, i, i + d))} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <LibraryDialog open={open} onOpenChange={setOpen} multiple onPick={(urls) => onChange([...value, ...urls.filter((u) => !value.includes(u))])} />
    </div>
  );
}
