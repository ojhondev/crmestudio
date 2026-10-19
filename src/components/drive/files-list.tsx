"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteItem } from "@/app/(app)/drive/actions";
import type { DriveKind } from "@/lib/db/schema";
import { KindIcon } from "./kind-icon";
import { ItemDialog } from "./item-dialog";

type Row = { id: string; kind: DriveKind; title: string; url: string; tags: string[] };

export function FilesList({ items, dealId, contactId, canEdit, canManage }: { items: Row[]; dealId: string | null; contactId: string | null; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{canEdit ? "Nenhum arquivo ainda. Cole o link da pasta do Drive do cliente." : "Nenhum arquivo vinculado."}</p>
      ) : (
        <ul className="grid gap-1">
          {items.map((i) => (
            <li key={i.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60">
              <KindIcon kind={i.kind} className="size-4" />
              <a href={i.url} target="_blank" rel="noreferrer" className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-[13px]">{i.title}</span>
                {i.kind === "pasta" && <span className="text-xs text-muted-foreground">Pasta do Drive</span>}
              </a>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {canManage && (
                <button
                  type="button"
                  aria-label={`Remover ${i.title}`}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  onClick={async () => {
                    if (!confirm(`Remover “${i.title}” do CRM? O arquivo continua no Drive.`)) return;
                    const r = await deleteItem(i.id);
                    if (r.ok) router.refresh();
                    else toast.error(r.error);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus /> Adicionar link
          </Button>
        )}
        <Link href="/drive" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          Abrir Drive
        </Link>
      </div>
      <ItemDialog open={open} onOpenChange={setOpen} fixedLinks defaults={{ dealId, contactId }} />
    </div>
  );
}
