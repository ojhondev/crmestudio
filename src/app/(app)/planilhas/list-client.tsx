"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, FileSpreadsheet, Link2, Loader2, MoreVertical, Pencil, Plus, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, SimpleSelect } from "@/components/form";
import { TEMPLATES } from "@/lib/sheets/templates";
import { cn } from "@/lib/utils";
import { createSheet, deleteSheet, duplicateSheet, linkSheet, renameSheet, toggleFavorite } from "./actions";

type Opt = { value: string; label: string };

/* ------------------------------- nova planilha ------------------------------- */

export function NewSheetButton({ deals }: { deals: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState("branca");
  const [name, setName] = useState("");
  const [dealId, setDealId] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await createSheet({ template: tpl, name, dealId: dealId || null });
      if (r && "error" in r && r.error) toast.error(r.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-tour="sheets-new">
          <Plus /> Nova planilha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova planilha</DialogTitle>
          <DialogDescription>Comece em branco ou de um modelo pronto. Tudo pode ser editado depois.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modelo">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={tpl === t.key}
                onClick={() => setTpl(t.key)}
                className={cn("rounded-lg border p-3 text-left transition-colors max-md:min-h-14", tpl === t.key ? "border-foreground bg-muted" : "hover:border-foreground/40")}
              >
                <span className="block text-[13.5px] font-medium">{t.label}</span>
                <span className="block text-[12px] text-muted-foreground">{t.description}</span>
              </button>
            ))}
          </div>
          <Field label="Nome (opcional)" htmlFor="sheet-name">
            <Input id="sheet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Materiais — Matriz de Itu" />
          </Field>
          {deals.length > 0 && (
            <Field label="Vincular a um negócio (opcional)">
              <SimpleSelect value={dealId} onValueChange={setDealId} options={[{ value: "", label: "Sem vínculo" }, ...deals]} />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Criar planilha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- importar ------------------------------- */

type Preview = {
  name: string;
  warnings: string[];
  tabs: { name: string; rows: number; cols: number; cells: number; formulas: number; merges: number; sample: string[][] }[];
};

const ACCEPT = ".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt";
const MAX_MB = 15;

export function ImportButton({ deals }: { deals: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [dealId, setDealId] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "commit">("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const send = useCallback(async (f: File, mode: "preview" | "commit", extra?: { name?: string; dealId?: string }) => {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("mode", mode);
    if (extra?.name) fd.set("name", extra.name);
    if (extra?.dealId) fd.set("dealId", extra.dealId);
    const res = await fetch("/planilhas/importar", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? (res.status === 413 ? "O arquivo é grande demais para enviar." : "Não consegui importar o arquivo."));
    return data as { preview?: Preview; id?: string; warnings?: string[] };
  }, []);

  const pick = useCallback(
    async (f: File) => {
      setError("");
      setPreview(null);
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`O arquivo passa de ${MAX_MB} MB.`);
        setFile(f);
        setOpen(true);
        return;
      }
      setFile(f);
      setOpen(true);
      setBusy("preview");
      try {
        const r = await send(f, "preview");
        setPreview(r.preview ?? null);
        setName(r.preview?.name ?? f.name.replace(/\.[^.]+$/, ""));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao ler o arquivo.");
      } finally {
        setBusy("");
      }
    },
    [send],
  );

  // arrastar um arquivo para qualquer lugar da tela abre a importação
  useEffect(() => {
    const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const over = (e: DragEvent) => {
      if (has(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) void pick(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [pick]);

  const confirm = async () => {
    if (!file) return;
    setBusy("commit");
    setError("");
    try {
      const r = await send(file, "commit", { name, dealId });
      toast.success("Planilha importada.");
      setOpen(false);
      router.push(`/planilhas/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao importar.");
      setBusy("");
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError("");
    setName("");
    setBusy("");
  };

  return (
    <>
      <Button size="sm" variant="outline" data-tour="sheets-import" onClick={() => { reset(); setOpen(true); }}>
        <Upload /> Importar
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar planilha</DialogTitle>
            <DialogDescription>Excel (.xlsx, .xls), Google Sheets (baixe como .xlsx ou .csv), LibreOffice (.ods), .csv e .tsv. Até {MAX_MB} MB.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {!file && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void pick(f); }}
                className={cn("grid place-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-foreground bg-muted" : "border-border")}
              >
                <FileSpreadsheet className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">Arraste o arquivo para cá</p>
                <p className="text-xs text-muted-foreground">ou</p>
                <Button type="button" variant="outline" onClick={() => input.current?.click()}>
                  Escolher arquivo
                </Button>
                <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
              </div>
            )}
            {file && busy === "preview" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Lendo “{file.name}”…
              </p>
            )}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-[13px] text-destructive">{error}</p>}
            {preview && (
              <>
                <div className="rounded-lg border bg-card p-3 text-[13px]">
                  <p className="font-medium">{file?.name}</p>
                  <ul className="mt-1.5 grid gap-1 text-muted-foreground">
                    {preview.tabs.map((t) => (
                      <li key={t.name}>
                        <span className="font-medium text-foreground">{t.name}</span> — {t.rows.toLocaleString("pt-BR")} linhas × {t.cols} colunas, {t.cells.toLocaleString("pt-BR")} células
                        {t.formulas > 0 && `, ${t.formulas.toLocaleString("pt-BR")} fórmulas`}
                        {t.merges > 0 && `, ${t.merges} mesclagens`}
                      </li>
                    ))}
                  </ul>
                </div>
                {preview.tabs[0]?.sample.length > 0 && (
                  <div className="thin-scroll max-h-44 overflow-auto rounded-lg border">
                    <table className="w-full text-[12px]">
                      <tbody>
                        {preview.tabs[0].sample.map((row, i) => (
                          <tr key={i} className="border-b last:border-0">
                            {row.map((c, j) => (
                              <td key={j} className="max-w-40 truncate px-2 py-1">{c}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {preview.warnings.length > 0 && (
                  <ul className="grid gap-1 rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                    {preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome da planilha" htmlFor="imp-name">
                    <Input id="imp-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  {deals.length > 0 && (
                    <Field label="Vincular a um negócio (opcional)">
                      <SimpleSelect value={dealId} onValueChange={setDealId} options={[{ value: "", label: "Sem vínculo" }, ...deals]} />
                    </Field>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {file && (
              <Button type="button" variant="ghost" onClick={reset} disabled={busy !== ""}>
                Trocar arquivo
              </Button>
            )}
            <Button onClick={confirm} disabled={!preview || busy !== ""}>
              {busy === "commit" && <Loader2 className="animate-spin" />} Importar e abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------- menu da linha ------------------------------- */

export function RowMenu({ id, name, favorite, dealId, contactId, deals, contacts, canEdit, canManage }: { id: string; name: string; favorite: boolean; dealId: string | null; contactId: string | null; deals: Opt[]; contacts: Opt[]; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [dialog, setDialog] = useState<"" | "rename" | "link" | "delete">("");
  const [value, setValue] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    start(async () => {
      const r = (await fn()) as { error?: string } | undefined;
      setBusy(false);
      if (r && r.error) toast.error(r.error);
      else {
        if (okMsg) toast.success(okMsg);
        setDialog("");
        router.refresh();
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${name}`}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => run(() => toggleFavorite(id, !favorite))}>
            <Star className={favorite ? "fill-amber-400 text-amber-400" : ""} /> {favorite ? "Tirar dos favoritos" : "Favoritar"}
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuItem onClick={() => { setValue(name); setDialog("rename"); }}>
                <Pencil /> Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run(() => duplicateSheet(id))}>
                <Copy /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setValue(dealId ?? ""); setContact(contactId ?? ""); setDialog("link"); }}>
                <Link2 /> Vincular a negócio/contato
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem asChild>
            <a href={`/planilhas/${id}/exportar?formato=xlsx`}>
              <Download /> Baixar .xlsx
            </a>
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && setDialog("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear planilha</DialogTitle>
          </DialogHeader>
          <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && run(() => renameSheet(id, value))} aria-label="Novo nome" />
          <DialogFooter>
            <Button disabled={busy} onClick={() => run(() => renameSheet(id, value))}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "link"} onOpenChange={(o) => !o && setDialog("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular a negócio ou contato</DialogTitle>
            <DialogDescription>Escolher um negócio vincula também o contato dele (você pode trocar o contato abaixo).</DialogDescription>
          </DialogHeader>
          <Field label="Negócio">
            <SimpleSelect value={value} onValueChange={setValue} options={[{ value: "", label: "Sem negócio" }, ...deals]} />
          </Field>
          <Field label="Contato">
            <SimpleSelect value={contact} onValueChange={setContact} options={[{ value: "", label: "Sem contato" }, ...contacts]} />
          </Field>
          <DialogFooter>
            <Button disabled={busy} onClick={() => run(() => linkSheet(id, value || null, contact || null), "Vínculo atualizado.")}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir “{name}”?</DialogTitle>
            <DialogDescription>A planilha e o histórico de versões serão apagados. Isso não pode ser desfeito. Se precisar, baixe uma cópia (.xlsx) antes.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog("")}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => run(() => deleteSheet(id), "Planilha excluída.")}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
