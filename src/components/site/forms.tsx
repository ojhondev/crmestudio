"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/form";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { ImageField } from "./image-field";
import { GalleryEditor } from "./gallery-editor";
import { ParagraphEditor } from "./paragraph-editor";
import { deleteJob, deletePost, deleteProject, saveJob, savePost, saveProject, type JobInput, type PostInput, type ProjectInput } from "@/app/(app)/site/actions";

// celular: campos de 44px (o Input já usa 16px de fonte)
const card = "grid gap-4 rounded-xl border bg-card p-4 sm:p-5 max-md:[&_input:not([type=checkbox])]:h-11";

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 text-[13px] max-md:min-h-11">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="grid leading-tight">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Footer({
  backHref,
  pending,
  canEdit,
  canDelete,
  onDelete,
  viewUrl,
  isNew,
}: {
  backHref: string;
  pending: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onDelete?: () => Promise<unknown>;
  viewUrl?: string;
  isNew: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center gap-2 border-t bg-background/95 px-3 py-3 backdrop-blur max-md:bottom-[calc(4.25rem+env(safe-area-inset-bottom))] sm:-mx-5 sm:px-5">
      {canEdit && (
        <Button type="submit" disabled={pending} className="max-md:h-11">
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
        </Button>
      )}
      <Button asChild variant="ghost" className="max-md:h-11">
        <Link href={backHref}>Voltar</Link>
      </Button>
      {viewUrl && (
        <Button asChild variant="outline" size="sm" className="max-md:h-11">
          <a href={viewUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Ver no site
          </a>
        </Button>
      )}
      {!isNew && canDelete && onDelete && (
        <span className="ml-auto max-md:[&_button]:h-11 max-md:[&_button]:min-w-11">
          <ConfirmButton action={onDelete} title="Excluir definitivamente?" description="O item sai do site e não dá para desfazer." />
        </span>
      )}
    </div>
  );
}

function useSave<T extends { id?: number }>(save: (v: T) => Promise<{ ok: true; id: number } | { ok: false; error: string }>, backHref: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    submit: (v: T, stay?: boolean) =>
      start(async () => {
        const r = await save(v);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Salvo. O site já foi atualizado.");
        if (stay) router.refresh();
        else router.push(backHref);
        router.refresh();
      }),
  };
}

/* --------------------------------- projeto ---------------------------------- */

export const PROJECT_CATEGORIES = ["Restauro", "Conservação", "Projeto", "Reabilitação", "Laudo", "Bens integrados"];

