"use client";

/** Botões de fechar com alvo de toque de 44px (a versão padrão dos diálogos/gavetas tem ~40px). */
import { XIcon } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const cls = "absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-11 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none";

export function DialogCloseBtn({ className }: { className?: string }) {
  return (
    <DialogClose className={cn(cls, className)} aria-label="Fechar">
      <XIcon className="size-5" />
    </DialogClose>
  );
}

export function SheetCloseBtn({ className }: { className?: string }) {
  return (
    <SheetClose className={cn(cls, className)} aria-label="Fechar">
      <XIcon className="size-5" />
    </SheetClose>
  );
}
