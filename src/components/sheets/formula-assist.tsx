"use client";

/**
 * Ajuda de fórmulas: autocompletar de funções, dica de argumentos, teclas de símbolos (celular)
 * e a biblioteca "Inserir função" com exemplos do estúdio.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogCloseBtn } from "@/components/touch-close";
import {
  FN_CATEGORIES,
  FUNCTIONS,
  STUDIO_EXAMPLES,
  fnSyntax,
  searchFunctions,
  type FnCategory,
  type FnDef,
} from "@/lib/sheets/functions";
import { hintParts, type FormulaContext } from "@/lib/sheets/assist";

/* ------------------------- autocompletar + dica de argumentos ------------------------- */

export function FormulaAssistPanel({
  ctx,
  suggestions,
  index,
  onPick,
  onHover,
}: {
  ctx: FormulaContext;
  suggestions: FnDef[];
  index: number;
  onPick: (def: FnDef) => void;
  onHover: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[aria-selected=true]")
      ?.scrollIntoView({ block: "nearest" });
  }, [index, suggestions]);
  const show = suggestions.length > 0;
  const call = ctx.call;
  if (!show && !call) return null;
  return (
    <div
      className="pointer-events-none absolute top-0 right-0 left-0 z-40 px-2 pt-1"
      data-formula-assist
    >
      <div className="pointer-events-auto max-w-[min(34rem,100%)] rounded-lg border bg-popover text-popover-foreground shadow-lg">
        {show && (
          <div
            ref={listRef}
            role="listbox"
            aria-label="Funções sugeridas"
            className="thin-scroll max-h-56 overflow-y-auto overscroll-contain p-1"
          >
            {suggestions.map((f, i) => (
              <div
                key={f.en}
                role="option"
                aria-selected={i === index}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(f);
                }}
                onMouseMove={() => i !== index && onHover(i)}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col justify-center rounded-md px-2 py-1 md:min-h-9",
                  i === index && "bg-brand-soft",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">{f.pt}</span>
                  {f.pt !== f.en && (
                    <span className="text-[11px] text-muted-foreground">
                      {f.en}
                    </span>
                  )}
                  <span className="ml-auto text-[10.5px] text-muted-foreground">
                    {f.cat}
                  </span>
                </span>
                <span className="truncate text-[11.5px] text-muted-foreground">
                  {f.desc}
                </span>
              </div>
            ))}
            <p className="px-2 pt-1 pb-0.5 text-[10.5px] text-muted-foreground max-md:hidden">
              ↑↓ escolhe · Tab ou Enter aceita · Esc fecha
            </p>
          </div>
        )}
        {!show && call && (
          <div className="px-3 py-2" data-formula-hint>
            <p className="text-[13px] leading-snug">
              <span className="font-semibold">{call.def.pt}</span>
              <span className="text-muted-foreground">(</span>
              {hintParts(call.def, call.argIndex).map((p, i, arr) => (
                <span key={i}>
                  <span
                    className={cn(
                      p.current
                        ? "rounded bg-brand-soft px-0.5 font-semibold text-brand"
                        : "text-muted-foreground",
                      p.optional && !p.current && "italic",
                    )}
                  >
                    {p.optional ? `[${p.name}]` : p.name}
                  </span>
                  {i < arr.length - 1 && (
                    <span className="text-muted-foreground">; </span>
                  )}
                </span>
              ))}
              <span className="text-muted-foreground">)</span>
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {call.def.desc}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------- teclas de símbolos (celular) ------------------------- */

const KEYS: { label: string; ins: string; aria: string }[] = [
  { label: "=", ins: "=", aria: "igual" },
  { label: "(", ins: "(", aria: "abre parêntese" },
  { label: ")", ins: ")", aria: "fecha parêntese" },
  { label: ";", ins: ";", aria: "ponto e vírgula (separa argumentos)" },
  { label: ":", ins: ":", aria: "dois pontos (intervalo)" },
  { label: "$", ins: "$", aria: "cifrão (referência fixa)" },
  { label: "+", ins: "+", aria: "mais" },
  { label: "−", ins: "-", aria: "menos" },
  { label: "×", ins: "*", aria: "vezes" },
  { label: "÷", ins: "/", aria: "dividido" },
  { label: "%", ins: "%", aria: "porcentagem" },
  { label: ",", ins: ",", aria: "vírgula decimal" },
  { label: '"', ins: '"', aria: "aspas" },
  { label: "<", ins: "<", aria: "menor que" },
  { label: ">", ins: ">", aria: "maior que" },
  { label: "&", ins: "&", aria: "juntar textos" },
];

export function SymbolRow({
  onInsert,
  onFunctions,
}: {
  onInsert: (s: string) => void;
  onFunctions: () => void;
}) {
  return (
    <div
      className="thin-scroll flex items-center gap-1 overflow-x-auto border-b bg-muted/40 px-1.5 py-1 md:hidden"
      role="toolbar"
      aria-label="Símbolos de fórmula"
      data-symbol-row
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onFunctions}
        aria-label="Inserir função"
        className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-brand px-3 text-[15px] font-semibold text-on-brand italic"
      >
        fx
      </button>
      {KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(k.ins)}
          aria-label={k.aria}
          className="h-11 min-w-11 shrink-0 rounded-lg border bg-background text-[18px] font-medium active:bg-muted"
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------- biblioteca "Inserir função" ------------------------- */

type Tab = "lib" | "examples";

type DialogProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialTab: Tab;
  canEdit: boolean;
  onInsertFunction: (def: FnDef) => void;
  onUseFormula: (formula: string) => void;
};

export function FunctionDialog(props: DialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88dvh] flex-col gap-3 sm:max-w-2xl max-md:h-[92dvh] max-md:max-h-[92dvh]"
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-function-dialog
      >
        <FunctionBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function FunctionBody({
  onOpenChange,
  initialTab,
  canEdit,
  onInsertFunction,
  onUseFormula,
}: DialogProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FnCategory | "Todas">("Todas");
  const [openFn, setOpenFn] = useState<string | null>(null);

  const list = useMemo(() => {
    const base = q.trim() ? searchFunctions(q, 80) : FUNCTIONS;
    return cat === "Todas" ? base : base.filter((f) => f.cat === cat);
  }, [q, cat]);
  const examples = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n
      ? STUDIO_EXAMPLES.filter((e) =>
          (e.title + " " + e.desc + " " + e.formula).toLowerCase().includes(n),
        )
      : STUDIO_EXAMPLES;
  }, [q]);

  return (
    <>
      <DialogCloseBtn />
      <DialogHeader className="pr-10">
        <DialogTitle className="flex items-center gap-2">
          <Sigma className="size-5 text-brand" /> Funções de fórmula
        </DialogTitle>
        <DialogDescription>
          {FUNCTIONS.length} funções, com nome em português ou inglês. Comece
          uma fórmula com <b>=</b>, separe os argumentos com <b>;</b> e use
          vírgula nos decimais.
        </DialogDescription>
      </DialogHeader>

      <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1" role="tablist">
        {(
          [
            ["lib", "Biblioteca"],
            ["examples", "Exemplos do estúdio"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "min-h-11 flex-1 rounded-md px-3 text-sm font-medium md:min-h-9",
              tab === k ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            tab === "lib"
              ? "Buscar função (ex.: soma, procv, data)…"
              : "Buscar exemplo (ex.: BDI, estoque, prazo)…"
          }
          aria-label="Buscar"
          className="h-11 w-full rounded-lg border bg-background pr-3 pl-9 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:h-9 md:text-sm"
        />
      </div>

      {tab === "lib" && (
        <div
          className="thin-scroll -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Categorias"
        >
          {(["Todas", ...FN_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={cat === c}
              onClick={() => setCat(c)}
              className={cn(
                "min-h-11 shrink-0 rounded-full border px-3 text-[13px] md:min-h-8",
                cat === c
                  ? "border-brand bg-brand-soft font-medium text-brand"
                  : "text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border">
        {tab === "lib" ? (
          list.length ? (
            list.map((f) => {
              const isOpen = openFn === f.en;
              return (
                <div
                  key={f.en}
                  className="border-b last:border-0"
                  data-fn={f.en}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFn(isOpen ? null : f.en)}
                    aria-expanded={isOpen}
                    className="flex min-h-12 w-full flex-col justify-center px-3 py-1.5 text-left hover:bg-muted/60"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-[14px] font-semibold">{f.pt}</span>
                      {f.pt !== f.en && (
                        <span className="text-xs text-muted-foreground">
                          {f.en}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {f.cat}
                      </span>
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {f.desc}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 bg-muted/40 px-3 py-2.5 text-[13px]">
                      <p>
                        <span className="text-muted-foreground">Sintaxe: </span>
                        <code className="rounded bg-background px-1.5 py-0.5 text-[12.5px] break-words">
                          {fnSyntax(f)}
                        </code>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Exemplo: </span>
                        <code className="rounded bg-background px-1.5 py-0.5 text-[12.5px] break-words">
                          ={f.ex}
                        </code>
                        {f.out && (
                          <span className="text-muted-foreground">
                            {" "}
                            → {f.out}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            onInsertFunction(f);
                            onOpenChange(false);
                          }}
                          className="min-h-11 rounded-lg bg-brand px-4 text-sm font-medium text-on-brand disabled:opacity-40 md:min-h-9"
                        >
                          Inserir na célula
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            onUseFormula("=" + f.ex);
                            onOpenChange(false);
                          }}
                          className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-40 md:min-h-9"
                        >
                          Usar o exemplo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma função encontrada.
            </p>
          )
        ) : examples.length ? (
          examples.map((e) => (
            <div
              key={e.title}
              className="border-b px-3 py-2.5 last:border-0"
              data-example
            >
              <p className="text-[14px] font-semibold">{e.title}</p>
              <p className="text-[12.5px] text-muted-foreground">{e.desc}</p>
              <p className="mt-1">
                <code className="rounded bg-muted px-1.5 py-0.5 text-[12.5px] break-words">
                  ={e.formula}
                </code>
              </p>
              {e.note && (
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {e.note}
                </p>
              )}
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  onUseFormula("=" + e.formula);
                  onOpenChange(false);
                }}
                className="mt-1.5 min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40 md:min-h-8"
              >
                Usar na célula atual
              </button>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum exemplo encontrado.
          </p>
        )}
      </div>
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Esta planilha é somente leitura: o botão de inserir fica desativado.
        </p>
      )}
    </>
  );
}
