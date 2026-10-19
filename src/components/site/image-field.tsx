"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Images, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listLibrary } from "@/app/(app)/site/actions";
import { cn } from "@/lib/utils";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://estudiorestaura.com.br";
/** Imagens padrão do site são relativas ("/fotos/05.jpg"): na prévia do CRM apontam para o site. */
export const previewSrc = (u: string) => (u.startsWith("/") ? `${SITE_URL}${u}` : u);

/** Reduz a imagem no navegador (lado maior 2000 px) antes de enviar. PNG vira WebP para manter transparência. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  const alpha = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
  if (!alpha) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const type = alpha ? "image/webp" : "image/jpeg";
  for (const q of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
    if (blob && blob.size <= 3.8 * 1024 * 1024) return blob;
  }
  throw new Error("A imagem continua grande demais depois de comprimir.");
}

export async function uploadSiteImage(file: File): Promise<{ url: string; id: number }> {
  const blob = await compressImage(file);
  const res = await fetch(`/api/site/upload?name=${encodeURIComponent(file.name)}`, { method: "POST", body: blob, headers: { "content-type": blob.type } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error(json.error || "Falha no envio.");
  return json;
}

type Media = { id: number; url: string; label: string };

/** Escolhe uma imagem da biblioteca do site ou envia uma nova. */
export function LibraryDialog({ open, onOpenChange, onPick, multiple }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (urls: string[]) => void; multiple?: boolean }) {
  const [items, setItems] = useState<Media[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => start(async () => setItems(await listLibrary()));

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const r = await uploadSiteImage(f);
        added.push(r.url);
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "falha no envio"}`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (added.length) {
      if (multiple) setSel((s) => [...s, ...added]);
      else {
        onPick(added.slice(0, 1));
        onOpenChange(false);
        return;
      }
      load();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setSel([]);
          load();
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-normal">Biblioteca de imagens do site</DialogTitle>
          <DialogDescription>Escolha uma imagem já enviada ou envie novas (são comprimidas automaticamente).</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => onFiles(e.target.files)} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Enviar {multiple ? "imagens" : "imagem"}
          </Button>
          {multiple && (
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              disabled={!sel.length}
              onClick={() => {
                onPick(sel);
                onOpenChange(false);
              }}
            >
              Adicionar {sel.length || ""} selecionada{sel.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
        {loading && !items ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : !items?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma imagem enviada ainda.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {items.map((m) => {
              const on = sel.includes(m.url);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!multiple) {
                        onPick([m.url]);
                        onOpenChange(false);
                      } else setSel((s) => (on ? s.filter((u) => u !== m.url) : [...s, m.url]));
                    }}
                    className={cn("group relative block aspect-square w-full overflow-hidden rounded-lg border bg-muted", on && "ring-2 ring-brand")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.label} loading="lazy" className="size-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-xs text-white">{m.label || "imagem"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Campo de imagem: prévia, enviar/trocar, biblioteca e remover. */
export function ImageField({ label, value, onChange, hint }: { label: string; value: string; onChange: (url: string) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc(value)} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Images /> {value ? "Trocar" : "Escolher / enviar"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => onChange("")}>
              <Trash2 /> Remover
            </Button>
          )}
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <LibraryDialog open={open} onOpenChange={setOpen} onPick={(u) => onChange(u[0] ?? "")} />
    </div>
  );
}
