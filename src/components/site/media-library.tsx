"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { uploadSiteImage } from "./image-field";
import { deleteMedia, renameMedia } from "@/app/(app)/site/actions";

export type MediaItem = { id: number; url: string; label: string; date: string };

export function MediaLibrary({ items, canEdit, canManage }: { items: MediaItem[]; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadSiteImage(f);
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "falha no envio"}`);
      }
    }
    setBusy(false);
    if (ref.current) ref.current.value = "";
    if (ok) {
      toast.success(`${ok} imagem${ok > 1 ? "ns" : ""} enviada${ok > 1 ? "s" : ""}.`);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <Button onClick={() => ref.current?.click()} disabled={busy} className="max-md:h-11">
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Enviar imagens
          </Button>
          <span className="text-xs text-muted-foreground">Comprimidas automaticamente (lado maior 2000 px).</span>
        </div>
      )}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-[13px] text-muted-foreground">
          A biblioteca está vazia. As fotos padrão do site não aparecem aqui — só as enviadas por este painel.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((m) => (
            <li key={m.id} className="grid overflow-hidden rounded-xl border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.label} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
              <div className="grid gap-1.5 p-2">
                <Input
                  defaultValue={m.label}
                  disabled={!canEdit}
                  aria-label="Nome da imagem"
                  className="h-8 text-xs max-md:h-11 max-md:text-base"
                  onBlur={(e) => {
                    if (e.target.value !== m.label) renameMedia(m.id, e.target.value);
                  }}
                />
                <div className="flex items-center gap-1 max-md:[&_button]:min-h-11">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={async () => {
                      await navigator.clipboard.writeText(m.url);
                      setCopied(m.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === m.id ? <Check /> : <Copy />} Copiar link
                  </Button>
                  <span className="ml-auto" />
                  {canManage && (
                    <ConfirmButton
                      size="icon-sm"
                      label="Excluir imagem"
                      title="Excluir esta imagem?"
                      description="Se ela estiver em algum projeto, artigo ou seção, o site mostrará um espaço vazio."
                      action={async () => {
                        const r = await deleteMedia(m.id);
                        if (!r.ok) toast.error(r.error);
                        else router.refresh();
                      }}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
