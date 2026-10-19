"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, FileSpreadsheet, Loader2, Plus, Save, Trash2, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  centsToBr,
  parseClipboardTable,
  parseCsv,
  parseDateFlexible,
  parseKind,
  parseMoneyFlexible,
  tableToRows,
  type ImportIssue,
  type SheetRow,
} from "@/lib/csv";
import { saveSheet, type SaveRow } from "./actions";

type Status = "clean" | "new" | "dirty" | "deleted";
type G = {
  key: string;
  id?: string;
  due: string;
  kind: "receita" | "despesa";
  description: string;
  category: string;
  amount: string;
  paidAt: string;
  contact: string;
  deal: string;
  notes: string;
  status: Status;
  error?: string;
  orig?: string;
};
type Field = "due" | "kind" | "description" | "category" | "amount" | "paidAt" | "contact" | "deal" | "notes";

const COLS: { k: Field; label: string; w: string; type: "date" | "select" | "text" | "money"; list?: string }[] = [
  { k: "due", label: "Vencimento", w: "w-[132px]", type: "date" },
  { k: "kind", label: "Tipo", w: "w-[112px]", type: "select" },
  { k: "description", label: "Descrição", w: "w-[270px]", type: "text" },
  { k: "category", label: "Categoria", w: "w-[170px]", type: "text", list: "dl-cat" },
  { k: "amount", label: "Valor (R$)", w: "w-[124px]", type: "money" },
  { k: "paidAt", label: "Pago em", w: "w-[140px]", type: "date" },
  { k: "contact", label: "Cliente / fornecedor", w: "w-[190px]", type: "text", list: "dl-contact" },
  { k: "deal", label: "Negócio", w: "w-[210px]", type: "text", list: "dl-deal" },
  { k: "notes", label: "Observações", w: "w-[230px]", type: "text" },
];

/** chaves únicas das linhas novas (só precisam ser únicas durante a sessão) */
let SEQ = 0;
const newKey = () => `n${++SEQ}`;

const snap = (g: G) =>
  JSON.stringify([g.due, g.kind, g.description.trim(), g.category.trim(), parseMoneyFlexible(g.amount) ?? g.amount, g.paidAt, g.contact.trim(), g.deal.trim(), g.notes.trim()]);

const fromRow = (r: SheetRow, key: string): G => {
  const g: G = { key, id: r.id, due: r.due, kind: r.kind, description: r.description, category: r.category, amount: centsToBr(r.amountCents), paidAt: r.paidAt, contact: r.contact, deal: r.deal, notes: r.notes, status: "clean" };
  g.orig = snap(g);
  return g;
};

const withStatus = (g: G): G => (g.status === "deleted" ? g : { ...g, status: g.id ? (snap(g) === g.orig ? "clean" : "dirty") : "new" });

/** Validação de conforto no navegador (o servidor valida de novo). */
function problem(g: G): string | null {
  if (!g.description.trim()) return "sem descrição";
  if (!g.due) return "sem vencimento";
  const c = parseMoneyFlexible(g.amount);
  if (c === null || c <= 0) return "valor inválido";
  return null;
}

/* ---------------- linha (memorizada: digitar não redesenha a planilha toda) ---------------- */

