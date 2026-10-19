"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Download, ExternalLink, Loader2, MoreHorizontal, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContractEditor } from "@/components/docs/contract-editor";
import { DeckEditor } from "@/components/docs/deck-editor";
import { ScaledSlide } from "@/components/docs/scaled-slide";
import { DocStatusBadge } from "@/components/docs/status";
import { DOC_CSS } from "@/lib/docs/doc-css";
import { EVENT_LABEL, type ContractContent, type DeckContent, type DocContent } from "@/lib/docs/types";
import type { DocStatus } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/format";
import {
  cancelDocument,
  deleteDocument,
  duplicateDocument,
  linkDocument,
  previewData,
  reopenDocument,
  restoreVersion,
  saveAsTemplate,
  saveDocument,
  saveVersion,
  sendDocument,
} from "../actions";

type Preview = { map: Record<string, string>; missing: string[]; html: string | null; studioName: string };
export type WorkspaceProps = {
  doc: { id: string; kind: "contrato" | "apresentacao"; number: string | null; title: string; status: DocStatus; content: DocContent; dealId: string | null; publicToken: string | null; acceptedAt: string | null; acceptedName: string | null };
  deals: { id: string; title: string }[];
  customClauses: { id: string; name: string; description: string | null; html: string }[];
  events: { id: number; type: string; at: string; meta: Record<string, unknown> | null }[];
  versions: { id: number; version: number; note: string | null; createdAt: string }[];
  preview: Preview;
  canEdit: boolean;
  canManage: boolean;
};

const MISSING_HINT = "Preencha no cadastro do contato, no negócio ou em Ajustes → Dados do estúdio.";