export function ProjectForm({ initial, canEdit, canDelete, viewUrl }: { initial: ProjectInput; canEdit: boolean; canDelete: boolean; viewUrl?: string }) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof ProjectInput>(k: K, val: ProjectInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const { pending, submit } = useSave(saveProject, "/site/projetos");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(v);
      }}
      className="mx-auto grid max-w-4xl gap-4 p-3 sm:p-5"
    >
      <fieldset disabled={!canEdit} className="grid gap-4">
        <section className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" className="sm:col-span-2">
              <Input value={v.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} />
            </Field>
            <Field label="Categoria">
              <Input value={v.category} onChange={(e) => set("category", e.target.value)} list="proj-cats" />
              <datalist id="proj-cats">
                {PROJECT_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Localização">
              <Input value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="Itu · SP" />
            </Field>
            <Field label="Ano">
              <Input value={v.year} onChange={(e) => set("year", e.target.value)} placeholder="2025" />
            </Field>
            <Field label="Área">
              <Input value={v.area} onChange={(e) => set("area", e.target.value)} placeholder="1.200 m²" />
            </Field>
            <Field label="Resumo" className="sm:col-span-2" hint="Aparece nos cartões da home e na lista de projetos.">
              <Textarea rows={2} value={v.summary} onChange={(e) => set("summary", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className={card}>
          <h2 className="label">Texto do projeto</h2>
          <ParagraphEditor value={v.body} onChange={(t) => set("body", t)} placeholder="Descreva o projeto, um parágrafo por bloco…" />
        </section>

        <section className={card}>
          <ImageField label="Capa" value={v.coverUrl} onChange={(u) => set("coverUrl", u)} />
          <GalleryEditor value={v.gallery} onChange={(g) => set("gallery", g)} onCover={(u) => set("coverUrl", u)} />
        </section>

        <section className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Publicado" hint="Desligado = rascunho, não aparece no site." checked={v.published} onChange={(x) => set("published", x)} />
            <Toggle label="Destaque" hint="Projetos em destaque aparecem primeiro na home." checked={v.featured} onChange={(x) => set("featured", x)} />
            <Field label="Ordem" hint="Menor número aparece antes. Dá para reordenar também pela lista.">
              <Input type="number" value={v.sort} onChange={(e) => set("sort", Number(e.target.value) || 0)} className="max-w-32" />
            </Field>
            <Field label="Endereço (slug)" hint="Deixe vazio para gerar a partir do título.">
              <Input value={v.slug} onChange={(e) => set("slug", e.target.value)} />
            </Field>
          </div>
        </section>
      </fieldset>
      <Footer
        backHref="/site/projetos"
        pending={pending}
        canEdit={canEdit}
        canDelete={canDelete}
        isNew={!initial.id}
        viewUrl={viewUrl}
        onDelete={async () => {
          const r = await deleteProject(initial.id!);
          if (r.ok) {
            toast.success("Projeto excluído.");
            router.push("/site/projetos");
            router.refresh();
          } else toast.error(r.error);
        }}
      />
    </form>
  );
}

/* ----------------------------------- post ----------------------------------- */

export function PostForm({ initial, canEdit, canDelete, viewUrl }: { initial: PostInput; canEdit: boolean; canDelete: boolean; viewUrl?: string }) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof PostInput>(k: K, val: PostInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const { pending, submit } = useSave(savePost, "/site/blog");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(v);
      }}
      className="mx-auto grid max-w-4xl gap-4 p-3 sm:p-5"
    >
      <fieldset disabled={!canEdit} className="grid gap-4">
        <section className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" className="sm:col-span-2">
              <Input value={v.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} />
            </Field>
            <Field label="Categoria / tag">
              <Input value={v.tag} onChange={(e) => set("tag", e.target.value)} list="post-tags" />
              <datalist id="post-tags">
                {["Editorial", "Método", "Notícia", "Obra"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Data de publicação">
              <Input type="date" value={v.publishedAt} onChange={(e) => set("publishedAt", e.target.value)} className="max-w-48" />
            </Field>
            <Field label="Resumo" className="sm:col-span-2" hint="Aparece na lista do blog e no topo do artigo.">
              <Textarea rows={2} value={v.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className={card}>
          <h2 className="label">Texto</h2>
          <ParagraphEditor value={v.body} onChange={(t) => set("body", t)} placeholder="Escreva o artigo, um parágrafo por bloco…" minHeight={360} />
        </section>

        <section className={card}>
          <ImageField label="Imagem de capa" value={v.coverUrl} onChange={(u) => set("coverUrl", u)} />
        </section>

        <section className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Publicado" hint="Desligado = rascunho, não aparece no site." checked={v.published} onChange={(x) => set("published", x)} />
            <Field label="Endereço (slug)" hint="Deixe vazio para gerar a partir do título.">
              <Input value={v.slug} onChange={(e) => set("slug", e.target.value)} />
            </Field>
          </div>
        </section>
      </fieldset>
      <Footer
        backHref="/site/blog"
        pending={pending}
        canEdit={canEdit}
        canDelete={canDelete}
        isNew={!initial.id}
        viewUrl={viewUrl}
        onDelete={async () => {
          const r = await deletePost(initial.id!);
          if (r.ok) {
            toast.success("Artigo excluído.");
            router.push("/site/blog");
            router.refresh();
          } else toast.error(r.error);
        }}
      />
    </form>
  );
}

/* ----------------------------------- vaga ----------------------------------- */

export function JobForm({ initial, canEdit, canDelete, viewUrl }: { initial: JobInput; canEdit: boolean; canDelete: boolean; viewUrl?: string }) {
  const [v, setV] = useState(initial);
  const [reqText, setReqText] = useState(initial.requirements.join("\n"));
  const set = <K extends keyof JobInput>(k: K, val: JobInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const { pending, submit } = useSave(saveJob, "/site/vagas");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ ...v, requirements: reqText.split(/\n+/).map((s) => s.trim()).filter(Boolean) });
      }}
      className="mx-auto grid max-w-4xl gap-4 p-3 sm:p-5"
    >
      <fieldset disabled={!canEdit} className="grid gap-4">
        <section className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título da vaga" className="sm:col-span-2">
              <Input value={v.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} />
            </Field>
            <Field label="Área">
              <Input value={v.area} onChange={(e) => set("area", e.target.value)} placeholder="Projetos, Conservação…" />
            </Field>
            <Field label="Tipo">
              <Input value={v.type} onChange={(e) => set("type", e.target.value)} list="job-types" />
              <datalist id="job-types">
                {["Efetivo", "Estágio", "Temporário", "Freelancer"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Local" className="sm:col-span-2">
              <Input value={v.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
          </div>
        </section>
        <section className={card}>
          <h2 className="label">Descrição</h2>
          <ParagraphEditor value={v.body} onChange={(t) => set("body", t)} placeholder="Descreva a vaga, um parágrafo por bloco…" minHeight={200} />
        </section>
        <section className={card}>
          <Field label="Requisitos" hint="Um requisito por linha.">
            <Textarea rows={6} value={reqText} onChange={(e) => setReqText(e.target.value)} />
          </Field>
        </section>
        <section className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Publicada" hint="Desligada = não aparece no site." checked={v.published} onChange={(x) => set("published", x)} />
            <Field label="Ordem">
              <Input type="number" value={v.sort} onChange={(e) => set("sort", Number(e.target.value) || 0)} className="max-w-32" />
            </Field>
            <Field label="Endereço (slug)" hint="Deixe vazio para gerar a partir do título.">
              <Input value={v.slug} onChange={(e) => set("slug", e.target.value)} />
            </Field>
          </div>
        </section>
      </fieldset>
      <Footer
        backHref="/site/vagas"
        pending={pending}
        canEdit={canEdit}
        canDelete={canDelete}
        isNew={!initial.id}
        viewUrl={viewUrl}
        onDelete={async () => {
          const r = await deleteJob(initial.id!);
          if (r.ok) {
            toast.success("Vaga excluída.");
            router.push("/site/vagas");
            router.refresh();
          } else toast.error(r.error);
        }}
      />
    </form>
  );
}
