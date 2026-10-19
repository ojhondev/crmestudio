import { ClipboardList, File, FileText, Film, Folder, Image as ImageIcon, Presentation, Table2 } from "lucide-react";
import type { DriveKind } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const MAP: Record<DriveKind, { icon: React.ElementType; cls: string }> = {
  pasta: { icon: Folder, cls: "text-amber-600 dark:text-amber-400" },
  documento: { icon: FileText, cls: "text-blue-600 dark:text-blue-400" },
  planilha: { icon: Table2, cls: "text-emerald-600 dark:text-emerald-400" },
  apresentacao: { icon: Presentation, cls: "text-orange-600 dark:text-orange-400" },
  pdf: { icon: FileText, cls: "text-red-600 dark:text-red-400" },
  imagem: { icon: ImageIcon, cls: "text-violet-600 dark:text-violet-400" },
  video: { icon: Film, cls: "text-pink-600 dark:text-pink-400" },
  formulario: { icon: ClipboardList, cls: "text-teal-600 dark:text-teal-400" },
  outro: { icon: File, cls: "text-muted-foreground" },
};

export function KindIcon({ kind, className }: { kind: DriveKind; className?: string }) {
  const { icon: Icon, cls } = MAP[kind] ?? MAP.outro;
  return <Icon className={cn("size-5 shrink-0", cls, className)} aria-hidden />;
}
