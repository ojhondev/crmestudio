"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ChevronRight, ExternalLink, Folder, FolderPlus, Home, LayoutGrid, Link2, List, MoreHorizontal, Pencil, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageToolbar, ToolbarGroup } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmButton } from "@/components/crm/confirm-button";
import { SimpleSelect } from "@/components/form";
import { cn } from "@/lib/utils";
import { KIND_LABEL, KINDS } from "@/lib/drive/detect";
import { createFolder, deleteFolder, deleteItem, moveItem, renameFolder, toggleFavorite } from "@/app/(app)/drive/actions";
import { DriveTabs } from "./drive-tabs";
import { KindIcon } from "./kind-icon";
import { ItemDialog, type FolderRow, type ItemRow } from "./item-dialog";

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
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em tudo…" aria-label="Buscar arquivos" className="h-9 w-36 pl-8 sm:w-44" />
            </div>
            <div className="w-32">
              <SimpleSelect value={kind || "__all"} onValueChange={(v) => setKind(v === "__all" ? "" : v)} options={[{ value: "__all", label: "Todos os tipos" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
            </div>
            <div className="w-32">
              <SimpleSelect value={sort} onValueChange={(v) => setSort(v as Sort)} options={[{ value: "recentes", label: "Mais recentes" }, { value: "nome", label: "Nome (A–Z)" }, { value: "tipo", label: "Tipo" }]} />
            </div>
            <Button type="button" variant={favOnly ? "default" : "outline"} size="sm" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>
              <Star className={cn(favOnly && "fill-current")} /> Favoritos
            </Button>
            <ToolbarGroup>
              <Button type="button" variant={view === "grade" ? "secondary" : "ghost"} size="icon-sm" aria-label="Visão em grade" aria-pressed={view === "grade"} onClick={() => changeView("grade")}>
                <LayoutGrid />
              </Button>
              <Button type="button" variant={view === "lista" ? "secondary" : "ghost"} size="icon-sm" aria-label="Visão em lista" aria-pressed={view === "lista"} onClick={() => changeView("lista")}>
                <List />
              </Button>
            </ToolbarGroup>
          </>
        }
        actions={
          canEdit && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setFolderDlg({ name: "" })}>
                <FolderPlus /> Nova pasta
              </Button>
              <Button type="button" size="sm" onClick={() => setDialog({})}>
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
            <Link href={href(null)} className={cn("rounded px-1.5 py-0.5 hover:bg-muted", !current && "font-medium")}>
              Todos os arquivos
            </Link>
            {crumbs.map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <Link href={href(c.id)} className={cn("rounded px-1.5 py-0.5 hover:bg-muted", c.id === current && "font-medium")}>
                  {c.name}
                </Link>
              </span>
            ))}
            {current && canEdit && (
              <span className="ml-auto flex items-center gap-1">
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
            <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {subfolders.map((f) => (
                <li key={f.id}>
                  <DropZone id={`f:${f.id}`} activeClass="ring-2 ring-brand bg-brand-soft" className="rounded-xl">
                    {() => (
                      <Link href={href(f.id)} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 hover:border-foreground/30">
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
                      <ItemCard i={i} view="grade" canEdit canManage={canManage} onEdit={() => setDialog({ item: i })} />
                    </DragItem>
                  ) : (
                    <ItemCard i={i} view="grade" canEdit={false} canManage={false} onEdit={() => {}} />
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
                      <ItemCard i={i} view="lista" canEdit canManage={canManage} onEdit={() => setDialog({ item: i })} />
                    </DragItem>
                  ) : (
                    <ItemCard i={i} view="lista" canEdit={false} canManage={false} onEdit={() => {}} />
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
    </DndContext>
  );
}

/* -------------------------------------------- cartão -------------------------------------------- */

function ItemCard({ i, view, canEdit, canManage, onEdit }: { i: ItemRow; view: "grade" | "lista"; canEdit: boolean; canManage: boolean; onEdit: () => void }) {
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
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Ações de ${i.title}`} onPointerDown={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={i.url} target="_blank" rel="noreferrer">
            <ExternalLink /> Abrir no Drive
          </a>
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Editar / mover
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
    <Button type="button" variant="ghost" size="icon-sm" aria-label={i.favorite ? "Tirar dos favoritos" : "Favoritar"} aria-pressed={i.favorite} disabled={!canEdit} onPointerDown={(e) => e.stopPropagation()} onClick={star}>
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
        <a href={i.url} target="_blank" rel="noreferrer" className="grid min-w-0 flex-1 leading-tight">
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
            <Link key={l.href} href={l.href} onPointerDown={(e) => e.stopPropagation()} className="truncate underline-offset-2 hover:text-foreground hover:underline">
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
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-4"
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
          <DialogHeader>
            <DialogTitle className="font-normal">{state?.id ? "Renomear pasta" : "Nova pasta"}</DialogTitle>
            <DialogDescription>{state?.id ? "" : parentId ? "Será criada dentro da pasta atual." : "Será criada na raiz."} Pastas do CRM só organizam os links; não mudam nada no Drive.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da pasta" maxLength={120} required autoFocus />
          <DialogFooter>
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