export function Workspace({ doc, deals, customClauses, events, versions, preview: initialPreview, canEdit, canManage }: WorkspaceProps) {
  const router = useRouter();
  const draft = doc.status === "rascunho" && canEdit;
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState<DocContent>(doc.content);
  const contentRef = useRef<DocContent>(doc.content);
  const titleRef = useRef(doc.title);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<Preview>(initialPreview);
  const [tab, setTab] = useState("editar");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMissing, setSendMissing] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const persist = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSaveState("saving");
    const r = await saveDocument(doc.id, { title: titleRef.current, content: contentRef.current });
    if (r && "error" in r && r.error) {
      setSaveState("error");
      toast.error(r.error);
      return false;
    }
    setSaveState("saved");
    return true;
  };
  const schedule = () => {
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, 1200);
  };
  const changeContract = (fn: (p: ContractContent) => ContractContent) => {
    const next = fn(contentRef.current as ContractContent);
    contentRef.current = next;
    setContent(next);
    schedule();
  };
  const changeDeck = (fn: (p: DeckContent) => DeckContent) => {
    const next = fn(contentRef.current as DeckContent);
    contentRef.current = next;
    setContent(next);
    schedule();
  };
  const changeTitle = (v: string) => {
    titleRef.current = v;
    setTitle(v);
    schedule();
  };

  const refreshPreview = async () => {
    const r = await previewData(doc.id, contentRef.current);
    if (r) setPreview({ map: r.map, missing: r.missing, html: r.html, studioName: r.studioName });
  };
  const onTab = (v: string) => {
    setTab(v);
    if (v === "previa" && draft) void refreshPreview();
  };

  const link = () => `${window.location.origin}/p/${doc.publicToken}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link());
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Abra o link e copie do navegador.");
    }
  };

  const openSend = () =>
    start(async () => {
      if (!(await persist())) return;
      const r = await previewData(doc.id);
      setSendMissing(r?.missing ?? []);
      setSendOpen(true);
    });
  const doSend = (force: boolean) =>
    start(async () => {
      const r = await sendDocument(doc.id, { force });
      if ("error" in r && r.error) return void toast.error(r.error);
      if ("missing" in r && r.missing) return void setSendMissing(r.missing);
      setSendOpen(false);
      toast.success("Pronto! O link para o cliente foi gerado.");
      router.refresh();
    });

  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      const r = (await fn()) as { error?: string } | undefined;
      if (r?.error) return void toast.error(r.error);
      if (ok) toast.success(ok);
      router.refresh();
    });

  const isContract = content.kind === "contrato";
  const saveLabel = { saved: "Salvo", dirty: "Alterações pendentes", saving: "Salvando…", error: "Erro ao salvar" }[saveState];

  return (
    <div className="rs-doc-root">
      <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
      <div data-tour="doc-header" className="px-5 pt-5 pb-3 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">{doc.number}</span>
          <DocStatusBadge status={doc.status} />
          {draft && (
            <span className={`flex items-center gap-1 text-[12px] ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
              {saveState === "saving" ? <Loader2 className="size-3 animate-spin" /> : saveState === "saved" ? <Check className="size-3" /> : null}
              {saveLabel}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            aria-label="Título do documento"
            value={title}
            disabled={!draft}
            onChange={(e) => changeTitle(e.target.value)}
            className="h-10 min-w-0 flex-1 basis-64 border-transparent bg-transparent px-1 text-[20px] font-semibold shadow-none hover:border-input focus-visible:border-ring sm:text-[24px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/documentos/${doc.id}/pdf`} target="_blank" rel="noreferrer">
                <Download /> PDF
              </a>
            </Button>
            {doc.status !== "rascunho" && doc.publicToken && doc.status !== "cancelado" && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                  <Copy /> Copiar link
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/p/${doc.publicToken}`} target="_blank" rel="noreferrer">
                    <ExternalLink /> Abrir
                  </a>
                </Button>
              </>
            )}
            {draft && (
              <Button type="button" size="sm" onClick={openSend} disabled={pending} data-tour="doc-send">
                {pending ? <Loader2 className="animate-spin" /> : <Send />} Enviar ao cliente
              </Button>
            )}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon-sm" aria-label="Mais ações">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {doc.status === "enviado" && <DropdownMenuItem onClick={() => run(() => reopenDocument(doc.id), "Reaberto para edição")}>Reabrir para editar</DropdownMenuItem>}
                  {doc.status === "cancelado" && <DropdownMenuItem onClick={() => run(() => reopenDocument(doc.id), "Reaberto para edição")}>Reativar como rascunho</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => run(() => duplicateDocument(doc.id))}>Duplicar</DropdownMenuItem>
                  {draft && <DropdownMenuItem onClick={() => run(async () => { await persist(); return saveVersion(doc.id, "Versão salva manualmente"); }, "Versão salva")}><Save /> Salvar versão</DropdownMenuItem>}
                  {canManage && (
                    <DropdownMenuItem
                      onClick={() => {
                        const name = window.prompt("Nome do modelo", title);
                        if (name) run(async () => { await persist(); return saveAsTemplate(doc.id, name); }, "Modelo salvo");
                      }}
                    >
                      Salvar como modelo
                    </DropdownMenuItem>
                  )}
                  {(doc.status === "rascunho" || doc.status === "enviado") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => window.confirm("Cancelar este documento? O link do cliente deixará de funcionar.") && run(() => cancelDocument(doc.id), "Cancelado")}>Cancelar documento</DropdownMenuItem>
                    </>
                  )}
                  {canManage && (
                    <DropdownMenuItem className="text-destructive" onClick={() => window.confirm("Excluir definitivamente? Isso não pode ser desfeito.") && run(() => deleteDocument(doc.id))}>
                      Excluir
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {doc.status === "aceito" && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
            <Check className="size-4" /> Aceito por {doc.acceptedName} em {fmtDateTime(doc.acceptedAt)}. Este documento está travado; duplique para criar uma nova versão.
          </p>
        )}
        {doc.status === "enviado" && (
          <p className="mt-3 text-[13px] text-muted-foreground">Enviado. O cliente vê a versão congelada no envio; para mudar algo, reabra para editar e envie de novo.</p>
        )}
        {draft && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            <label htmlFor="deal-link">Negócio:</label>
            <select
              id="deal-link"
              defaultValue={doc.dealId ?? ""}
              onChange={(e) => run(() => linkDocument(doc.id, e.target.value || null), "Vinculado")}
              className="h-8 max-w-full rounded-lg border border-input bg-background px-2 text-[13px] text-foreground"
            >
              <option value="">Sem negócio</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="px-5 pb-12 sm:px-8 lg:px-10">
        <Tabs value={tab} onValueChange={onTab}>
          <TabsList data-tour="doc-tabs">
            <TabsTrigger value="editar">{draft ? "Editar" : "Documento"}</TabsTrigger>
            <TabsTrigger value="previa">Prévia</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="editar" className="mt-3">
            {isContract ? (
              <ContractEditor value={content as ContractContent} onChange={changeContract} readOnly={!draft} customClauses={customClauses} />
            ) : (
              <DeckEditor value={content as DeckContent} onChange={changeDeck} readOnly={!draft} map={preview.map} studioName={preview.studioName} />
            )}
          </TabsContent>

          <TabsContent value="previa" className="mt-3">
            {preview.missing.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-[#fde8c8] px-3 py-2.5 text-[13px] text-[#7a3b00]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  Faltam dados para preencher: <strong>{preview.missing.join(", ")}</strong>. {MISSING_HINT}
                </p>
              </div>
            )}
            <div className="rs-doc">
              {isContract ? (
                <div className="mx-auto max-w-[794px] overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10">
                  <article className="rs-paper" dangerouslySetInnerHTML={{ __html: preview.html ?? "" }} />
                </div>
              ) : (
                <div className="mx-auto grid max-w-[960px] gap-4">
                  {(content as DeckContent).slides.map((s, i, all) => (
                    <div key={s.id} className="overflow-hidden rounded-xl border shadow-sm">
                      <ScaledSlide slide={s} map={preview.map} index={i} total={all.length} studioName={preview.studioName} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="historico" className="mt-3 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="label mb-2">Linha do tempo</h2>
              <ol className="grid gap-2">
                {events.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-[13px]">
                    <span>
                      {EVENT_LABEL[e.type] ?? e.type}
                      {typeof e.meta?.by === "string" && <span className="text-muted-foreground"> · {e.meta.by}</span>}
                      {typeof e.meta?.message === "string" && <span className="mt-1 block whitespace-pre-line text-muted-foreground">“{e.meta.message}”</span>}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{fmtDateTime(e.at)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2 className="label mb-2">Versões salvas</h2>
              {versions.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Versões são guardadas a cada envio e quando você escolhe “Salvar versão”.</p>
              ) : (
                <ol className="grid gap-2">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-[13px]">
                      <span>
                        v{v.version} · {v.note ?? "Versão"}
                        <span className="block text-[12px] text-muted-foreground">{fmtDateTime(v.createdAt)}</span>
                      </span>
                      {draft && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.confirm("Voltar a esta versão? O texto atual será guardado antes.") &&
                            start(async () => {
                              const r = await restoreVersion(doc.id, v.id);
                              if (r && "error" in r && r.error) return void toast.error(r.error);
                              window.location.reload();
                            })
                          }
                        >
                          Restaurar
                        </Button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar ao cliente</DialogTitle>
            <DialogDescription>
              Vamos congelar esta versão e gerar um link para o cliente {isContract ? "ler e aceitar" : "ver a proposta"}. Depois você copia o link e manda pelo WhatsApp ou e-mail.
            </DialogDescription>
          </DialogHeader>
          {sendMissing.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-[#fde8c8] px-3 py-2.5 text-[13px] text-[#7a3b00]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Estes dados estão vazios e aparecerão como lacunas: <strong>{sendMissing.join(", ")}</strong>. {MISSING_HINT}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSendOpen(false)}>
              Voltar e completar
            </Button>
            <Button type="button" onClick={() => doSend(sendMissing.length > 0)} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {sendMissing.length ? "Enviar mesmo assim" : "Gerar link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
