"use client";

/**
 * Cromo do editor (estilo Google Sheets): barra de menus, barra de ícones, barra de fórmulas, abas e barra de status.
 * Tudo aqui é apresentação: a lógica está em editor.tsx e chega pelo objeto `api`.
 */
import { createContext, useContext, useRef, useState } from "react";
import Link from "next/link";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Baseline,
  Bold,
  Check,
  ChevronDown,
  Cloud,
  CloudOff,
  Ellipsis,
  X,
  BoxSelect,
  Type,
  DecimalsArrowLeft,
  DecimalsArrowRight,
  Filter,
  Grid3x3,
  Italic,
  Loader2,
  PaintBucket,
  Percent,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  Star,
  Strikethrough,
  TableCellsMerge,
  Underline,
  Undo2,
  WrapText,
  DollarSign,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FORMATS } from "@/lib/sheets/format";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetCloseBtn } from "@/components/touch-close";
import { cn } from "@/lib/utils";
import { ColorPicker } from "./popovers";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict" | "readonly";

export type Api = {
  canEdit: boolean;
  canManage: boolean;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  copy(): void;
  cut(): void;
  paste(values?: boolean): void;
  clearContent(): void;
  clearFormat(): void;
  selectAll(): void;
  toggle(k: "b" | "i" | "u" | "st"): void;
  align(a: "l" | "c" | "r"): void;
  valign(a: "t" | "m" | "b"): void;
  wrap(): void;
  fontSize(n: number): void;
  setFmt(f: string): void;
  decimals(d: 1 | -1): void;
  color(kind: "c" | "bg", color: string | null): void;
  borders(mode: "all" | "outer" | "none" | "top" | "bottom" | "left" | "right" | "inner"): void;
  merge(mode: "all" | "h" | "v" | "none"): void;
  freeze(axis: "row" | "col", n: number | "sel"): void;
  insertRows(where: "above" | "below"): void;
  insertCols(where: "left" | "right"): void;
  deleteRows(): void;
  deleteCols(): void;
  hideRows(): void;
  hideCols(): void;
  showHidden(): void;
  sort(asc: boolean): void;
  filter(): void;
  toggleGrid(): void;
  download(format: "xlsx" | "csv-br" | "csv-us" | "tsv"): void;
  print(): void;
  openHistory(): void;
  openLink(): void;
  saveNow(): void;
  rename(name: string): void;
  toggleFavorite(): void;
  focusGrid(): void;
  state: {
    b: boolean;
    i: boolean;
    u: boolean;
    st: boolean;
    al: "l" | "c" | "r" | undefined;
    wrap: boolean;
    fmtKind: string;
    fs: number;
    filterOn: boolean;
    frozenRows: number;
    frozenCols: number;
    showGrid: boolean;
    textColor: string;
    fillColor: string;
    favorite: boolean;
    multiRows: number;
    multiCols: number;
  };
};

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/* ------------------------------- barra de menus ------------------------------- */

/** Gaveta (celular): os mesmos itens dos menus, em lista com seções recolhíveis e alvos de 48px. */
const Drawer = createContext<{ close: () => void } | null>(null);

