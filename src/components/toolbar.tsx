/**
 * PageToolbar — barra de ferramentas padrão de cada tela (substitui o PageHeader grande).
 *
 * Compacta (h-12), fixa no topo da área de conteúdo (logo abaixo da barra superior do app),
 * com o título curto à esquerda e, centralizados, filtros/buscas/alternadores de visão e ações.
 * Em telas estreitas o miolo rola na horizontal (sem estourar a largura da página).
 *
 * API:
 *   <PageToolbar
 *     title="Planilhas"                 // título curto (obrigatório)
 *     filters={<>…busca, selects, alternador de visão…</>}   // opcional
 *     actions={<Button>Novo</Button>}   // opcional (botões; ficam depois dos filtros)
 *     tabs={<FinanceNav />}             // opcional: segunda linha (abas do módulo)
 *   />
 *
 * Para a ferramenta ocupar o resto da tela, envolva o conteúdo em <ToolArea>:
 *   <PageToolbar … />
 *   <ToolArea>…</ToolArea>      // altura útil = 100dvh − barra superior − barra de ferramentas
 *   <ToolArea scroll={false}>   // quando a ferramenta cuida da própria rolagem (kanban, chat)
 *
 * Use <ToolbarSep /> entre grupos de controles e <ToolbarGroup> para agrupar (segmentados).
 * data-tour: "page-header" na barra e "page-actions" no grupo de ações (tours funcionam).
 */
import { cn } from "@/lib/utils";

export function PageToolbar({
  title,
  filters,
  actions,
  tabs,
  className,
}: {
  title: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-tour="page-header" className={cn("sticky top-14 z-20 border-b bg-background", className)}>
      <div className="flex min-h-12 items-center gap-3 px-3 sm:px-5">
        <h1 className="shrink-0 text-[15px] font-semibold tracking-tight whitespace-nowrap">{title}</h1>
        {(filters || actions) && (
          <div className="thin-scroll min-w-0 flex-1 overflow-x-auto py-1.5">
            <div className="flex w-max min-w-full items-center justify-center gap-2 [&_button]:shrink-0 [&_input]:shrink-0">
              {filters}
              {filters && actions && <ToolbarSep />}
              {actions && (
                <div data-tour="page-actions" className="flex items-center gap-2">
                  {actions}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {tabs}
    </div>
  );
}

export function ToolbarSep() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

export function ToolbarGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex shrink-0 items-center gap-1 rounded-lg border bg-card p-0.5", className)}>{children}</div>;
}

/** Área da ferramenta: ocupa a altura útil restante. `scroll={false}` deixa a rolagem para dentro da ferramenta. */
export function ToolArea({ children, scroll = true, className }: { children: React.ReactNode; scroll?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 md:h-[calc(100dvh-7rem)]",
        scroll ? "md:overflow-y-auto" : "flex h-[calc(100dvh-7rem-4.25rem-env(safe-area-inset-bottom))] flex-col overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
