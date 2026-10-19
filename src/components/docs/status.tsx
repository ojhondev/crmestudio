import { Check, CircleDashed, Send, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocStatus } from "@/lib/db/schema";

const MAP: Record<DocStatus, { label: string; cls: string; icon: React.ElementType }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground", icon: CircleDashed },
  enviado: { label: "Enviado", cls: "bg-[color-mix(in_oklch,var(--fin-in)_14%,transparent)] text-[var(--fin-in)]", icon: Send },
  aceito: { label: "Aceito", cls: "bg-success/15 text-success", icon: Check },
  cancelado: { label: "Cancelado", cls: "bg-destructive/10 text-destructive", icon: Ban },
};

/** Estado do documento: ícone + texto (nunca só cor). */
export function DocStatusBadge({ status, className }: { status: DocStatus; className?: string }) {
  const s = MAP[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.cls, className)}>
      <Icon className="size-3" /> {s.label}
    </span>
  );
}
