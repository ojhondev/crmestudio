"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, SimpleSelect } from "@/components/form";
import { addLink, updateItem } from "@/app/(app)/drive/actions";
import { KINDS, KIND_LABEL, detectDriveUrl } from "@/lib/drive/detect";
import type { DriveKind } from "@/lib/db/schema";

export type ItemRow = {
  id: string;
  kind: DriveKind;
  title: string;
  url: string;
  folderId: string | null;
  contactId: string | null;
  contactName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  project: string | null;
  tags: string[];
  notes: string | null;
  favorite: boolean;
  updatedAt: string;
  provider: string;
};
export type FolderRow = { id: string; name: string; parentId: string | null };
type Opt = { value: string; label: string };

export type ItemDialogProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** edição quando informado; criação caso contrário */
  item?: ItemRow | null;
  defaults?: { folderId?: string | null; contactId?: string | null; dealId?: string | null };
  /** esconde os vínculos (usado no bloco "Arquivos" de negócio/contato) */
  fixedLinks?: boolean;
  folders?: FolderRow[];
  contacts?: Opt[];
  deals?: Opt[];
  projects?: string[];
};

/** Caminho completo da pasta ("Clientes / Itu / Matriz") para os seletores. */
export function folderOptions(folders: FolderRow[]): Opt[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (f: FolderRow, depth = 0): string => (f.parentId && byId.has(f.parentId) && depth < 10 ? `${path(byId.get(f.parentId)!, depth + 1)} / ${f.name}` : f.name);
  return folders.map((f) => ({ value: f.id, label: path(f) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function ItemDialog({ open, onOpenChange, item, defaults, fixedLinks, folders = [], contacts = [], deals = [], projects = [] }: ItemDialogProps) {
  // o estado reinicia sempre que o diálogo abre (a chave muda), então o formulário nasce com os valores certos
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">{open && <Form key={item?.id ?? "novo"} {...{ onOpenChange, item, defaults, fixedLinks, folders, contacts, deals, projects }} />}</DialogContent>
    </Dialog>
  );
}

function Form({ onOpenChange, item, defaults, fixedLinks, folders = [], contacts = [], deals = [], projects = [] }: Omit<ItemDialogProps, "open">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(item?.url ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<DriveKind | "">(item?.kind ?? "");
  const [folderId, setFolderId] = useState(item ? item.folderId : (defaults?.folderId ?? null));
  const [contactId, setContactId] = useState(item ? item.contactId : (defaults?.contactId ?? null));
  const [dealId, setDealId] = useState(item ? item.dealId : (defaults?.dealId ?? null));
  const [project, setProject] = useState(item?.project ?? "");
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(item?.notes ?? "");

  const det = url.trim() ? detectDriveUrl(url) : null;
  const effectiveKind: DriveKind | null = kind || (det && det.ok ? det.kind : null);
  const none = (v: string) => (v === "__none" ? null : v);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const payload = { url, title, kind, folderId, contactId, dealId, project, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), notes };
      const r = item ? await updateItem(item.id, payload) : await addLink(payload);
      if (!r.ok) return void toast.error(r.error);
      toast.success(item ? "Item atualizado." : "Link registrado.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="font-normal">{item ? "Editar item" : "Adicionar link do Drive"}</DialogTitle>
        <DialogDescription>Cole o link de uma pasta ou arquivo do Google Drive (compartilhe com a equipe lá no Drive).</DialogDescription>
      </DialogHeader>
      <Field label="Link do Drive" hint={det ? (det.ok ? `Detectado: ${KIND_LABEL[det.kind]}` : det.error) : undefined}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" required inputMode="url" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Fotos do levantamento" maxLength={200} />
        </Field>
        <Field label="Tipo">
          <SimpleSelect value={kind || "__auto"} onValueChange={(v) => setKind(v === "__auto" ? "" : (v as DriveKind))} options={[{ value: "__auto", label: effectiveKind ? `Auto (${KIND_LABEL[effectiveKind]})` : "Automático" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
        </Field>
      </div>
      {!fixedLinks && (
        <>
          <Field label="Pasta no CRM">
            <SimpleSelect allowNone noneLabel="Raiz (sem pasta)" value={folderId ?? "__none"} onValueChange={(v) => setFolderId(none(v))} options={folderOptions(folders)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente">
              <SimpleSelect allowNone noneLabel="Sem vínculo" value={contactId ?? "__none"} onValueChange={(v) => setContactId(none(v))} options={contacts} />
            </Field>
            <Field label="Negócio">
              <SimpleSelect allowNone noneLabel="Sem vínculo" value={dealId ?? "__none"} onValueChange={(v) => setDealId(none(v))} options={deals} />
            </Field>
          </div>
          <Field label="Projeto / obra">
            <Input value={project} onChange={(e) => setProject(e.target.value)} list="drive-projects" placeholder="Ex.: Casa Lâmego" maxLength={160} />
            <datalist id="drive-projects">
              {projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
        </>
      )}
      <Field label="Etiquetas" hint="Separe por vírgula. Ex.: laudo, fotos, contrato">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      {!fixedLinks && (
        <Field label="Observações">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} {item ? "Salvar" : "Adicionar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
