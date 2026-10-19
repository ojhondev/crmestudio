"use client";

import { useState } from "react";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibraryDialog, previewSrc } from "./image-field";

function Tile({ url, index, onRemove, onCover }: { url: string; index: number; onRemove: () => void; onCover: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewSrc(url)} alt={`Imagem ${index + 1}`} className="size-full object-cover" draggable={false} />
      <button type="button" aria-label="Arrastar para ordenar" className="absolute left-1 top-1 grid size-8 cursor-grab touch-none place-items-center rounded-md bg-black/60 text-white active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">{index + 1}</span>
      <div className="absolute right-1 top-1 flex gap-1">
        <button type="button" aria-label="Usar como capa" title="Usar como capa" onClick={onCover} className="grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80">
          <Star className="size-4" />
        </button>
        <button type="button" aria-label="Remover da galeria" onClick={onRemove} className="grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-destructive">
          <X className="size-4" />
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
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
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
                <Tile key={u} url={u} index={i} onRemove={() => onChange(value.filter((x) => x !== u))} onCover={() => onCover(u)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <LibraryDialog open={open} onOpenChange={setOpen} multiple onPick={(urls) => onChange([...value, ...urls.filter((u) => !value.includes(u))])} />
    </div>
  );
}
