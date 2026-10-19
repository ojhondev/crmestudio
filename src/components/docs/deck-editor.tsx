"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form";
import { cn } from "@/lib/utils";
import { ScaledSlide } from "./scaled-slide";
import { compressImage } from "@/lib/docs/image";
import { newSlide, slideId } from "@/lib/docs/templates";
import { LAYOUTS, type DeckContent, type Slide, type SlideItem, type SlideLayout } from "@/lib/docs/types";

const ITEM_UI: Partial<Record<SlideLayout, { title: string; text?: string; value?: string; add: string }>> = {
  lista: { title: "Título", text: "Descrição", add: "Adicionar ponto" },
  condicoes: { title: "Condição", text: "Detalhe", add: "Adicionar condição" },
  cronograma: { title: "Etapa", text: "Detalhe (opcional)", value: "Prazo", add: "Adicionar etapa" },
  investimento: { title: "Item", text: "Detalhe (opcional)", value: "Valor", add: "Adicionar item" },
};
const IMAGE_MAX: Partial<Record<SlideLayout, number>> = { capa: 1, imagem: 1, galeria: 4 };

export function DeckEditor({
  value,
  onChange,
  readOnly,
  map,
  studioName,
}: {
  value: DeckContent;
  onChange: (fn: (prev: DeckContent) => DeckContent) => void;
  readOnly?: boolean;
  map: Record<string, string>;
  studioName: string;
}) {
  const [sel, setSel] = useState(0);
  const [adding, setAdding] = useState(false);
  const slides = value.slides;
  const idx = Math.min(sel, Math.max(0, slides.length - 1));
  const cur = slides[idx];
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<Slide>) => onChange((d) => ({ ...d, slides: d.slides.map((s, i) => (i === idx ? { ...s, ...p } : s)) }));
  const setItems = (items: SlideItem[]) => patch({ items });
  const add = (layout: SlideLayout) => {
    onChange((d) => ({ ...d, slides: [...d.slides.slice(0, idx + 1), newSlide(layout), ...d.slides.slice(idx + 1)] }));
    setSel(idx + 1);
    setAdding(false);
  };
  const dup = () => {
    onChange((d) => ({ ...d, slides: [...d.slides.slice(0, idx + 1), { ...structuredClone(d.slides[idx]), id: slideId() }, ...d.slides.slice(idx + 1)] }));
    setSel(idx + 1);
  };
  const del = () => {
    if (slides.length <= 1) return;
    onChange((d) => ({ ...d, slides: d.slides.filter((_, i) => i !== idx) }));
    setSel(Math.max(0, idx - 1));
  };
  const move = (dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= slides.length) return;
    onChange((d) => {
      const s = [...d.slides];
      [s[idx], s[j]] = [s[j], s[idx]];
      return { ...d, slides: s };
    });
    setSel(j);
  };

  const imgMax = IMAGE_MAX[cur?.layout ?? "texto"] ?? 0;
  const images = cur?.images ?? [];
  const upload = async (files: FileList | null) => {
    if (!files?.length || !cur) return;
    try {
      const room = imgMax - images.length;
      const urls = await Promise.all([...files].slice(0, Math.max(0, room)).map((f) => compressImage(f)));
      patch({ images: [...images, ...urls] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível usar a imagem.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!cur) return null;
  const itemUi = ITEM_UI[cur.layout];

  return (
    <div className="grid gap-4 lg:grid-cols-[132px_minmax(0,1fr)_340px]">
      {/* faixa de slides */}
      <div data-tour="deck-strip" className="thin-scroll order-2 flex gap-2 overflow-x-auto pb-1 lg:order-1 lg:max-h-[calc(100dvh-14rem)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSel(i)}
            aria-label={`Slide ${i + 1}: ${s.title || LAYOUTS.find((l) => l.key === s.layout)?.label}`}
            aria-current={i === idx}
            className={cn("relative w-[132px] shrink-0 overflow-hidden rounded-lg border bg-card text-left", i === idx ? "ring-2 ring-brand" : "hover:border-foreground/30")}
          >
            <ScaledSlide slide={s} map={map} index={i} total={slides.length} studioName={studioName} />
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs font-medium text-white">{i + 1}</span>
          </button>
        ))}
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 self-start lg:w-full" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            <Plus /> Slide
          </Button>
        )}
      </div>

      {/* prévia grande + inserir */}
      <div className="order-1 min-w-0 lg:order-2">
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <ScaledSlide slide={cur} map={map} index={idx} total={slides.length} studioName={studioName} />
        </div>
        {adding && !readOnly && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 sm:grid-cols-3">
            {LAYOUTS.map((l) => (
              <button key={l.key} type="button" onClick={() => add(l.key)} className="rounded-lg border px-3 py-2 text-left hover:border-brand hover:bg-brand-soft">
                <span className="block text-[13px] font-medium">{l.label}</span>
                <span className="block text-xs text-muted-foreground">{l.hint}</span>
              </button>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => move(-1)} disabled={idx === 0}>
              <ArrowUp /> Subir
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => move(1)} disabled={idx === slides.length - 1}>
              <ArrowDown /> Descer
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={dup}>
              <Copy /> Duplicar
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={del} disabled={slides.length <= 1}>
              <Trash2 /> Excluir slide
            </Button>
          </div>
        )}
      </div>

      {/* formulário */}
      <div className="order-3 min-w-0 content-start">
        <fieldset disabled={readOnly} className="grid min-w-0 content-start gap-3.5">
          <Field label="Layout">
            <select
              value={cur.layout}
              onChange={(e) => patch({ layout: e.target.value as SlideLayout })}
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[14px]"
            >
              {LAYOUTS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Título">
            <Input value={cur.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          {cur.layout === "capa" && (
            <Field label="Subtítulo">
              <Input value={cur.subtitle ?? ""} onChange={(e) => patch({ subtitle: e.target.value })} />
            </Field>
          )}
          {["texto", "imagem", "encerramento", "lista", "condicoes"].includes(cur.layout) && (
            <Field label={cur.layout === "imagem" ? "Legenda" : "Texto"}>
              <Textarea rows={cur.layout === "texto" ? 6 : 3} value={cur.body ?? ""} onChange={(e) => patch({ body: e.target.value })} />
            </Field>
          )}

          {itemUi && (
            <div className="grid gap-2.5">
              <p className="label">Itens</p>
              {(cur.items ?? []).map((it, i) => (
                <div key={i} className="grid gap-1.5 rounded-lg border bg-card p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Input aria-label={itemUi.title} placeholder={itemUi.title} value={it.title} onChange={(e) => setItems((cur.items ?? []).map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover item" onClick={() => setItems((cur.items ?? []).filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  </div>
                  {itemUi.value && <Input aria-label={itemUi.value} placeholder={itemUi.value} value={it.value ?? ""} onChange={(e) => setItems((cur.items ?? []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
                  {itemUi.text && <Input aria-label={itemUi.text} placeholder={itemUi.text} value={it.text ?? ""} onChange={(e) => setItems((cur.items ?? []).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />}
                </div>
              ))}
              {(cur.items?.length ?? 0) < 6 && (
                <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setItems([...(cur.items ?? []), { title: "" }])}>
                  <Plus /> {itemUi.add}
                </Button>
              )}
            </div>
          )}

          {cur.layout === "investimento" && (
            <Field label="Total" hint="Aceita variáveis, como {{negocio.valor}}.">
              <Input value={cur.total ?? ""} onChange={(e) => patch({ total: e.target.value })} />
            </Field>
          )}

          {imgMax > 0 && (
            <div className="grid gap-2">
              <p className="label">{imgMax === 1 ? "Imagem" : `Imagens (até ${imgMax})`}</p>
              {images.map((u, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border bg-card p-1.5">
                  <span className="size-10 shrink-0 rounded bg-muted bg-cover bg-center" style={{ backgroundImage: `url("${u.replace(/["\\]/g, "")}")` }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{u.startsWith("data:") ? "Imagem enviada" : u}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover imagem" onClick={() => patch({ images: images.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
              {images.length < imgMax && (
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" multiple={imgMax > 1} hidden onChange={(e) => upload(e.target.files)} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <ImagePlus /> Enviar imagem
                  </Button>
                  <form
                    className="flex min-w-0 flex-1 gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.elements.namedItem("url") as HTMLInputElement;
                      const v = input.value.trim();
                      if (!/^https:\/\//i.test(v)) return toast.error("Cole um endereço que comece com https://");
                      patch({ images: [...images, v] });
                      input.value = "";
                    }}
                  >
                    <Input name="url" placeholder="ou cole o endereço (https://…)" className="min-w-0" />
                    <Button type="submit" variant="secondary" size="sm">
                      Usar
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Dica: escreva <code className="rounded bg-muted px-1">{"{{cliente.nome}}"}</code>, <code className="rounded bg-muted px-1">{"{{negocio.valor}}"}</code> ou <code className="rounded bg-muted px-1">{"{{estudio.email}}"}</code> em qualquer texto — o sistema preenche com os dados do negócio.
          </p>
        </fieldset>
      </div>
    </div>
  );
}