const RowView = memo(function RowView({
  g,
  i,
  canEdit,
  canDelete,
  onField,
  onBlurAmount,
  onDup,
  onDel,
  onKey,
}: {
  g: G;
  i: number;
  canEdit: boolean;
  canDelete: boolean;
  onField: (key: string, f: Field, v: string) => void;
  onBlurAmount: (key: string) => void;
  onDup: (key: string) => void;
  onDel: (key: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
}) {
  const del = g.status === "deleted";
  const input = "h-10 w-full bg-transparent px-2 text-base outline-none focus:bg-brand-soft focus:ring-1 focus:ring-brand focus:ring-inset md:h-9 md:text-[13px] read-only:cursor-default";
  return (
    <tr className={cn("group/row [content-visibility:auto] [contain-intrinsic-size:auto_40px]", del && "opacity-45 [&_input]:line-through")} title={g.error}>
      <td className={cn("sticky left-0 z-10 border-r border-b bg-card px-1.5", g.error && "bg-destructive/10")}>
        <div className="flex items-center gap-1">
          <span className="size-2 shrink-0 rounded-full" style={{ background: g.kind === "receita" ? "var(--fin-in)" : "var(--fin-out)" }} aria-hidden />
          <span className="hidden w-6 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums md:inline">{i + 1}</span>
          {canEdit && (
            <>
              <button type="button" aria-label={`Duplicar linha ${i + 1}`} title="Duplicar" onClick={() => onDup(g.key)} className="grid size-8 place-items-center rounded md:size-7 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Copy className="size-3.5" />
              </button>
              {(canDelete || !g.id) && (
                <button type="button" aria-label={del ? `Desfazer exclusão da linha ${i + 1}` : `Excluir linha ${i + 1}`} title={del ? "Desfazer" : "Excluir"} onClick={() => onDel(g.key)} className="grid size-8 place-items-center rounded md:size-7 text-muted-foreground hover:bg-muted hover:text-destructive">
                  {del ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                </button>
              )}
            </>
          )}
        </div>
      </td>
      {COLS.map((c, j) => (
        <td key={c.k} className={cn("border-r border-b p-0", c.w, g.status === "dirty" && "bg-brand-soft/40", g.status === "new" && "bg-fin-in/5", g.error && "bg-destructive/5")}>
          {c.type === "select" ? (
            <select
              data-r={i}
              data-c={j}
              aria-label={`${c.label} da linha ${i + 1}`}
              value={g.kind}
              disabled={!canEdit || del}
              onChange={(e) => onField(g.key, "kind", e.target.value)}
              onKeyDown={onKey}
              className={cn(input, "appearance-none")}
            >
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </select>
          ) : (
            <input
              data-r={i}
              data-c={j}
              aria-label={`${c.label} da linha ${i + 1}`}
              type={c.type === "date" ? "date" : "text"}
              inputMode={c.type === "money" ? "decimal" : undefined}
              list={c.list}
              value={g[c.k]}
              readOnly={!canEdit || del}
              onChange={(e) => onField(g.key, c.k, e.target.value)}
              onBlur={c.type === "money" ? () => onBlurAmount(g.key) : undefined}
              onKeyDown={onKey}
              placeholder={c.k === "amount" ? "0,00" : undefined}
              className={cn(input, c.type === "money" && "text-right tabular-nums")}
              autoComplete="off"
            />
          )}
        </td>
      ))}
    </tr>
  );
});

/* ---------------- importação de CSV ---------------- */

async function readFileText(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf); // Excel "CSV (delimitado por vírgulas)" salva em ANSI
  }
}

function ImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (v: boolean) => void; onImport: (rows: SheetRow[]) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const parsed = useMemo(() => (text.trim() ? tableToRows(parseCsv(text)) : null), [text]);
  const reset = () => {
    setText("");
    setFileName("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-normal">Importar CSV</DialogTitle>
          <DialogDescription>
            Aceita arquivos do Excel e do Google Sheets (vírgula, ponto e vírgula ou tabulação). As linhas entram na planilha para você revisar — só são gravadas quando você tocar em Salvar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-[13px] hover:border-brand/50">
            <Upload className="size-4 text-muted-foreground" />
            <span className="grid leading-tight">
              <span className="font-medium">{fileName || "Escolher arquivo .csv"}</span>
              <span className="text-[11.5px] text-muted-foreground">ou cole o conteúdo abaixo</span>
            </span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFileName(f.name);
                setText(await readFileText(f));
              }}
            />
          </label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"Vencimento;Tipo;Descrição;Valor (R$)\n05/11/2026;Receita;Sinal;1.500,00"} className="font-mono text-[12px]" />
          {parsed?.fatal && <p className="rounded-lg bg-destructive/10 p-3 text-[13px] text-destructive">{parsed.fatal}</p>}
          {parsed && !parsed.fatal && (
            <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-[13px]">
              <p>
                <strong className="num">{parsed.rows.length}</strong> linha(s) prontas para importar
                {parsed.issues.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-destructive">{parsed.issues.length} com problema (serão ignoradas)</span>
                  </>
                )}
              </p>
              {parsed.issues.length > 0 && (
                <ul className="grid max-h-28 gap-1 overflow-y-auto text-[12px] text-muted-foreground">
                  {parsed.issues.slice(0, 12).map((it: ImportIssue, i: number) => (
                    <li key={i}>{it.line ? `Linha ${it.line}: ` : ""}{it.message}</li>
                  ))}
                  {parsed.issues.length > 12 && <li>… e mais {parsed.issues.length - 12}.</li>}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" asChild className="mr-auto">
              <a href="/financeiro/exportar?modelo=1&formato=br" download>
                <Download /> Baixar modelo
              </a>
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!parsed || !!parsed.fatal || parsed.rows.length === 0}
              onClick={() => {
                if (!parsed) return;
                onImport(parsed.rows);
                onOpenChange(false);
                reset();
              }}
            >
              Adicionar à planilha
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- a planilha ---------------- */

export function Sheet({
  rows,
  canEdit,
  canDelete,
  defaultDue,
  categories,
  contacts,
  deals,
  exportQuery,
}: {
  rows: SheetRow[];
  canEdit: boolean;
  canDelete: boolean;
  defaultDue: string;
  categories: string[];
  contacts: string[];
  deals: string[];
  /** ex.: "m=2026-10" — repassado ao link de exportação */
  exportQuery: string;
}) {
  const router = useRouter();
  const [grid, setGrid] = useState<G[]>(() => rows.map((r) => fromRow(r, r.id ?? newKey())));
  const [importOpen, setImportOpen] = useState(false);
  const [pending, start] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  const changes = grid.filter((g) => g.status !== "clean" && !(g.status === "deleted" && !g.id)).length;

  useEffect(() => {
    if (!changes) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [changes]);

  const focusCell = useCallback((r: number, c: number) => {
    setTimeout(() => wrapRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus(), 0);
  }, []);

  const blank = useCallback((prev?: G): G => ({ key: newKey(), due: defaultDue, kind: prev?.kind ?? "receita", description: "", category: "", amount: "", paidAt: "", contact: "", deal: "", notes: "", status: "new" }), [defaultDue]);

  const onField = useCallback((key: string, f: Field, v: string) => {
    setGrid((g) => g.map((r) => (r.key === key ? withStatus({ ...r, [f]: v, error: undefined } as G) : r)));
  }, []);
  const onBlurAmount = useCallback((key: string) => {
    setGrid((g) =>
      g.map((r) => {
        if (r.key !== key) return r;
        const c = parseMoneyFlexible(r.amount);
        return c !== null && centsToBr(c) !== r.amount ? withStatus({ ...r, amount: centsToBr(c) }) : r;
      }),
    );
  }, []);
  const onDup = useCallback(
    (key: string) => {
      setGrid((g) => {
        const i = g.findIndex((r) => r.key === key);
        if (i < 0) return g;
        const copy = { ...g[i], key: newKey(), id: undefined, orig: undefined, status: "new" as Status, error: undefined };
        return [...g.slice(0, i + 1), copy, ...g.slice(i + 1)];
      });
    },
    [],
  );
  const onDel = useCallback((key: string) => {
    setGrid((g) =>
      g.flatMap((r) => {
        if (r.key !== key) return [r];
        if (!r.id) return []; // linha nova: some na hora
        return [r.status === "deleted" ? withStatus({ ...r, status: "dirty" }) : { ...r, status: "deleted" as Status }];
      }),
    );
  }, []);

  const addRow = () => {
    setGrid((g) => [...g, blank(g[g.length - 1])]);
    focusCell(grid.length, 0);
  };

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const t = e.target as HTMLElement;
      const r = Number(t.dataset.r);
      const c = Number(t.dataset.c);
      const isSelect = t.tagName === "SELECT";
      const isDate = (t as HTMLInputElement).type === "date";
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        setGrid((g) => {
          if (r + 1 < g.length) return g;
          return canEdit ? [...g, blank(g[g.length - 1])] : g;
        });
        focusCell(r + 1, c);
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        focusCell(Math.max(0, r - 1), c);
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isSelect && !isDate) {
        e.preventDefault();
        focusCell(Math.max(0, r + (e.key === "ArrowDown" ? 1 : -1)), c);
      } else if (e.key === "Escape") t.blur();
    },
    [blank, canEdit, focusCell],
  );

  // colar várias células do Excel/Google Sheets a partir da célula selecionada
  const onPaste = (e: React.ClipboardEvent) => {
    if (!canEdit) return;
    const t = e.target as HTMLElement;
    const r0 = Number(t.dataset.r);
    const c0 = Number(t.dataset.c);
    if (Number.isNaN(r0) || Number.isNaN(c0)) return;
    const text = e.clipboardData.getData("text");
    const multi = /[\t\n]/.test(text.replace(/[\r\n]+$/, ""));
    const dateCell = COLS[c0].type === "date";
    if (!multi && !dateCell) return; // colagem comum, o navegador resolve
    e.preventDefault();
    const table = parseClipboardTable(text.replace(/\r\n?/g, "\n").replace(/\n+$/, ""));
    if (!table.length) return;
    setGrid((g) => {
      const out = [...g];
      table.forEach((cells, i) => {
        const idx = r0 + i;
        while (out.length <= idx) out.push(blank(out[out.length - 1]));
        let row = { ...out[idx], error: undefined } as G;
        cells.forEach((raw, j) => {
          const col = COLS[c0 + j];
          if (!col) return;
          const v = raw.trim();
          if (col.type === "date") row = { ...row, [col.k]: v ? parseDateFlexible(v) : "" };
          else if (col.k === "kind") row = { ...row, kind: parseKind(v) ?? row.kind };
          else if (col.type === "money") {
            const c = parseMoneyFlexible(v);
            row = { ...row, amount: c !== null ? centsToBr(c) : v };
          } else row = { ...row, [col.k]: v };
        });
        out[idx] = withStatus(row);
      });
      return out;
    });
    toast.success(`${table.length} linha${table.length > 1 ? "s" : ""} colada${table.length > 1 ? "s" : ""}`);
  };

  const onImport = (imported: SheetRow[]) => {
    setGrid((g) => {
      const out = [...g];
      for (const r of imported) {
        const at = r.id ? out.findIndex((x) => x.id === r.id) : -1;
        if (at >= 0) {
          const cur = out[at];
          out[at] = withStatus({ ...fromRow(r, cur.key), orig: cur.orig, status: "dirty" });
        } else {
          const g2 = fromRow(r, newKey());
          out.push({ ...g2, orig: r.id ? undefined : undefined, status: r.id ? "dirty" : "new" });
        }
      }
      return out;
    });
    toast.success(`${imported.length} linha(s) adicionadas — revise e toque em Salvar`);
  };

  const discard = () => {
    if (changes && !window.confirm("Descartar todas as alterações não salvas?")) return;
    setGrid(rows.map((r) => fromRow(r, r.id ?? newKey())));
  };

  const save = () => {
    const live = grid.filter((g) => g.status !== "deleted");
    const bad = live.filter((g) => g.status !== "clean" && problem(g));
    if (bad.length) {
      setGrid((g) => g.map((r) => (bad.includes(r) ? { ...r, error: problem(r)! } : r)));
      toast.error(`${bad.length} linha(s) precisam de ajuste (descrição, vencimento e valor).`);
      const first = grid.findIndex((g) => bad.includes(g));
      focusCell(first, 2);
      return;
    }
    const payload: SaveRow[] = live
      .filter((g) => g.status === "new" || g.status === "dirty")
      .map((g) => ({
        key: g.key,
        id: g.id,
        due: g.due,
        kind: g.kind,
        description: g.description,
        category: g.category,
        amountCents: parseMoneyFlexible(g.amount) ?? 0,
        paidAt: g.paidAt,
        contact: g.contact,
        deal: g.deal,
        notes: g.notes,
      }));
    const deleteIds = grid.filter((g) => g.status === "deleted" && g.id).map((g) => g.id!);
    start(async () => {
      const r = await saveSheet({ rows: payload, deleteIds });
      if (!r.ok) {
        toast.error(r.error);
        if (r.errors) setGrid((g) => g.map((x) => (r.errors![x.key] ? { ...x, error: r.errors![x.key] } : x)));
        return;
      }
      const parts = [r.created && `${r.created} criado(s)`, r.updated && `${r.updated} alterado(s)`, r.deleted && `${r.deleted} excluído(s)`].filter(Boolean);
      toast.success(`Salvo: ${parts.join(", ") || "sem alterações"}`);
      const miss = [...r.unmatched.contacts.map((n) => `cliente “${n}”`), ...r.unmatched.deals.map((n) => `negócio “${n}”`)];
      if (miss.length) toast.warning(`Não encontrei no sistema: ${miss.slice(0, 4).join(", ")}${miss.length > 4 ? "…" : ""}. Os lançamentos foram salvos sem esse vínculo.`);
      router.refresh();
    });
  };

  const live = grid.filter((g) => g.status !== "deleted");
  const sum = (kind: "receita" | "despesa") => live.filter((g) => g.kind === kind).reduce((s, g) => s + (parseMoneyFlexible(g.amount) ?? 0), 0);
  const inT = sum("receita");
  const outT = sum("despesa");

  return (
    <div className="grid gap-3" ref={wrapRef}>
      <div data-tour="sheet-toolbar" className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="outline" onClick={addRow}>
            <Plus /> Linha
          </Button>
        )}
        {canEdit && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload /> Importar CSV
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <FileSpreadsheet /> Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-64">
            <DropdownMenuLabel className="label">Esta visualização</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <a href={`/financeiro/exportar?formato=br&${exportQuery}`} download>
                <Download /> Excel (Brasil) <span className="ml-auto text-[11px] text-muted-foreground">; e vírgula</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/financeiro/exportar?formato=us&${exportQuery}`} download>
                <Download /> Google Sheets / internacional <span className="ml-auto text-[11px] text-muted-foreground">, e ponto</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/financeiro/exportar?formato=br&modelo=1" download>
                <Download /> Modelo em branco
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {changes > 0 && (
            <span className="text-[12.5px] text-muted-foreground">
              {changes} alteraç{changes > 1 ? "ões" : "ão"} não salva{changes > 1 ? "s" : ""}
            </span>
          )}
          {canEdit && changes > 0 && (
            <Button variant="ghost" onClick={discard} disabled={pending}>
              <Undo2 /> Descartar
            </Button>
          )}
          {canEdit && (
            <Button onClick={save} disabled={!changes || pending} className="bg-brand text-white hover:bg-brand/90">
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          )}
        </div>
      </div>

      <div data-tour="sheet-grid" className="thin-scroll relative max-h-[68svh] overflow-auto rounded-xl border bg-card" onPaste={onPaste}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr>
              <th className="sticky left-0 z-30 border-r border-b bg-muted px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">#</th>
              {COLS.map((c) => (
                <th key={c.k} className={cn("border-r border-b px-2 py-2 text-left text-[11px] font-medium text-muted-foreground", c.w, c.type === "money" && "text-right")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((g, i) => (
              <RowView key={g.key} g={g} i={i} canEdit={canEdit} canDelete={canDelete} onField={onField} onBlurAmount={onBlurAmount} onDup={onDup} onDel={onDel} onKey={onKey} />
            ))}
            {!grid.length && (
              <tr>
                <td colSpan={COLS.length + 1} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                  Nenhum lançamento neste período.{canEdit && " Toque em “Linha”, cole do Excel/Sheets ou importe um CSV."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-muted/50 px-4 py-2.5 text-[13px]">
        <span className="text-muted-foreground">{live.length} linhas</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: "var(--fin-in)" }} /> Receitas <strong className="num">{money(inT)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: "var(--fin-out)" }} /> Despesas <strong className="num">{money(outT)}</strong>
        </span>
        <span className="ml-auto">
          Saldo{" "}
          <strong className={cn("num", inT - outT < 0 && "text-destructive")}>
            {inT - outT < 0 ? "−" : ""}
            {money(Math.abs(inT - outT))}
          </strong>
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Dica: copie células do Excel ou do Google Sheets e cole aqui — o primeiro campo colado vai para a célula selecionada e as linhas seguintes viram novos lançamentos. Enter desce, Shift+Enter sobe.
      </p>

      <datalist id="dl-cat">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="dl-contact">
        {contacts.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="dl-deal">
        {deals.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {canEdit && <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={onImport} />}
    </div>
  );
}