function Menu({ label, children, api }: { label: string; children: React.ReactNode; api: Api }) {
  const d = useContext(Drawer);
  if (d)
    return (
      <details className="group border-b last:border-b-0">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-3 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
          {label}
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-0.5 pb-2">{children}</div>
      </details>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap outline-none hover:bg-muted focus-visible:bg-muted aria-expanded:bg-muted">
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[75dvh] min-w-56 overflow-y-auto"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          api.focusGrid();
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const drawerRow = "flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-[15px] hover:bg-muted active:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";

const Item = ({ children, onClick, shortcut, disabled }: { children: React.ReactNode; onClick: () => void; shortcut?: string; disabled?: boolean }) => {
  const d = useContext(Drawer);
  if (d)
    return (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          d.close();
          onClick();
        }}
        className={drawerRow}
      >
        {children}
      </button>
    );
  return (
    <DropdownMenuItem onClick={onClick} disabled={disabled}>
      {children}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
};

function LinkItem({ href, children }: { href: string; children: React.ReactNode }) {
  const d = useContext(Drawer);
  if (d)
    return (
      <Link href={href} className={drawerRow}>
        {children}
      </Link>
    );
  return (
    <DropdownMenuItem asChild>
      <Link href={href}>{children}</Link>
    </DropdownMenuItem>
  );
}

function Sub({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const d = useContext(Drawer);
  if (d)
    return (
      <details className="group/sub">
        <summary className={cn(drawerRow, "cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden")}>
          {label}
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/sub:rotate-180" />
        </summary>
        <div className="ml-3 grid gap-0.5 border-l pl-1">{children}</div>
      </details>
    );
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={className}>{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function Sep() {
  const d = useContext(Drawer);
  return d ? <div role="separator" className="my-1 h-px bg-border" /> : <DropdownMenuSeparator />;
}

function MenuList({ api, backHref }: { api: Api; backHref: string }) {
  const e = api.canEdit;
  const s = api.state;
  return (
    <>
      <Menu label="Arquivo" api={api}>
          <Sub label="Fazer download">
              <Item onClick={() => api.download("xlsx")}>Microsoft Excel (.xlsx)</Item>
              <Item onClick={() => api.download("csv-br")}>CSV para Excel Brasil (;)</Item>
              <Item onClick={() => api.download("csv-us")}>CSV internacional (,)</Item>
              <Item onClick={() => api.download("tsv")}>Texto separado por tabulação (.tsv)</Item>
            </Sub>
          <Item onClick={api.print} shortcut={`${MOD}P`}>
            <Printer /> Imprimir / salvar como PDF
          </Item>
          <Sep />
          <Item onClick={api.openHistory}>Histórico de versões</Item>
          {e && <Item onClick={api.openLink}>Vincular a negócio…</Item>}
          {e && (
            <Item onClick={api.saveNow} shortcut={`${MOD}S`}>
              Salvar agora
            </Item>
          )}
          <Sep />
          <LinkItem href={backHref}>Voltar para a lista</LinkItem>
        </Menu>
        <Menu label="Editar" api={api}>
          <Item onClick={api.undo} disabled={!e || !api.canUndo} shortcut={`${MOD}Z`}>
            <Undo2 /> Desfazer
          </Item>
          <Item onClick={api.redo} disabled={!e || !api.canRedo} shortcut={`${MOD}Y`}>
            <Redo2 /> Refazer
          </Item>
          <Sep />
          <Item onClick={api.cut} disabled={!e} shortcut={`${MOD}X`}>
            Recortar
          </Item>
          <Item onClick={api.copy} shortcut={`${MOD}C`}>
            Copiar
          </Item>
          <Item onClick={() => api.paste()} disabled={!e} shortcut={`${MOD}V`}>
            Colar
          </Item>
          <Item onClick={() => api.paste(true)} disabled={!e} shortcut={`${MOD}⇧V`}>
            Colar somente valores
          </Item>
          <Sep />
          <Item onClick={api.selectAll} shortcut={`${MOD}A`}>
            Selecionar tudo
          </Item>
          <Item onClick={api.clearContent} disabled={!e} shortcut="Del">
            Limpar conteúdo
          </Item>
          <Item onClick={api.clearFormat} disabled={!e}>
            Limpar formatação
          </Item>
        </Menu>
        <Menu label="Ver" api={api}>
          <Sub label="Congelar linhas">
              <Item onClick={() => api.freeze("row", 0)}>Nenhuma linha</Item>
              <Item onClick={() => api.freeze("row", 1)}>1 linha</Item>
              <Item onClick={() => api.freeze("row", 2)}>2 linhas</Item>
              <Item onClick={() => api.freeze("row", "sel")}>Até a linha atual</Item>
            </Sub>
          <Sub label="Congelar colunas">
              <Item onClick={() => api.freeze("col", 0)}>Nenhuma coluna</Item>
              <Item onClick={() => api.freeze("col", 1)}>1 coluna</Item>
              <Item onClick={() => api.freeze("col", 2)}>2 colunas</Item>
              <Item onClick={() => api.freeze("col", "sel")}>Até a coluna atual</Item>
            </Sub>
          <Sep />
          <Item onClick={api.toggleGrid}>{s.showGrid ? "Ocultar linhas de grade" : "Mostrar linhas de grade"}</Item>
          <Item onClick={api.showHidden}>Mostrar linhas e colunas ocultas</Item>
        </Menu>
        <Menu label="Inserir" api={api}>
          <Item onClick={() => api.insertRows("above")} disabled={!e}>
            {s.multiRows > 1 ? `${s.multiRows} linhas acima` : "Linha acima"}
          </Item>
          <Item onClick={() => api.insertRows("below")} disabled={!e}>
            {s.multiRows > 1 ? `${s.multiRows} linhas abaixo` : "Linha abaixo"}
          </Item>
          <Sep />
          <Item onClick={() => api.insertCols("left")} disabled={!e}>
            {s.multiCols > 1 ? `${s.multiCols} colunas à esquerda` : "Coluna à esquerda"}
          </Item>
          <Item onClick={() => api.insertCols("right")} disabled={!e}>
            {s.multiCols > 1 ? `${s.multiCols} colunas à direita` : "Coluna à direita"}
          </Item>
        </Menu>
        <Menu label="Formatar" api={api}>
          <Sub label="Número" className="w-60">
              {FORMATS.map((f) => (
                <Item key={f.key || "auto"} onClick={() => api.setFmt(f.key)} disabled={!e}>
                  <span className="flex-1">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.example}</span>
                </Item>
              ))}
            </Sub>
          <Sep />
          <Item onClick={() => api.toggle("b")} disabled={!e} shortcut={`${MOD}B`}>
            <Bold /> Negrito
          </Item>
          <Item onClick={() => api.toggle("i")} disabled={!e} shortcut={`${MOD}I`}>
            <Italic /> Itálico
          </Item>
          <Item onClick={() => api.toggle("u")} disabled={!e} shortcut={`${MOD}U`}>
            <Underline /> Sublinhado
          </Item>
          <Item onClick={() => api.toggle("st")} disabled={!e}>
            <Strikethrough /> Tachado
          </Item>
          <Sep />
          <Sub label="Alinhamento">
              <Item onClick={() => api.align("l")} disabled={!e}>
                À esquerda
              </Item>
              <Item onClick={() => api.align("c")} disabled={!e}>
                Centralizado
              </Item>
              <Item onClick={() => api.align("r")} disabled={!e}>
                À direita
              </Item>
              <Sep />
              <Item onClick={() => api.valign("t")} disabled={!e}>
                Em cima
              </Item>
              <Item onClick={() => api.valign("m")} disabled={!e}>
                No meio
              </Item>
              <Item onClick={() => api.valign("b")} disabled={!e}>
                Embaixo
              </Item>
            </Sub>
          <Item onClick={api.wrap} disabled={!e}>
            <WrapText /> {s.wrap ? "Não quebrar texto" : "Quebrar texto automaticamente"}
          </Item>
          <Sub label="Mesclar células">
              <Item onClick={() => api.merge("all")} disabled={!e}>
                Mesclar tudo
              </Item>
              <Item onClick={() => api.merge("h")} disabled={!e}>
                Mesclar na horizontal
              </Item>
              <Item onClick={() => api.merge("v")} disabled={!e}>
                Mesclar na vertical
              </Item>
              <Item onClick={() => api.merge("none")} disabled={!e}>
                Desfazer mesclagem
              </Item>
            </Sub>
          <Sub label="Bordas">
              <BorderItems api={api} />
            </Sub>
          <Sep />
          <Item onClick={api.clearFormat} disabled={!e}>
            <RemoveFormatting /> Limpar formatação
          </Item>
        </Menu>
        <Menu label="Dados" api={api}>
          <Item onClick={() => api.sort(true)} disabled={!e}>
            Ordenar de A a Z
          </Item>
          <Item onClick={() => api.sort(false)} disabled={!e}>
            Ordenar de Z a A
          </Item>
          <Sep />
          <Item onClick={api.filter} disabled={!e}>
            <Filter /> {s.filterOn ? "Remover filtro" : "Criar um filtro"}
          </Item>
          <Sep />
          <Item onClick={api.hideRows} disabled={!e}>
            Ocultar linhas selecionadas
          </Item>
          <Item onClick={api.hideCols} disabled={!e}>
            Ocultar colunas selecionadas
          </Item>
          <Item onClick={api.showHidden}>Mostrar tudo que está oculto</Item>
          <Sep />
          <Item onClick={() => api.deleteRows()} disabled={!e}>
            Excluir linhas selecionadas
          </Item>
          <Item onClick={() => api.deleteCols()} disabled={!e}>
            Excluir colunas selecionadas
          </Item>
        </Menu>
    </>
  );
}

export function MenuBar({ api, name, status, backHref }: { api: Api; name: string; status: SaveStatus; backHref: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const skip = useRef(false);
  const title = draft ?? name;
  const editing = draft !== null;
  const s = api.state;

  return (
    <div className="flex items-center gap-1 border-b bg-background px-2 py-1">
      <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar para Planilhas" className="max-md:size-11">
        <Link href={backHref}>
          <ArrowLeft />
        </Link>
      </Button>
      <div className="flex min-w-0 flex-1 flex-col pr-1 md:flex-none md:shrink-0 md:pr-2">
        <div className="flex min-w-0 items-center gap-1">
          <input
            value={title}
            readOnly={!api.canEdit}
            aria-label="Nome da planilha"
            onFocus={() => setDraft(name)}
            onChange={(ev) => setDraft(ev.target.value)}
            onBlur={() => {
              if (!skip.current && title.trim() && title.trim() !== name) api.rename(title.trim());
              skip.current = false;
              setDraft(null);
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
              if (ev.key === "Escape") {
                skip.current = true;
                (ev.target as HTMLInputElement).blur();
              }
            }}
            className={cn("h-7 w-44 rounded border border-transparent bg-transparent px-1.5 text-[15px] font-medium outline-none max-md:h-11 max-md:min-w-0 max-md:flex-1 max-md:text-base sm:w-64 max-md:sm:w-auto", editing ? "border-ring bg-background" : "hover:border-border")}
          />
          <button type="button" onClick={api.toggleFavorite} aria-label={s.favorite ? "Tirar dos favoritos" : "Favoritar"} className="grid size-7 shrink-0 place-items-center rounded hover:bg-muted max-md:size-11">
            <Star className={cn("size-4", s.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
          </button>
          <SaveBadge status={status} onRetry={api.saveNow} />
        </div>
      </div>
      <div className="thin-scroll hidden min-w-0 flex-1 items-center overflow-x-auto md:flex">
        <MenuList api={api} backHref={backHref} />
      </div>
      <button type="button" onClick={() => setDrawer(true)} aria-label="Menu da planilha" aria-haspopup="dialog" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-muted md:hidden">
        <Ellipsis className="size-5" />
      </button>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[90dvh] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:hidden">
          <SheetCloseBtn />
          <SheetHeader className="pr-12">
            <SheetTitle>Menu da planilha</SheetTitle>
            <SheetDescription className="sr-only">Arquivo, editar, ver, inserir, formatar e dados.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-1 pb-4">
            <Drawer.Provider value={{ close: () => setDrawer(false) }}>
              <MenuList api={api} backHref={backHref} />
            </Drawer.Provider>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BorderItems({ api }: { api: Api }) {
  const e = api.canEdit;
  return (
    <>
      {(
        [
          ["all", "Todas as bordas"],
          ["outer", "Bordas externas"],
          ["inner", "Bordas internas"],
          ["top", "Borda superior"],
          ["bottom", "Borda inferior"],
          ["left", "Borda esquerda"],
          ["right", "Borda direita"],
          ["none", "Sem bordas"],
        ] as const
      ).map(([k, l]) => (
        <Item key={k} onClick={() => api.borders(k)} disabled={!e}>
          {l}
        </Item>
      ))}
    </>
  );
}

const T = ({ children }: { children: React.ReactNode }) => <span className="max-md:sr-only">{children}</span>;

function SaveBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const base = "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] whitespace-nowrap max-md:min-h-11 max-md:min-w-9 max-md:justify-center";
  if (status === "readonly") return <span className={cn(base, "text-muted-foreground")}><T>Somente leitura</T><span aria-hidden className="md:hidden">🔒</span></span>;
  if (status === "saving") return <span className={cn(base, "text-muted-foreground")} role="status"><Loader2 className="size-3 animate-spin" /> <T>Salvando…</T></span>;
  if (status === "dirty") return <span className={cn(base, "text-muted-foreground")} role="status"><Cloud className="size-3" /> <T>Alterações pendentes…</T></span>;
  if (status === "error")
    return (
      <button type="button" onClick={onRetry} className={cn(base, "text-destructive hover:bg-destructive/10")} role="status">
        <CloudOff className="size-3" /> <T>Erro ao salvar — tentar de novo</T>
      </button>
    );
  if (status === "conflict") return <span className={cn(base, "text-destructive")} role="status"><CircleAlert className="size-3" /> <T>Conflito de versão</T></span>;
  return (
    <span className={cn(base, "text-muted-foreground")} role="status" data-testid="save-status">
      <Cloud className="size-3" /> <T>Salvo</T>
    </span>
  );
}

/* ------------------------------- barra de ícones ------------------------------- */

function IBtn({ label, onClick, active, disabled, children, className }: { label: string; onClick?: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("grid size-8 shrink-0 place-items-center rounded-md text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-35 max-md:size-11 [&_svg]:size-4", active && "bg-muted text-brand", className)}
    >
      {children}
    </button>
  );
}
const ISep = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

export function IconBar({ api }: { api: Api }) {
  const e = api.canEdit;
  const s = api.state;
  return (
    <div className="thin-scroll flex items-center gap-0.5 overflow-x-auto border-b bg-background px-2 py-1" role="toolbar" aria-label="Formatação">
      <IBtn label={`Desfazer (${MOD}Z)`} onClick={api.undo} disabled={!e || !api.canUndo}>
        <Undo2 />
      </IBtn>
      <IBtn label={`Refazer (${MOD}Y)`} onClick={api.redo} disabled={!e || !api.canRedo}>
        <Redo2 />
      </IBtn>
      <IBtn label="Imprimir" onClick={api.print}>
        <Printer />
      </IBtn>
      <ISep />
      <IBtn label="Formatar como moeda (R$)" onClick={() => api.setFmt("brl:2")} disabled={!e} active={s.fmtKind === "brl"}>
        <DollarSign />
      </IBtn>
      <IBtn label="Formatar como porcentagem" onClick={() => api.setFmt("pct:2")} disabled={!e} active={s.fmtKind === "pct"}>
        <Percent />
      </IBtn>
      <IBtn label="Diminuir casas decimais" onClick={() => api.decimals(-1)} disabled={!e}>
        <DecimalsArrowLeft />
      </IBtn>
      <IBtn label="Aumentar casas decimais" onClick={() => api.decimals(1)} disabled={!e}>
        <DecimalsArrowRight />
      </IBtn>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={!e} aria-label="Mais formatos" title="Mais formatos" className="flex h-8 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-[12px] hover:bg-muted disabled:opacity-35 max-md:h-11 max-md:min-w-11 max-md:justify-center">
            123 <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" onCloseAutoFocus={(ev) => { ev.preventDefault(); api.focusGrid(); }}>
          <DropdownMenuLabel>Formato numérico</DropdownMenuLabel>
          {FORMATS.map((f) => (
            <DropdownMenuItem key={f.key || "auto"} onClick={() => api.setFmt(f.key)}>
              <span className="flex-1">{f.label}</span>
              <span className="text-xs text-muted-foreground">{f.example}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ISep />
      <select
        aria-label="Tamanho da fonte"
        disabled={!e}
        value={s.fs}
        onChange={(ev) => {
          api.fontSize(Number(ev.target.value));
          api.focusGrid();
        }}
        className="h-8 w-14 shrink-0 rounded-md border border-transparent bg-transparent px-1 text-[12.5px] hover:border-border disabled:opacity-35 max-md:h-11 max-md:w-16 max-md:text-base"
      >
        {FONT_SIZES.includes(s.fs) ? null : <option value={s.fs}>{s.fs}</option>}
        {FONT_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <ISep />
      <IBtn label={`Negrito (${MOD}B)`} onClick={() => api.toggle("b")} disabled={!e} active={s.b}>
        <Bold />
      </IBtn>
      <IBtn label={`Itálico (${MOD}I)`} onClick={() => api.toggle("i")} disabled={!e} active={s.i}>
        <Italic />
      </IBtn>
      <IBtn label={`Sublinhado (${MOD}U)`} onClick={() => api.toggle("u")} disabled={!e} active={s.u}>
        <Underline />
      </IBtn>
      <IBtn label="Tachado" onClick={() => api.toggle("st")} disabled={!e} active={s.st}>
        <Strikethrough />
      </IBtn>
      <ColorPicker label="Cor do texto" onPick={(c) => api.color("c", c)} onClosed={api.focusGrid}>
        <button type="button" disabled={!e} title="Cor do texto" aria-label="Cor do texto" className="relative grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted disabled:opacity-35 max-md:size-11">
          <Baseline className="size-4" />
          <span className="absolute bottom-1 h-[3px] w-4 rounded-full" style={{ background: s.textColor || "currentColor" }} />
        </button>
      </ColorPicker>
      <ColorPicker label="Cor de preenchimento" allowNone onPick={(c) => api.color("bg", c)} onClosed={api.focusGrid}>
        <button type="button" disabled={!e} title="Cor de preenchimento" aria-label="Cor de preenchimento" className="relative grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted disabled:opacity-35 max-md:size-11">
          <PaintBucket className="size-4" />
          <span className="absolute bottom-1 h-[3px] w-4 rounded-full border border-black/10" style={{ background: s.fillColor || "transparent" }} />
        </button>
      </ColorPicker>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={!e} title="Bordas" aria-label="Bordas" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted disabled:opacity-35 max-md:size-11">
            <Grid3x3 className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={(ev) => { ev.preventDefault(); api.focusGrid(); }}>
          <BorderItems api={api} />
        </DropdownMenuContent>
      </DropdownMenu>
      <IBtn label="Mesclar células" onClick={() => api.merge("all")} disabled={!e}>
        <TableCellsMerge />
      </IBtn>
      <ISep />
      <IBtn label="Alinhar à esquerda" onClick={() => api.align("l")} disabled={!e} active={s.al === "l"}>
        <AlignLeft />
      </IBtn>
      <IBtn label="Centralizar" onClick={() => api.align("c")} disabled={!e} active={s.al === "c"}>
        <AlignCenter />
      </IBtn>
      <IBtn label="Alinhar à direita" onClick={() => api.align("r")} disabled={!e} active={s.al === "r"}>
        <AlignRight />
      </IBtn>
      <IBtn label="Quebrar texto" onClick={api.wrap} disabled={!e} active={s.wrap}>
        <WrapText />
      </IBtn>
      <ISep />
      <IBtn label="Filtro" onClick={api.filter} disabled={!e} active={s.filterOn}>
        <Filter />
      </IBtn>
      <IBtn label="Limpar formatação" onClick={api.clearFormat} disabled={!e}>
        <RemoveFormatting />
      </IBtn>
    </div>
  );
}

/* ------------------------------- barra de fórmulas ------------------------------- */

export function FormulaBar({
  nameBox,
  onGoto,
  value,
  editing,
  onFocus,
  onChange,
  onKeyDown,
  onBlur,
  disabled,
  inputRef,
  active,
  onCommit,
  onCancel,
  toolsOpen,
  onToggleTools,
  selectMode,
  onToggleSelect,
}: {
  nameBox: string;
  onGoto: (text: string) => void;
  value: string;
  editing: boolean;
  onFocus: () => void;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** há uma edição em andamento (célula ou barra): mostra ✓ e ✕ no celular */
  active: boolean;
  onCommit: () => void;
  onCancel: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  selectMode: boolean;
  onToggleSelect: () => void;
}) {
  const [nb, setNb] = useState<string | null>(null);
  return (
    <div className="flex items-center border-b bg-background">
      <input
        aria-label="Caixa de nome (endereço da célula)"
        value={nb ?? nameBox}
        onFocus={(e) => {
          setNb(nameBox);
          e.currentTarget.select();
        }}
        onChange={(e) => setNb(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onGoto(nb ?? "");
            setNb(null);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setNb(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => setNb(null)}
        className="h-8 w-24 shrink-0 border-r bg-transparent px-2 text-center text-[12.5px] outline-none focus:bg-muted max-md:h-11 max-md:w-[4.5rem] max-md:px-1 max-md:text-base"
      />
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center border-r text-[12px] font-semibold text-muted-foreground italic max-md:h-11">
        fx
      </span>
      <input
        ref={inputRef}
        aria-label="Barra de fórmulas"
        value={value}
        disabled={disabled}
        readOnly={disabled}
        spellCheck={false}
        autoComplete="off"
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        enterKeyHint="done"
        className={cn("h-8 min-w-0 flex-1 bg-transparent px-2 text-[13px] outline-none max-md:h-11 max-md:text-base", editing && "bg-background")}
      />
      {active ? (
        <div className="flex shrink-0 items-center md:hidden">
          <button type="button" aria-label="Cancelar edição" onMouseDown={(e) => e.preventDefault()} onClick={onCancel} className="grid size-11 place-items-center text-muted-foreground">
            <X className="size-5" />
          </button>
          <button type="button" aria-label="Confirmar edição" onMouseDown={(e) => e.preventDefault()} onClick={onCommit} className="grid size-11 place-items-center text-brand">
            <Check className="size-5" />
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center md:hidden">
          {!disabled && (
            <button type="button" aria-label={selectMode ? "Desativar seleção de intervalo" : "Selecionar intervalo arrastando"} aria-pressed={selectMode} onClick={onToggleSelect} className={cn("grid size-11 place-items-center", selectMode ? "bg-brand/15 text-brand" : "text-muted-foreground")}>
              <BoxSelect className="size-5" />
            </button>
          )}
          <button type="button" aria-label={toolsOpen ? "Ocultar ferramentas de formatação" : "Mostrar ferramentas de formatação"} aria-pressed={toolsOpen} onClick={onToggleTools} className={cn("grid size-11 place-items-center", toolsOpen ? "bg-muted text-foreground" : "text-muted-foreground")}>
            <Type className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- abas ------------------------------- */

export type TabInfo = { id: string; name: string };

export function TabsBar({
  tabs,
  active,
  canEdit,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
  onReorder,
}: {
  tabs: TabInfo[];
  active: string;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReorder: (from: string, to: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const drag = useRef<string | null>(null);
  return (
    <div className="flex items-center gap-1 border-t bg-card px-2 py-1 max-md:py-0.5" role="tablist" aria-label="Abas da planilha">
      {canEdit && (
        <button type="button" onClick={onAdd} title="Nova aba" aria-label="Nova aba" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted max-md:size-11">
          <Plus className="size-4" />
        </button>
      )}
      <div className="thin-scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={isActive}
              draggable={canEdit && renaming !== t.id}
              onDragStart={() => (drag.current = t.id)}
              onDragOver={(e) => drag.current && e.preventDefault()}
              onDrop={() => {
                if (drag.current && drag.current !== t.id) onReorder(drag.current, t.id);
                drag.current = null;
              }}
              className={cn("group flex shrink-0 items-center rounded-md text-[13px]", isActive ? "bg-background font-medium text-brand shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted")}
            >
              {renaming === t.id ? (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => {
                    onRename(t.id, name);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  aria-label="Nome da aba"
                  className="h-8 w-32 rounded-md border bg-background px-2 outline-none max-md:h-11 max-md:text-base"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  onDoubleClick={() => {
                    if (!canEdit) return;
                    setName(t.name);
                    setRenaming(t.id);
                  }}
                  className="h-8 max-w-48 truncate px-3 max-md:h-11 max-md:max-w-40"
                >
                  {t.name}
                </button>
              )}
              {canEdit && isActive && renaming !== t.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Opções da aba ${t.name}`} className="mr-1 grid size-6 place-items-center rounded hover:bg-muted max-md:size-11">
                      <ChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="max-md:[&_[role=menuitem]]:min-h-11">
                    <DropdownMenuItem
                      onClick={() => {
                        setName(t.name);
                        setRenaming(t.id);
                      }}
                    >
                      Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(t.id)}>Duplicar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMove(t.id, -1)}>Mover para a esquerda</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMove(t.id, 1)}>Mover para a direita</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" disabled={tabs.length < 2} onClick={() => onDelete(t.id)}>
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
