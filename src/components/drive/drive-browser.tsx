"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Check, ChevronRight, ExternalLink, Folder, FolderInput, FolderPlus, Home, LayoutGrid, Link2, List, MoreHorizontal, Pencil, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageToolbar, ToolbarGroup } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { DialogCloseBtn } from "@/components/touch-close";
import { SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { KIND_LABEL, KINDS } from "@/lib/drive/detect";
import { createFolder, deleteFolder, deleteItem, moveItem, renameFolder, toggleFavorite } from "@/app/(app)/drive/actions";
import { DriveTabs } from "./drive-tabs";
import { KindIcon } from "./kind-icon";
import { ItemDialog, folderOptions, type FolderRow, type ItemRow } from "./item-dialog";

type Opt = { value: string; label: string };
type Sort = "recentes" | "nome" | "tipo";
const ROOT = "__root";

/* ------------------------------ peças com arrastar e soltar ------------------------------ */

function DropZone({ id, children, className, activeClass }: { id: string; children: (over: boolean) => React.ReactNode; className?: string; activeClass?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && activeClass)}>
      {children(isOver)}
    </div>
  );
}

function DragItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-40")}>
      {children}
    </div>
  );
}

/* ----------------------------------------- principal ----------------------------------------- */

export function DriveBrowser({
  folders,
  items,
  contacts,
  deals,
  projects,
  currentFolder,
  canEdit,
  canManage,
}: {
  folders: FolderRow[];
  items: ItemRow[];
  contacts: Opt[];
  deals: Opt[];
  projects: string[];
  currentFolder: string | null;
  canEdit: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recentes");
  const [view, setView] = useState<"grade" | "lista">("grade");
  const [favOnly, setFavOnly] = useState(false);
  const [kind, setKind] = useState("");
  const [dialog, setDialog] = useState<{ item?: ItemRow | null } | null>(null);
  const [folderDlg, setFolderDlg] = useState<{ id?: string; name: string } | null>(null);
  const [moving, setMoving] = useState<ItemRow | null>(null);
  const [dragging, setDragging] = useState<ItemRow | null>(null);

  const changeView = setView;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const current = currentFolder && folderById.has(currentFolder) ? currentFolder : null;
  const searching = q.trim().length > 0 || favOnly || !!kind;

  const crumbs = useMemo(() => {
    const out: FolderRow[] = [];
    let f = current ? folderById.get(current) : undefined;
    while (f && out.length < 12) {
      out.unshift(f);
      f = f.parentId ? folderById.get(f.parentId) : undefined;
    }
    return out;
  }, [current, folderById]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.folderId) m.set(i.folderId, (m.get(i.folderId) ?? 0) + 1);
    return m;
  }, [items]);

  const visibleItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = items.filter((i) => (searching ? true : i.folderId === current));
    if (term) list = list.filter((i) => [i.title, i.project, i.contactName, i.dealTitle, i.notes, ...i.tags].some((x) => x?.toLowerCase().includes(term)));
    if (favOnly) list = list.filter((i) => i.favorite);
    if (kind) list = list.filter((i) => i.kind === kind);
    const cmp: Record<Sort, (a: ItemRow, b: ItemRow) => number> = {
      recentes: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      nome: (a, b) => a.title.localeCompare(b.title, "pt-BR"),
      tipo: (a, b) => KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind]) || a.title.localeCompare(b.title, "pt-BR"),
    };
    return [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite) || cmp[sort](a, b));
  }, [items, q, favOnly, kind, sort, current, searching]);

  const subfolders = searching ? [] : folders.filter((f) => f.parentId === current).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const href = (id: string | null) => (id ? `/drive?pasta=${id}` : "/drive");

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over || !canEdit) return;
    const item = items.find((i) => i.id === e.active.id);
    const target = e.over.id === ROOT ? null : String(e.over.id).replace(/^f:/, "");
    if (!item || item.folderId === target) return;
    const r = await moveItem(item.id, target);
    if (r.ok) {
      toast.success(`“${item.title}” movido${target ? ` para ${folderById.get(target)?.name ?? "a pasta"}` : " para a raiz"}.`);
      router.refresh();
    } else toast.error(r.error);
  }
  const onDragStart = (e: DragStartEvent) => setDragging(items.find((i) => i.id === e.active.id) ?? null);

  const tree = (parent: string | null, depth = 0): React.ReactNode =>
    folders
      .filter((f) => f.parentId === parent)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((f) => (
        <li key={f.id}>
          <DropZone id={`f:${f.id}`} activeClass="bg-brand-soft ring-1 ring-brand" className="rounded-md">
            {() => (
              <Link href={href(f.id)} style={{ paddingLeft: 8 + depth * 14 }} className={cn("flex items-center gap-2 rounded-md py-1.5 pr-2 text-[13px] hover:bg-muted", current === f.id && "bg-muted font-medium")}>
                <Folder className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{counts.get(f.id) ?? ""}</span>
              </Link>
            )}
          </DropZone>
          <ul>{tree(f.id, depth + 1)}</ul>
        </li>
      ));

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <PageToolbar
        title="Drive"
        tabs={<DriveTabs />}
        filters={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em tudo…" aria-label="Buscar arquivos" className="h-9 w-36 pl-8 max-md:h-11 sm:w-44" />
            </div>
            <div className="w-32">
              <SimpleSelect value={kind || "__all"} onValueChange={(v) => setKind(v === "__all" ? "" : v)} options={[{ value: "__all", label: "Todos os tipos" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
            </div>
            <div className="w-32">
              <SimpleSelect value={sort} onValueChange={(v) => setSort(v as Sort)} options={[{ value: "recentes", label: "Mais recentes" }, { value: "nome", label: "Nome (A–Z)" }, { value: "tipo", label: "Tipo" }]} />
            </div>
            <Button type="button" variant={favOnly ? "default" : "outline"} size="sm" className="max-md:h-11" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>
              <Star className={cn(favOnly && "fill-current")} /> Favoritos
            </Button>
            <ToolbarGroup>
              <Button type="button" variant={view === "grade" ? "secondary" : "ghost"} size="icon-sm" className="max-md:size-11" aria-label="Visão em grade" aria-pressed={view === "grade"} onClick={() => changeView("grade")}>
                <LayoutGrid />
              </Button>
              <Button type="button" variant={view === "lista" ? "secondary" : "ghost"} size="icon-sm" className="max-md:size-11" aria-label="Visão em lista" aria-pressed={view === "lista"} onClick={() => changeView("lista")}>
                <List />
              </Button>
            </ToolbarGroup>
          </>
        }
        actions={
          canEdit && (
            <>
              <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => setFolderDlg({ name: "" })}>
                <FolderPlus /> Nova pasta
              </Button>
              <Button type="button" size="sm" className="max-md:h-11" onClick={() => setDialog({})}>
                <Link2 /> Adicionar link
              </Button>
            </>
          )
        }
      />

      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="thin-scroll hidden border-r p-2 md:block md:h-[calc(100dvh-10.5rem)] md:overflow-y-auto">
          <ul className="grid gap-0.5">
            <li>
              <DropZone id={ROOT} activeClass="bg-brand-soft ring-1 ring-brand" className="rounded-md">
                {() => (
                  <Link href={href(null)} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted", !current && "bg-muted font-medium")}>
                    <Home className="size-4" /> Todos os arquivos
                  </Link>
                )}
              </DropZone>
            </li>
            {tree(null)}
          </ul>
          {canEdit && <p className="mt-3 px-2 text-xs text-muted-foreground">Arraste um arquivo para uma pasta para organizar.</p>}
        </aside>

        <section className="min-w-0 p-3 sm:p-5">
          <nav aria-label="Caminho" className="mb-3 flex flex-wrap items-center gap-1 text-[13px]">
            <Link href={href(null)} className={cn("inline-flex items-center rounded px-1.5 py-0.5 hover:bg-muted max-md:min-h-11", !current && "font-medium")}>
              Todos os arquivos
            </Link>
            {crumbs.map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <Link href={href(c.id)} className={cn("inline-flex items-center rounded px-1.5 py-0.5 hover:bg-muted max-md:min-h-11", c.id === current && "font-medium")}>
                  {c.name}
                </Link>
              </span>
            ))}
            {current && canEdit && (
              <span className="ml-auto flex items-center gap-1 max-md:[&_button]:h-11">
                <Button type="button" variant="ghost" size="xs" onClick={() => setFolderDlg({ id: current, name: folderById.get(current)?.name ?? "" })}>
                  <Pencil /> Renomear
                </Button>
                {canManage && (
                  <ConfirmButton
                    label="Excluir pasta"
                    title="Excluir esta pasta do CRM?"
                    description="Os itens e subpastas sobem um nível. Nada é apagado do Google Drive."
                    action={async () => {
                      const r = await deleteFolder(current);
                      if (r.ok) {
                        toast.success("Pasta excluída.");
                        router.push(href(folderById.get(current)?.parentId ?? null));
                        router.refresh();
                      } else toast.error(r.error);
                    }}
                  />
                )}
              </span>
            )}
          </nav>

          {searching && <p className="mb-3 text-[13px] text-muted-foreground">{visibleItems.length} resultado{visibleItems.length === 1 ? "" : "s"} em todas as pastas.</p>}

          {subfolders.length > 0 && (
            <ul className="mb-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
              {subfolders.map((f) => (
                <li key={f.id}>
                  <DropZone id={`f:${f.id}`} activeClass="ring-2 ring-brand bg-brand-soft" className="rounded-xl">
                    {() => (
                      <Link href={href(f.id)} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 hover:border-foreground/30 max-md:min-h-14">
                        <Folder className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="grid min-w-0 leading-tight">
                          <span className="truncate text-[13.5px] font-medium">{f.name}</span>
                          <span className="text-xs text-muted-foreground">{counts.get(f.id) ?? 0} item(ns)</span>
                        </span>
                      </Link>
                    )}
                  </DropZone>
                </li>
              ))}
            </ul>
          )}

          {visibleItems.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Folder className="size-5" />
              </span>
              <p className="text-sm font-medium">{searching ? "Nada encontrado" : "Nenhum arquivo aqui ainda"}</p>
              {!searching && <p className="max-w-sm text-[13px] text-muted-foreground">{canEdit ? "Use “Adicionar link” para registrar uma pasta ou arquivo do Google Drive. Cole o link e o CRM detecta o tipo." : "Quem pode editar registra aqui os links do Drive."}</p>}
            </div>
          ) : view === "grade" ? (
            <ul className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visibleItems.map((i) => (
                <li key={i.id}>
                  {canEdit ? (
                    <DragItem id={i.id}>
                      <ItemCard i={i} view="grade" canEdit canManage={canManage} onEdit={() => setDialog({ item: i })} onMove={() => setMoving(i)} />
                    </DragItem>
                  ) : (
                    <ItemCard i={i} view="grade" canEdit={false} canManage={false} onEdit={() => {}} onMove={() => {}} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid gap-1.5">
              {visibleItems.map((i) => (
                <li key={i.id}>
                  {canEdit ? (
                    <DragItem id={i.id}>
                      <ItemCard i={i} view="lista" canEdit canManage={canManage} onEdit={() => setDialog({ item: i })} onMove={() => setMoving(i)} />
                    </DragItem>
                  ) : (
                    <ItemCard i={i} view="lista" canEdit={false} canManage={false} onEdit={() => {}} onMove={() => {}} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <DragOverlay>
        {dragging && (
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-[13px] shadow-lg">
            <KindIcon kind={dragging.kind} /> {dragging.title}
          </div>
        )}
      </DragOverlay>

      <ItemDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} item={dialog?.item} defaults={{ folderId: current }} folders={folders} contacts={contacts} deals={deals} projects={projects} />
      <FolderDialog state={folderDlg} onClose={() => setFolderDlg(null)} parentId={current} />
      <MoveDialog item={moving} folders={folders} onClose={() => setMoving(null)} />
    </DndContext>
  );
}

/* -------------------------------------------- cartão -------------------------------------------- */

function ItemCard({ i, view, canEdit, canManage, onEdit, onMove }: { i: ItemRow; view: "grade" | "lista"; canEdit: boolean; canManage: boolean; onEdit: () => void; onMove: () => void }) {
  const router = useRouter();
  const links = [i.contactName && { label: i.contactName, href: `/contatos/${i.contactId}` }, i.dealTitle && { label: i.dealTitle, href: `/negocios/${i.dealId}` }].filter(Boolean) as { label: string; href: string }[];
  const star = async () => {
    const r = await toggleFavorite(i.id, !i.favorite);
    if (r.ok) router.refresh();
    else toast.error(r.error);
  };
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="max-md:size-11" aria-label={`Ações de ${i.title}`} onPointerDown={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-md:min-w-56 max-md:[&_[role=menuitem]]:min-h-11">
        <DropdownMenuItem asChild>
          <a href={i.url} target="_blank" rel="noreferrer">
            <ExternalLink /> Abrir no Drive
          </a>
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Editar
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onSelect={onMove}>
            <FolderInput /> Mover para pasta…
          </DropdownMenuItem>
        )}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={async () => {
                if (!confirm(`Remover “${i.title}” do CRM? O arquivo continua no Drive.`)) return;
                const r = await deleteItem(i.id);
                if (r.ok) {
                  toast.success("Removido do CRM.");
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              <Trash2 /> Remover do CRM
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const starBtn = (
    <Button type="button" variant="ghost" size="icon-sm" className="max-md:size-11" aria-label={i.favorite ? "Tirar dos favoritos" : "Favoritar"} aria-pressed={i.favorite} disabled={!canEdit} onPointerDown={(e) => e.stopPropagation()} onClick={star}>
      <Star className={cn(i.favorite && "fill-current text-amber-500")} />
    </Button>
  );
  const meta = (
    <>
      <span>{KIND_LABEL[i.kind]}</span>
      {i.project && <span> · {i.project}</span>}
      {i.tags.length > 0 && <span> · {i.tags.map((t) => `#${t}`).join(" ")}</span>}
    </>
  );

  if (view === "lista")
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 hover:border-foreground/30">
        <KindIcon kind={i.kind} />
        <a href={i.url} target="_blank" rel="noreferrer" className="grid min-w-0 flex-1 leading-tight max-md:min-h-11 max-md:content-center">
          <span className="truncate text-[13.5px] font-medium">{i.title}</span>
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
        </a>
        <span className="hidden min-w-0 max-w-56 shrink truncate text-xs text-muted-foreground md:block">{links.map((l) => l.label).join(" · ")}</span>
        {starBtn}
        {menu}
      </div>
    );

  return (
    <div className="grid h-full gap-2 rounded-xl border bg-card p-3 hover:border-foreground/30">
      <div className="flex items-start gap-2">
        <KindIcon kind={i.kind} className="mt-0.5 size-6" />
        <a href={i.url} target="_blank" rel="noreferrer" className="grid min-w-0 flex-1 leading-tight">
          <span className="line-clamp-2 text-[13.5px] font-medium">{i.title}</span>
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
        </a>
        <span className="-mr-1.5 -mt-1 flex">
          {starBtn}
          {menu}
        </span>
      </div>
      {links.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onPointerDown={(e) => e.stopPropagation()} className="truncate underline-offset-2 hover:text-foreground hover:underline max-md:py-2.5">
              {l.label}
            </Link>
          ))}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------- pasta (diálogo) ----------------------------------------- */

function FolderDialog({ state, onClose, parentId }: { state: { id?: string; name: string } | null; onClose: () => void; parentId: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<typeof state>(null);
  if (state !== seen) {
    setSeen(state);
    if (state) setName(state.name);
  }
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogCloseBtn />
        <form
          className="grid gap-4 max-md:[&_input]:h-11"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = state?.id ? await renameFolder(state.id, name) : await createFolder(name, parentId);
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success(state?.id ? "Pasta renomeada." : "Pasta criada.");
            onClose();
            router.refresh();
          }}
        >
          <DialogHeader className="pr-10">
            <DialogTitle className="font-normal">{state?.id ? "Renomear pasta" : "Nova pasta"}</DialogTitle>
            <DialogDescription>{state?.id ? "" : parentId ? "Será criada dentro da pasta atual." : "Será criada na raiz."} Pastas do CRM só organizam os links; não mudam nada no Drive.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da pasta" maxLength={120} required autoFocus />
          <DialogFooter className="max-md:[&_button]:h-11">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {state?.id ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------ mover por botão (toque) ------------------------------------ */

function MoveDialog({ item, folders, onClose }: { item: ItemRow | null; folders: FolderRow[]; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const opts = useMemo(() => folderOptions(folders), [folders]);
  async function move(target: string | null) {
    if (!item) return;
    setBusy(target ?? ROOT);
    const r = await moveItem(item.id, target);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`“${item.title}” movido${target ? ` para ${opts.find((o) => o.value === target)?.label ?? "a pasta"}` : " para a raiz"}.`);
    onClose();
    router.refresh();
  }
  const row = (key: string, label: string, target: string | null, icon: React.ReactNode) => (
    <li key={key}>
      <button type="button" disabled={busy !== null} onClick={() => move(target)} className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left text-[14px] hover:bg-muted disabled:opacity-60", item?.folderId === target && "border-brand bg-brand-soft")}>
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {item?.folderId === target && <Check className="size-4 text-brand" aria-label="Pasta atual" />}
      </button>
    </li>
  );
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] min-w-0 overflow-y-auto sm:max-w-md" showCloseButton={false}>
        <DialogCloseBtn />
        <DialogHeader className="pr-10">
          <DialogTitle className="font-normal">Mover para pasta</DialogTitle>
          <DialogDescription className="truncate">{item?.title}</DialogDescription>
        </DialogHeader>
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
          {row(ROOT, "Raiz (sem pasta)", null, <Home className="size-4 shrink-0" />)}
          {opts.map((o) => row(o.value, o.label, o.value, <Folder className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />))}
        </ul>
        {opts.length === 0 && <p className="text-[13px] text-muted-foreground">Ainda não há pastas. Crie uma em “Nova pasta”.</p>}
      </DialogContent>
    </Dialog>
  );
}
