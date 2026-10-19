"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form";
import { ImageField, previewSrc } from "./image-field";
import { saveSetting } from "@/app/(app)/site/actions";
import type { FieldDef } from "@/lib/site";

function useSetting(key: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    save: (values: Record<string, string>) =>
      start(async () => {
        const r = await saveSetting(key, values);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Salvo. O site já foi atualizado.");
        router.refresh();
      }),
  };
}

/** Um bloco de textos/mídia do site (abertura, manifesto, faixa de vídeo…). */
export function SettingGroupForm({ k, title, desc, fields, initial, canEdit }: { k: string; title: string; desc: string; fields: FieldDef[]; initial: Record<string, string>; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const { pending, save } = useSetting(k);
  const video = k === "home.mediaBand" ? v.videoUrl : "";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(v);
      }}
      className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5 max-md:[&_input:not([type=checkbox])]:h-11"
    >
      <header>
        <h2 className="text-[15px] font-medium">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{desc}</p>
      </header>
      <fieldset disabled={!canEdit} className="grid gap-4">
        {fields.map((f) =>
          f.type === "image" ? (
            <ImageField key={f.name} label={f.label} value={v[f.name] ?? ""} onChange={(u) => setV((s) => ({ ...s, [f.name]: u }))} hint={f.hint} />
          ) : (
            <Field key={f.name} label={f.label} hint={f.hint}>
              {f.type === "area" ? (
                <Textarea rows={3} value={v[f.name] ?? ""} onChange={(e) => setV((s) => ({ ...s, [f.name]: e.target.value }))} />
              ) : (
                <Input value={v[f.name] ?? ""} onChange={(e) => setV((s) => ({ ...s, [f.name]: e.target.value }))} />
              )}
            </Field>
          ),
        )}
        {video && (
          <video src={previewSrc(video)} poster={v.posterUrl ? previewSrc(v.posterUrl) : undefined} controls muted preload="none" className="aspect-video w-full max-w-md rounded-lg border bg-black" />
        )}
      </fieldset>
      {canEdit && (
        <div>
          <Button type="submit" disabled={pending} className="max-md:h-11">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        </div>
      )}
    </form>
  );
}

/** Imagens das seções do site (um campo por slot). */
export function SectionImagesForm({ slots, initial, canEdit }: { slots: { key: string; group: string; label: string }[]; initial: Record<string, string>; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const { pending, save } = useSetting("sections");
  const groups = [...new Set(slots.map((s) => s.group))];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(Object.fromEntries(Object.entries(v).filter(([, u]) => u)));
      }}
      className="grid gap-4"
    >
      <fieldset disabled={!canEdit} className="grid gap-4">
        {groups.map((g) => (
          <section key={g} className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-[15px] font-medium">{g}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {slots
                .filter((s) => s.group === g)
                .map((s) => (
                  <ImageField key={s.key} label={s.label} value={v[s.key] ?? ""} onChange={(u) => setV((x) => ({ ...x, [s.key]: u }))} hint={v[s.key] ? undefined : "Vazio: o site usa a foto padrão."} />
                ))}
            </div>
          </section>
        ))}
      </fieldset>
      {canEdit && (
        <div className="sticky bottom-0 -mx-3 border-t bg-background/95 px-3 py-3 backdrop-blur max-md:bottom-[calc(4.25rem+env(safe-area-inset-bottom))] sm:-mx-5 sm:px-5">
          <Button type="submit" disabled={pending} className="max-md:h-11">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar imagens
          </Button>
        </div>
      )}
    </form>
  );
}
