"use client";

/**
 * Editor de planilhas (estilo Google Sheets): estado, desfazer/refazer, autosave com controle de versão,
 * teclado, copiar/colar (TSV), preenchimento, estrutura (linhas/colunas), abas, filtro e histórico.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, SimpleSelect } from "@/components/form";
import { Book, displayFormula, offsetFormula } from "@/lib/sheets/formula";
import { FErr, formatValue, makeFmt, numToText, parseFmt, parseTyped } from "@/lib/sheets/format";
import { cellFromTyped, fillLine, parseTSV, renameTab as renameTabOp, shiftStructure, sortRange, toTSV, uniqueTabName, cloneGrid } from "@/lib/sheets/ops";
import { MAX_COLS, MAX_ROWS, addr, applyCells, colName, emptyTab, normRange, parseAddr, usedRange, type Cell, type CellStyle, type Merge, type TabData } from "@/lib/sheets/types";
import { createVersion, linkSheet, listVersions, renameSheet, restoreVersion, toggleFavorite } from "@/app/(app)/planilhas/actions";
import { FormulaBar, IconBar, MenuBar, TabsBar, type Api, type SaveStatus } from "./chrome";
import { SheetGrid, type Editing, type GridHandle } from "./grid";
import { ContextMenu, FilterPopover, type CtxItem } from "./popovers";
import { cellSel, computeLayout, currentRegion, filterHiddenRows, jumpEdge, mapRange, rangeOf, selectionStats, stepVisible, withStyle, type Range, type Sel } from "./model";
import { fmtDateTime } from "@/lib/format";

type Opt = { value: string; label: string };
type Clip = { r1: number; c1: number; cells: (Cell | undefined)[][]; tsv: string };

const BORDER = "#808080";
const norm = (s: string) => s.replace(/\r\n?/g, "\n");

function useLatest<T>(v: T) {
  const r = useRef(v);
  useLayoutEffect(() => {
    r.current = v;
  });
  return r;
}

const sameCell = (a: Cell | undefined, b: Cell | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Texto que aparece ao editar a célula (e na barra de fórmulas). */
function editTextOf(cell: Cell | undefined): string {
  if (!cell) return "";
  if (cell.f !== undefined) return "=" + displayFormula(cell.f);
  const v = cell.v;
  if (v === undefined) return "";
  if (typeof v === "boolean") return v ? "VERDADEIRO" : "FALSO";
  if (typeof v === "number") {
    const { kind } = parseFmt(cell.fmt);
    if (kind === "date" || kind === "datetime" || kind === "time" || kind === "pct" || kind === "brl") return formatValue(v, cell.fmt);
    return numToText(v);
  }
  // texto que seria lido como número/data/fórmula precisa do apóstrofo para continuar texto
  const p = parseTyped(v);
  if (cell.fmt !== "text" && (p.formula !== undefined || (p.v !== undefined && typeof p.v !== "string"))) return "'" + v;
  return v;
}

export type EditorProps = {
  sheet: { id: string; name: string; version: number; favorite: boolean; dealId: string | null; contactId: string | null };
  tabs: TabData[];
  canEdit: boolean;
  canManage: boolean;
  deals: Opt[];
  contacts: Opt[];
};

export function SheetEditor({ sheet, tabs: initialTabs, canEdit, deals, contacts }: EditorProps) {
  const router = useRouter();
  const gridRef = useRef<GridHandle>(null);
  const barRef = useRef<HTMLInputElement>(null);

  /* ----------------------------- estado das abas + histórico ----------------------------- */
  const [tabs, setTabsState] = useState<TabData[]>(initialTabs);
  const tabsRef = useRef(tabs);
  const past = useRef<TabData[][]>([]);
  const future = useRef<TabData[][]>([]);
  const dirty = useRef<Set<string>>(new Set());
  const structDirty = useRef(false);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [active, setActiveState] = useState(initialTabs[0].id);
  const activeRef = useRef(active);
  const [sel, setSelState] = useState<Sel>(cellSel(0, 0));
  const selRef = useRef(sel);
  const selByTab = useRef<Record<string, Sel>>({});
  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const clipRef = useRef<Clip | null>(null);
  const pointRef = useRef<{ start: number; end: number; ar: number; ac: number; r: number; c: number } | null>(null);
  const [name, setName] = useState(sheet.name);
  const [favorite, setFavorite] = useState(sheet.favorite);
  const [dealId, setDealId] = useState(sheet.dealId ?? "");
  const [contactId, setContactId] = useState(sheet.contactId ?? "");

  const setSel = useCallback((s: Sel) => {
    selRef.current = s;
    setSelState(s);
  }, []);
  const setEdit = useCallback((e: Editing | null) => {
    editingRef.current = e;
    setEditingState(e);
  }, []);
  const setActive = useCallback((id: string) => {
    selByTab.current[activeRef.current] = selRef.current;
    activeRef.current = id;
    setActiveState(id);
    const s = selByTab.current[id] ?? cellSel(0, 0);
    selRef.current = s;
    setSelState(s);
    editingRef.current = null;
    setEditingState(null);
  }, []);

  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const ti = tabs.indexOf(tab);

  const book = useMemo(() => {
    const b = new Book(tabs.map((t) => ({ name: t.name, grid: t.grid })));
    // calcula em ordem (evita recursão profunda em cadeias longas de fórmulas)
    let n = 0;
    for (const rk in tab.grid) n += Object.keys(tab.grid[rk]).length;
    if (n <= 60000) b.warm(tabs.indexOf(tab));
    return b;
  }, [tabs, tab]);

  const filterHidden = useMemo(() => filterHiddenRows(tab, book, ti), [tab, book, ti]);
  const layout = useMemo(
    () => computeLayout(tab, filterHidden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.rows, tab.cols, tab.rowH, tab.colW, tab.hiddenRows, tab.hiddenCols, tab.frozenRows, tab.frozenCols, filterHidden],
  );

  /* ----------------------------- salvar (autosave) ----------------------------- */
  const [status, setStatus] = useState<SaveStatus>(canEdit ? "saved" : "readonly");
  const versionRef = useRef(sheet.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const [conflict, setConflict] = useState<number | null>(null);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  function scheduleSave() {
    if (statusRef.current === "conflict") return;
    setStatus("dirty");
    statusRef.current = "dirty";
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), 1200);
  }

  async function gzip(str: string): Promise<Uint8Array | null> {
    if (typeof CompressionStream === "undefined" || str.length < 60_000) return null;
    try {
      const cs = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
      return new Uint8Array(await new Response(cs).arrayBuffer());
    } catch {
      return null;
    }
  }

  async function doSave(): Promise<void> {
    if (!canEdit) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) {
      await inflight.current;
    }
    if (statusRef.current === "conflict") return;
    if (!dirty.current.size && !structDirty.current) {
      setStatus("saved");
      return;
    }
    const run = (async () => {
      const snapshot = tabsRef.current;
      const ids = new Set(dirty.current);
      const wasStruct = structDirty.current;
      dirty.current = new Set();
      structDirty.current = false;
      setStatus("saving");
      statusRef.current = "saving";
      const payload = JSON.stringify({ base: versionRef.current, order: snapshot.map((t) => t.id), tabs: snapshot.filter((t) => ids.has(t.id)) });
      try {
        const gz = await gzip(payload);
        const res = await fetch(`/planilhas/${sheet.id}/salvar`, {
          method: "POST",
          headers: gz ? { "content-type": "application/octet-stream", "x-gzip": "1" } : { "content-type": "application/json" },
          body: gz ? (gz as unknown as BodyInit) : payload,
        });
        const data = (await res.json().catch(() => ({}))) as { version?: number; conflict?: boolean; error?: string };
        if (res.ok && data.version !== undefined) {
          versionRef.current = data.version;
          const left = dirty.current.size > 0 || structDirty.current;
          setStatus(left ? "dirty" : "saved");
          statusRef.current = left ? "dirty" : "saved";
          if (left) timer.current = setTimeout(() => void doSave(), 600);
        } else if (res.status === 409 || data.conflict) {
          ids.forEach((i) => dirty.current.add(i));
          structDirty.current ||= wasStruct;
          setConflict(data.version ?? versionRef.current);
          setStatus("conflict");
          statusRef.current = "conflict";
        } else {
          ids.forEach((i) => dirty.current.add(i));
          structDirty.current ||= wasStruct;
          setStatus("error");
          statusRef.current = "error";
          if (data.error) toast.error(data.error);
          timer.current = setTimeout(() => void doSave(), 6000);
        }
      } catch {
        ids.forEach((i) => dirty.current.add(i));
        structDirty.current ||= wasStruct;
        setStatus("error");
        statusRef.current = "error";
        timer.current = setTimeout(() => void doSave(), 6000);
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  }
  const doSaveRef = useLatest(doSave);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (statusRef.current !== "saved" && statusRef.current !== "readonly") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden") void doSaveRef.current();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [doSaveRef]);

  function markDirty(prev: TabData[], next: TabData[]) {
    const old = new Map(prev.map((t) => [t.id, t]));
    for (const t of next) if (old.get(t.id) !== t) dirty.current.add(t.id);
    if (prev.length !== next.length || prev.some((t, i) => t.id !== next[i]?.id)) structDirty.current = true;
    scheduleSave();
  }

  const commit = useCallback((fn: (t: TabData[]) => TabData[], opts: { history?: boolean } = {}) => {
    if (!canEdit) return;
    const prev = tabsRef.current;
    const next = fn(prev);
    if (next === prev) return;
    if (opts.history !== false) {
      past.current.push(prev);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      setHist({ undo: past.current.length, redo: future.current.length });
    }
    markDirty(prev, next);
    tabsRef.current = next;
    setTabsState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const setTab = useCallback(
    (fn: (t: TabData) => TabData, opts?: { history?: boolean }) =>
      commit((ts) => {
        const i = ts.findIndex((t) => t.id === activeRef.current);
        if (i < 0) return ts;
        const n = fn(ts[i]);
        if (n === ts[i]) return ts;
        const c = ts.slice();
        c[i] = n;
        return c;
      }, opts),
    [commit],
  );

  const undo = () => {
    const p = past.current.pop();
    if (!p || !canEdit) return;
    future.current.push(tabsRef.current);
    markDirty(tabsRef.current, p);
    tabsRef.current = p;
    setTabsState(p);
    if (!p.some((t) => t.id === activeRef.current)) setActive(p[0].id);
    setEdit(null);
    setHist({ undo: past.current.length, redo: future.current.length });
  };
  const redo = () => {
    const f = future.current.pop();
    if (!f || !canEdit) return;
    past.current.push(tabsRef.current);
    markDirty(tabsRef.current, f);
    tabsRef.current = f;
    setTabsState(f);
    if (!f.some((t) => t.id === activeRef.current)) setActive(f[0].id);
    setEdit(null);
    setHist({ undo: past.current.length, redo: future.current.length });
  };

  /* ----------------------------- navegação ----------------------------- */
  const go = (r: number, c: number, extend = false) => {
    const t = tabsRef.current.find((x) => x.id === activeRef.current)!;
    const rr = Math.max(0, Math.min(t.rows - 1, r));
    const cc = Math.max(0, Math.min(t.cols - 1, c));
    const s = selRef.current;
    setSel(extend ? { ...s, fr: rr, fc: cc } : cellSel(rr, cc));
    gridRef.current?.scrollToCell(rr, cc);
  };
  const growRows = () => setTab((t) => (t.rows >= MAX_ROWS ? t : { ...t, rows: Math.min(MAX_ROWS, t.rows + 1000) }), { history: false });

  const moveFrom = (r: number, c: number, dr: number, dc: number) => {
    let nr = r;
    let nc = c;
    if (dr) nr = stepVisible(layout.rowHidden, r, dr > 0 ? 1 : -1, tab.rows + (dr > 0 ? 1 : 0));
    if (dc) nc = stepVisible(layout.colHidden, c, dc > 0 ? 1 : -1, tab.cols);
    if (dr > 0 && nr >= tab.rows - 1 && tab.rows < MAX_ROWS) growRows();
    return { r: nr, c: nc };
  };

  /* ----------------------------- edição de células ----------------------------- */
  const putCells = (changes: { r: number; c: number; cell: Cell | undefined }[]) => {
    if (!changes.length) return;
    setTab((t) => {
      const grid = applyCells(t.grid, changes);
      let rows = t.rows;
      let cols = t.cols;
      for (const ch of changes) {
        if (ch.r + 1 > rows) rows = Math.min(MAX_ROWS, ch.r + 1);
        if (ch.c + 1 > cols) cols = Math.min(MAX_COLS, ch.c + 1);
      }
      return { ...t, grid, rows, cols };
    });
  };

  const applyText = (r: number, c: number, text: string) => {
    const old = tab.grid[r]?.[c];
    let cell = cellFromTyped(text, old);
    if (cell?.f && !cell.fmt) {
      if (/^(TODAY|DATE|EDATE|EOMONTH)\(/.test(cell.f)) cell = { ...cell, fmt: "date" };
      else if (/^NOW\(/.test(cell.f)) cell = { ...cell, fmt: "datetime" };
    }
    if (sameCell(old, cell)) return;
    putCells([{ r, c, cell }]);
  };

  const startEdit = (r: number, c: number, mode: "enter" | "edit", initial?: string) => {
    if (!canEdit) return;
    pointRef.current = null;
    const cell = tabsRef.current.find((x) => x.id === activeRef.current)?.grid[r]?.[c];
    setSel(cellSel(r, c));
    gridRef.current?.scrollToCell(r, c);
    setEdit({ r, c, text: initial ?? editTextOf(cell), mode });
  };

  const finishEdit = (apply: boolean, dr = 0, dc = 0) => {
    const ed = editingRef.current;
    if (!ed) return;
    setEdit(null);
    pointRef.current = null;
    if (apply) applyText(ed.r, ed.c, ed.text);
    if (dr || dc) {
      const m = moveFrom(ed.r, ed.c, dr, dc);
      go(m.r, m.c);
    }
    gridRef.current?.focusSink();
  };

  const caretOf = (ed: Editing) => {
    const el = document.activeElement;
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? (el.selectionStart ?? ed.text.length) : ed.text.length;
  };
  const canPoint = (ed: Editing, caret: number) => {
    if (!ed.text.startsWith("=")) return false;
    if (pointRef.current && caret === pointRef.current.end) return true;
    const before = ed.text.slice(0, caret).trimEnd();
    return before.length > 0 && "=(,;+-*/^&<>:".includes(before[before.length - 1]);
  };
  const insertRef = (ed: Editing, r: number, c: number, mode: "new" | "extend" | "replace") => {
    const caret = caretOf(ed);
    const p = pointRef.current;
    let start: number;
    let end: number;
    let ar: number;
    let ac: number;
    if (p && (mode === "extend" || mode === "replace") && caret === p.end) {
      start = p.start;
      end = p.end;
      ar = mode === "extend" ? p.ar : r;
      ac = mode === "extend" ? p.ac : c;
    } else {
      start = caret;
      end = caret;
      ar = r;
      ac = c;
    }
    const text1 = ar === r && ac === c ? addr(r, c) : `${addr(Math.min(ar, r), Math.min(ac, c))}:${addr(Math.max(ar, r), Math.max(ac, c))}`;
    const text = ed.text.slice(0, start) + text1 + ed.text.slice(end);
    pointRef.current = { start, end: start + text1.length, ar, ac, r, c };
    setEdit({ ...ed, text });
    const pos = start + text1.length;
    requestAnimationFrame(() => {
      const el = document.activeElement;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.setSelectionRange(pos, pos);
    });
  };

  const onPoint = (r: number, c: number, phase: "start" | "move") => {
    const ed = editingRef.current;
    if (!ed || !ed.text.startsWith("=")) return false;
    if (phase === "start") {
      if (!canPoint(ed, caretOf(ed))) return false;
      insertRef(ed, r, c, pointRef.current && caretOf(ed) === pointRef.current.end ? "replace" : "new");
      return true;
    }
    if (!pointRef.current) return false;
    insertRef(ed, r, c, "extend");
    return true;
  };

  const onEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const ed = editingRef.current;
    if (!ed) return;
    const k = e.key;
    if (e.nativeEvent.isComposing) return;
    if (k === "Enter" && e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const a = el.selectionStart ?? ed.text.length;
      const b = el.selectionEnd ?? a;
      const text = ed.text.slice(0, a) + "\n" + ed.text.slice(b);
      setEdit({ ...ed, text });
      requestAnimationFrame(() => el.setSelectionRange(a + 1, a + 1));
      return;
    }
    if (k === "Enter") {
      e.preventDefault();
      finishEdit(true, e.shiftKey ? -1 : 1, 0);
    } else if (k === "Tab") {
      e.preventDefault();
      finishEdit(true, 0, e.shiftKey ? -1 : 1);
    } else if (k === "Escape") {
      e.preventDefault();
      finishEdit(false);
    } else if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
      const dr = k === "ArrowUp" ? -1 : k === "ArrowDown" ? 1 : 0;
      const dc = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0;
      const caret = e.currentTarget.selectionStart ?? ed.text.length;
      if (ed.text.startsWith("=") && ed.mode !== "bar" && canPoint(ed, caret)) {
        e.preventDefault();
        const from = pointRef.current && caret === pointRef.current.end ? { r: pointRef.current.r, c: pointRef.current.c } : { r: ed.r, c: ed.c };
        insertRef(ed, Math.max(0, from.r + dr), Math.max(0, from.c + dc), "replace");
      } else if (ed.mode === "enter" && !e.shiftKey) {
        e.preventDefault();
        finishEdit(true, dr, dc);
      }
    }
  };

  /* ----------------------------- área de transferência ----------------------------- */
  const buildClip = (): Clip => {
    const rg = rangeOf(selRef.current);
    const used = usedRange(tab.grid);
    const r2 = Math.min(rg.r2, Math.max(rg.r1, used.rows - 1), rg.r1 + 100000);
    const c2 = Math.min(rg.c2, Math.max(rg.c1, used.cols - 1));
    const cells: (Cell | undefined)[][] = [];
    const text: string[][] = [];
    for (let r = rg.r1; r <= r2; r++) {
      const row: (Cell | undefined)[] = [];
      const trow: string[] = [];
      for (let c = rg.c1; c <= c2; c++) {
        const cell = tab.grid[r]?.[c];
        row.push(cell);
        trow.push(cell ? formatValue(book.get(ti, r, c), cell.fmt) : "");
      }
      cells.push(row);
      text.push(trow);
    }
    return { r1: rg.r1, c1: rg.c1, cells, tsv: toTSV(text) };
  };

  const clearContent = () => {
    const rg = rangeOf(selRef.current);
    const g = mapRange(tab, rg, (cell) => (cell ? { ...cell, v: undefined, f: undefined } : cell));
    setTab((t) => ({ ...t, grid: g }));
  };

  const doCopy = (cut: boolean, data?: DataTransfer | null) => {
    const clip = buildClip();
    clipRef.current = clip;
    if (data) data.setData("text/plain", clip.tsv);
    else void navigator.clipboard?.writeText(clip.tsv).catch(() => toast.error("O navegador bloqueou a área de transferência. Use Ctrl+C."));
    if (cut && canEdit) clearContent();
  };

  const doPaste = (raw: string, valuesOnly: boolean) => {
    if (!canEdit) return;
    const text = norm(raw);
    const rg = rangeOf(selRef.current);
    const clip = clipRef.current;
    const changes: { r: number; c: number; cell: Cell | undefined }[] = [];
    let rows = 0;
    let cols = 0;
    if (clip && norm(clip.tsv) === text) {
      rows = clip.cells.length;
      cols = clip.cells[0]?.length ?? 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const src = clip.cells[i][j];
          const r = rg.r1 + i;
          const c = rg.c1 + j;
          if (r >= MAX_ROWS || c >= MAX_COLS) continue;
          const dest = tab.grid[r]?.[c];
          if (valuesOnly) {
            const val = src ? book.get(ti, clip.r1 + i, clip.c1 + j) : null;
            changes.push({ r, c, cell: { ...(dest ?? {}), v: val === null || val instanceof FErr ? undefined : val, f: undefined, fmt: src?.fmt ?? dest?.fmt } });
          } else {
            changes.push({ r, c, cell: src ? (src.f !== undefined ? { ...src, f: offsetFormula(src.f, r - (clip.r1 + i), c - (clip.c1 + j)) } : src) : undefined });
          }
        }
      }
    } else {
      const matrix = parseTSV(text);
      if (matrix.length && matrix[matrix.length - 1].length === 1 && matrix[matrix.length - 1][0] === "" && matrix.length > 1) matrix.pop();
      rows = matrix.length;
      cols = Math.max(0, ...matrix.map((r) => r.length));
      if (rows * cols > 300000) {
        toast.error("Colagem grande demais.");
        return;
      }
      if (rows === 1 && cols === 1 && (rg.r2 > rg.r1 || rg.c2 > rg.c1)) {
        // um valor só sobre uma seleção: preenche tudo
        for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 20000); r++) for (let c = rg.c1; c <= rg.c2; c++) changes.push({ r, c, cell: cellFromTyped(matrix[0][0], tab.grid[r]?.[c]) });
        rows = rg.r2 - rg.r1 + 1;
        cols = rg.c2 - rg.c1 + 1;
      } else {
        for (let i = 0; i < rows; i++)
          for (let j = 0; j < matrix[i].length; j++) {
            const r = rg.r1 + i;
            const c = rg.c1 + j;
            if (r >= MAX_ROWS || c >= MAX_COLS) continue;
            changes.push({ r, c, cell: cellFromTyped(matrix[i][j], tab.grid[r]?.[c]) });
          }
      }
    }
    putCells(changes);
    setSel({ ar: rg.r1, ac: rg.c1, fr: Math.min(MAX_ROWS - 1, rg.r1 + rows - 1), fc: Math.min(MAX_COLS - 1, rg.c1 + cols - 1) });
  };

  const pasteFromClipboard = async (valuesOnly = false) => {
    try {
      const text = await navigator.clipboard.readText();
      doPaste(text, valuesOnly);
    } catch {
      toast.message("Para colar, use Ctrl+V (o navegador não liberou o acesso à área de transferência).");
    }
  };

  /* ----------------------------- estilos e formatos ----------------------------- */
  const forSel = (fn: (cell: Cell | undefined, r: number, c: number) => Cell | undefined) => {
    const rg = rangeOf(selRef.current);
    const g = mapRange(tab, rg, fn, 30000);
    setTab((t) => ({ ...t, grid: g }));
  };
  const active0 = tab.grid[sel.ar]?.[sel.ac];
  const styleOfActive = active0?.s ?? {};

  const toggle = (k: "b" | "i" | "u" | "st") => {
    const on = !!styleOfActive[k];
    forSel((cell) => withStyle(cell, { [k]: on ? undefined : 1 } as Partial<CellStyle>));
  };
  const setStyle = (patch: Partial<CellStyle>) => forSel((cell) => withStyle(cell, patch));
  const setFmt = (f: string) =>
    forSel((cell) => {
      const out = { ...(cell ?? {}) } as Cell;
      if (f) out.fmt = f;
      else delete out.fmt;
      return out;
    });
  const decimals = (d: 1 | -1) => {
    const { kind, d: cur } = parseFmt(active0?.fmt);
    const v = book.get(ti, sel.ar, sel.ac);
    let nk = kind;
    let n = cur;
    if (!["n", "brl", "pct"].includes(kind)) {
      nk = "n";
      n = typeof v === "number" ? (/,(\d+)$/.exec(numToText(v))?.[1].length ?? 0) : 0;
    }
    setFmt(makeFmt(nk, Math.max(0, Math.min(10, n + d))));
  };
  const applyBorders = (mode: "all" | "outer" | "none" | "top" | "bottom" | "left" | "right" | "inner") => {
    const rg = rangeOf(selRef.current);
    const changes: { r: number; c: number; cell: Cell | undefined }[] = [];
    const set = (r: number, c: number, patch: Partial<CellStyle>) => {
      const base = changes.find((x) => x.r === r && x.c === c)?.cell ?? tab.grid[r]?.[c];
      const cell = withStyle(base, patch);
      const idx = changes.findIndex((x) => x.r === r && x.c === c);
      if (idx >= 0) changes[idx] = { r, c, cell };
      else changes.push({ r, c, cell });
    };
    const rr2 = Math.min(rg.r2, rg.r1 + 5000);
    for (let r = rg.r1; r <= rr2; r++)
      for (let c = rg.c1; c <= rg.c2; c++) {
        const top = r === rg.r1;
        const bottom = r === rr2;
        const left = c === rg.c1;
        const right = c === rg.c2;
        if (mode === "all") set(r, c, { bt: BORDER, bb: BORDER, bl: BORDER, br: BORDER });
        else if (mode === "none") set(r, c, { bt: undefined, bb: undefined, bl: undefined, br: undefined });
        else if (mode === "outer") {
          if (top) set(r, c, { bt: BORDER });
          if (bottom) set(r, c, { bb: BORDER });
          if (left) set(r, c, { bl: BORDER });
          if (right) set(r, c, { br: BORDER });
        } else if (mode === "inner") {
          if (!top) set(r, c, { bt: BORDER });
          if (!bottom) set(r, c, { bb: BORDER });
          if (!left) set(r, c, { bl: BORDER });
          if (!right) set(r, c, { br: BORDER });
        } else if (mode === "top" && top) set(r, c, { bt: BORDER });
        else if (mode === "bottom" && bottom) set(r, c, { bb: BORDER });
        else if (mode === "left" && left) set(r, c, { bl: BORDER });
        else if (mode === "right" && right) set(r, c, { br: BORDER });
      }
    setTab((t) => ({ ...t, grid: applyCells(t.grid, changes) }));
  };

  const mergeCells = (mode: "all" | "h" | "v" | "none") => {
    const rg = rangeOf(selRef.current);
    setTab((t) => {
      const rest = t.merges.filter((m) => m.r2 < rg.r1 || m.r1 > rg.r2 || m.c2 < rg.c1 || m.c1 > rg.c2);
      if (mode === "none") return { ...t, merges: rest };
      const added: Merge[] = [];
      if (mode === "all") added.push({ r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2 });
      else if (mode === "h") for (let r = rg.r1; r <= rg.r2; r++) added.push({ r1: r, c1: rg.c1, r2: r, c2: rg.c2 });
      else for (let c = rg.c1; c <= rg.c2; c++) added.push({ r1: rg.r1, c1: c, r2: rg.r2, c2: c });
      const valid = added.filter((m) => m.r1 !== m.r2 || m.c1 !== m.c2);
      if (!valid.length) return t;
      const changes: { r: number; c: number; cell: Cell | undefined }[] = [];
      for (const m of valid) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) if (t.grid[r]?.[c]) changes.push({ r, c, cell: t.grid[r][c].s ? { s: t.grid[r][c].s } : undefined });
      return { ...t, merges: [...rest, ...valid], grid: applyCells(t.grid, changes) };
    });
  };

  /* ----------------------------- estrutura ----------------------------- */
  const selRows = () => {
    const rg = rangeOf(selRef.current);
    return { at: rg.r1, n: rg.r2 - rg.r1 + 1, rg };
  };
  const insertRows = (where: "above" | "below") => {
    const { at, n, rg } = selRows();
    if (tab.rows + n > MAX_ROWS) return toast.error("Limite de linhas atingido.");
    commit((ts) => shiftStructure(ts, ti, "row", where === "above" ? at : rg.r2 + 1, n));
    if (where === "below") setSel({ ar: rg.r2 + 1, ac: 0, fr: rg.r2 + n, fc: tab.cols - 1 });
  };
  const insertCols = (where: "left" | "right") => {
    const rg = rangeOf(selRef.current);
    const n = rg.c2 - rg.c1 + 1;
    if (tab.cols + n > MAX_COLS) return toast.error("Limite de colunas atingido.");
    commit((ts) => shiftStructure(ts, ti, "col", where === "left" ? rg.c1 : rg.c2 + 1, n));
    if (where === "right") setSel({ ar: 0, ac: rg.c2 + 1, fr: tab.rows - 1, fc: rg.c2 + n });
  };
  const deleteRows = () => {
    const { at, n } = selRows();
    if (n >= tab.rows) return;
    commit((ts) => shiftStructure(ts, ti, "row", at, -n));
    setSel(cellSel(Math.min(at, tab.rows - n - 1), 0));
  };
  const deleteCols = () => {
    const rg = rangeOf(selRef.current);
    const n = rg.c2 - rg.c1 + 1;
    if (n >= tab.cols) return;
    commit((ts) => shiftStructure(ts, ti, "col", rg.c1, -n));
    setSel(cellSel(0, Math.min(rg.c1, tab.cols - n - 1)));
  };
  const hide = (axis: "row" | "col") => {
    const rg = rangeOf(selRef.current);
    setTab((t) => {
      const from = axis === "row" ? rg.r1 : rg.c1;
      const to = axis === "row" ? Math.min(rg.r2, rg.r1 + 20000) : rg.c2;
      const list = new Set(axis === "row" ? t.hiddenRows : t.hiddenCols);
      for (let i = from; i <= to; i++) list.add(i);
      return axis === "row" ? { ...t, hiddenRows: [...list] } : { ...t, hiddenCols: [...list] };
    });
  };
  const showHidden = (range?: { axis: "row" | "col" }) => {
    const rg = rangeOf(selRef.current);
    setTab((t) => {
      if (!range) return { ...t, hiddenRows: [], hiddenCols: [] };
      if (range.axis === "row") return { ...t, hiddenRows: t.hiddenRows.filter((r) => r < rg.r1 - 1 || r > rg.r2 + 1) };
      return { ...t, hiddenCols: t.hiddenCols.filter((c) => c < rg.c1 - 1 || c > rg.c2 + 1) };
    });
  };
  const freeze = (axis: "row" | "col", n: number | "sel") => {
    setTab((t) => {
      const v = n === "sel" ? (axis === "row" ? selRef.current.ar + 1 : selRef.current.ac + 1) : n;
      return axis === "row" ? { ...t, frozenRows: Math.min(v, 50) } : { ...t, frozenCols: Math.min(v, 20) };
    });
  };

  /* ----------------------------- ordenar, filtrar, preencher ----------------------------- */
  const looksLikeHeader = (rg: Range) => {
    if (rg.r2 <= rg.r1) return false;
    const first = Array.from({ length: rg.c2 - rg.c1 + 1 }, (_, i) => tab.grid[rg.r1]?.[rg.c1 + i]).filter((c) => c && c.v !== undefined && c.v !== "");
    if (!first.length || !first.every((c) => typeof c!.v === "string" && c!.f === undefined)) return false;
    if (first.some((c) => c!.s?.b)) return true;
    for (let i = rg.c1; i <= rg.c2; i++) {
      const v = tab.grid[rg.r1 + 1]?.[i]?.v;
      if (v !== undefined && typeof v !== "string") return true;
    }
    return false;
  };
  const sortSelection = (asc: boolean, col?: number, fixed?: Range) => {
    const s = selRef.current;
    const rg = rangeOf(s);
    let range: Range;
    if (fixed) range = fixed;
    else if (rg.r1 === rg.r2 && rg.c1 === rg.c2) {
      if (tab.filter && s.ar >= tab.filter.r1 && s.ar <= tab.filter.r2) range = { r1: tab.filter.r1 + 1, c1: tab.filter.c1, r2: tab.filter.r2, c2: tab.filter.c2 };
      else {
        const reg = currentRegion(tab.grid, s.ar, s.ac);
        range = looksLikeHeader(reg) ? { ...reg, r1: reg.r1 + 1 } : reg;
      }
    } else range = rg;
    const key = col ?? Math.max(range.c1, Math.min(range.c2, s.ac));
    if (range.r2 <= range.r1) return;
    const g = sortRange(tab, range, key, asc, (r, c) => book.get(ti, r, c));
    setTab((t) => ({ ...t, grid: g }));
  };
  const toggleFilter = () => {
    if (tab.filter) return setTab((t) => ({ ...t, filter: null }));
    const s = selRef.current;
    const rg = rangeOf(s);
    const reg = rg.r1 === rg.r2 && rg.c1 === rg.c2 ? currentRegion(tab.grid, s.ar, s.ac) : rg;
    if (reg.r2 <= reg.r1) return toast.message("Selecione uma tabela com cabeçalho e pelo menos uma linha de dados.");
    setTab((t) => ({ ...t, filter: { r1: reg.r1, c1: reg.c1, c2: reg.c2, r2: reg.r2, rules: {} } }));
  };

  const fillRange = (src: Range, target: Range) => {
    const changes: { r: number; c: number; cell: Cell | undefined }[] = [];
    if (target.r2 > src.r2 || target.r1 < src.r1) {
      const forward = target.r2 > src.r2;
      const count = forward ? target.r2 - src.r2 : src.r1 - target.r1;
      for (let c = src.c1; c <= src.c2; c++) {
        const col = Array.from({ length: src.r2 - src.r1 + 1 }, (_, i) => tab.grid[src.r1 + i]?.[c]);
        const out = fillLine(col, count, forward ? 1 : -1, "row");
        out.forEach((cell, i) => changes.push({ r: forward ? src.r2 + 1 + i : src.r1 - 1 - i, c, cell }));
      }
    } else if (target.c2 > src.c2 || target.c1 < src.c1) {
      const forward = target.c2 > src.c2;
      const count = forward ? target.c2 - src.c2 : src.c1 - target.c1;
      for (let r = src.r1; r <= src.r2; r++) {
        const row = Array.from({ length: src.c2 - src.c1 + 1 }, (_, i) => tab.grid[r]?.[src.c1 + i]);
        const out = fillLine(row, count, forward ? 1 : -1, "col");
        out.forEach((cell, i) => changes.push({ r, c: forward ? src.c2 + 1 + i : src.c1 - 1 - i, cell }));
      }
    }
    putCells(changes.filter((ch) => ch.r >= 0 && ch.c >= 0));
    setSel({ ar: target.r1, ac: target.c1, fr: target.r2, fc: target.c2 });
  };
  const fillEdge = (dir: "down" | "right") => {
    const rg = rangeOf(selRef.current);
    const changes: { r: number; c: number; cell: Cell | undefined }[] = [];
    if (dir === "down") {
      for (let c = rg.c1; c <= rg.c2; c++) {
        const base = tab.grid[rg.r1]?.[c];
        for (let r = rg.r1 + 1; r <= rg.r2; r++) changes.push({ r, c, cell: base ? (base.f !== undefined ? { ...base, f: offsetFormula(base.f, r - rg.r1, 0) } : base) : undefined });
      }
    } else {
      for (let r = rg.r1; r <= rg.r2; r++) {
        const base = tab.grid[r]?.[rg.c1];
        for (let c = rg.c1 + 1; c <= rg.c2; c++) changes.push({ r, c, cell: base ? (base.f !== undefined ? { ...base, f: offsetFormula(base.f, 0, c - rg.c1) } : base) : undefined });
      }
    }
    putCells(changes);
  };

  /* ----------------------------- teclado ----------------------------- */
  const onSinkKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    const s = selRef.current;
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    const lower = k.toLowerCase();
    if (mod) {
      if (["z", "y", "a", "b", "i", "u", "s", "d", "r", "p", "home"].includes(lower)) e.preventDefault();
      if (lower === "z") {
        if (e.shiftKey) redo();
        else undo();
      } else if (lower === "y") redo();
      else if (lower === "a") setSel({ ar: 0, ac: 0, fr: tab.rows - 1, fc: tab.cols - 1 });
      else if (lower === "b") toggle("b");
      else if (lower === "i") toggle("i");
      else if (lower === "u") toggle("u");
      else if (lower === "s") void doSave();
      else if (lower === "d") fillEdge("down");
      else if (lower === "r") fillEdge("right");
      else if (lower === "p") printSheet();
      else if (lower === "home") go(0, 0, e.shiftKey);
      else if (lower === "end") {
        e.preventDefault();
        const u = usedRange(tab.grid);
        go(Math.max(0, u.rows - 1), Math.max(0, u.cols - 1), e.shiftKey);
      } else if (k.startsWith("Arrow")) {
        e.preventDefault();
        const dr = k === "ArrowUp" ? -1 : k === "ArrowDown" ? 1 : 0;
        const dc = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0;
        const from = e.shiftKey ? { r: s.fr, c: s.fc } : { r: s.ar, c: s.ac };
        const t = jumpEdge(tab.grid, from.r, from.c, dr, dc, tab.rows, tab.cols);
        go(t.r, t.c, e.shiftKey);
      }
      return;
    }
    if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      const dr = k === "ArrowUp" ? -1 : k === "ArrowDown" ? 1 : 0;
      const dc = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0;
      const from = e.shiftKey ? { r: s.fr, c: s.fc } : { r: s.ar, c: s.ac };
      const m = moveFrom(from.r, from.c, dr, dc);
      go(m.r, m.c, e.shiftKey);
    } else if (k === "Tab") {
      e.preventDefault();
      const m = moveFrom(s.ar, s.ac, 0, e.shiftKey ? -1 : 1);
      go(m.r, m.c);
    } else if (k === "Enter" || k === "F2") {
      e.preventDefault();
      if (canEdit) startEdit(s.ar, s.ac, "edit");
    } else if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      if (canEdit) clearContent();
    } else if (k === "Escape") {
      clipRef.current = null;
    } else if (k === "PageDown" || k === "PageUp") {
      e.preventDefault();
      const n = (gridRef.current?.viewportRows() ?? 20) * (k === "PageDown" ? 1 : -1);
      go(s.fr + n, s.fc, e.shiftKey);
    } else if (k === "Home") {
      e.preventDefault();
      go(s.fr, 0, e.shiftKey);
    } else if (k === "End") {
      e.preventDefault();
      const u = usedRange(tab.grid);
      go(s.fr, Math.max(0, u.cols - 1), e.shiftKey);
    } else if (canEdit && k.length === 1 && !e.altKey) {
      e.preventDefault();
      startEdit(s.ar, s.ac, "enter", k);
    } else if (canEdit && (k === "Dead" || k === "Process" || k === "Unidentified")) {
      startEdit(s.ar, s.ac, "enter", "");
    }
  };

  /* ----------------------------- abas ----------------------------- */
  const cleanName = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const addTab = () => {
    const id = crypto.randomUUID();
    const nm = uniqueTabName(tabsRef.current, `Planilha${tabsRef.current.length + 1}`);
    commit((ts) => [...ts, emptyTab(id, nm)]);
    setActive(id);
  };
  const renameTabTo = (id: string, raw: string) => {
    const nm = cleanName(raw);
    const idx = tabsRef.current.findIndex((t) => t.id === id);
    if (!nm || idx < 0 || tabsRef.current[idx].name === nm) return;
    if (tabsRef.current.some((t, i) => i !== idx && t.name.toLowerCase() === nm.toLowerCase())) return toast.error("Já existe uma aba com esse nome.");
    commit((ts) => renameTabOp(ts, idx, nm));
  };
  const duplicateTab = (id: string) => {
    const idx = tabsRef.current.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const src = tabsRef.current[idx];
    const nid = crypto.randomUUID();
    const copy: TabData = { ...src, id: nid, name: uniqueTabName(tabsRef.current, `Cópia de ${src.name}`.slice(0, 60)), grid: cloneGrid(src.grid) };
    commit((ts) => [...ts.slice(0, idx + 1), copy, ...ts.slice(idx + 1)]);
    setActive(nid);
  };
  const [confirm, setConfirm] = useState<{ title: string; text: string; ok: () => void } | null>(null);
  const deleteTab = (id: string) => {
    if (tabsRef.current.length < 2) return;
    const t = tabsRef.current.find((x) => x.id === id);
    setConfirm({
      title: `Excluir a aba “${t?.name}”?`,
      text: "As fórmulas de outras abas que apontam para ela passam a mostrar #REF!. Você pode desfazer logo em seguida (Ctrl+Z).",
      ok: () => {
        const rest = tabsRef.current.filter((x) => x.id !== id);
        commit(() => rest);
        if (activeRef.current === id) setActive(rest[0].id);
      },
    });
  };
  const moveTab = (id: string, dir: -1 | 1) =>
    commit((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ts.length) return ts;
      const c = ts.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const reorderTab = (from: string, to: string) =>
    commit((ts) => {
      const i = ts.findIndex((t) => t.id === from);
      const j = ts.findIndex((t) => t.id === to);
      if (i < 0 || j < 0) return ts;
      const c = ts.slice();
      const [m] = c.splice(i, 1);
      c.splice(j, 0, m);
      return c;
    });

  /* ----------------------------- exportar / imprimir ----------------------------- */
  const flushThen = async (fn: () => void) => {
    if (canEdit && (dirty.current.size || structDirty.current || inflight.current)) await doSave();
    fn();
  };
  const printSheet = () => void flushThen(() => window.open(`/planilhas/${sheet.id}/imprimir?aba=${activeRef.current}`, "_blank", "noopener"));
  const download = (format: "xlsx" | "csv-br" | "csv-us" | "tsv") =>
    void flushThen(() => {
      const a = document.createElement("a");
      a.href = `/planilhas/${sheet.id}/exportar?formato=${format}&aba=${activeRef.current}`;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

  /* ----------------------------- diálogos: histórico e vínculo ----------------------------- */
  const [dialog, setDialog] = useState<"" | "history" | "link">("");
  const [versions, setVersions] = useState<{ id: number; label: string | null; at: string; by: string | null }[] | null>(null);
  const [busy, startBusy] = useTransition();
  const openHistory = () => {
    setDialog("history");
    setVersions(null);
    void doSave().then(() => listVersions(sheet.id).then(setVersions));
  };

  /* ----------------------------- menu de contexto e filtro ----------------------------- */
  const [ctx, setCtx] = useState<{ x: number; y: number; kind: "cell" | "row" | "col" } | null>(null);
  const [filterUi, setFilterUi] = useState<{ col: number; rect: DOMRect } | null>(null);

  const closeCtx = () => {
    setCtx(null);
    gridRef.current?.focusSink();
  };
  const ctxItems = (): CtxItem[] => {
    if (!ctx) return [];
    const rg = rangeOf(sel);
    const nR = rg.r2 - rg.r1 + 1;
    const nC = rg.c2 - rg.c1 + 1;
    const base: CtxItem[] = [
      { label: "Recortar", onClick: () => doCopy(true), disabled: !canEdit, shortcut: "Ctrl+X" },
      { label: "Copiar", onClick: () => doCopy(false), shortcut: "Ctrl+C" },
      { label: "Colar", onClick: () => void pasteFromClipboard(), disabled: !canEdit, shortcut: "Ctrl+V" },
      { label: "Colar somente valores", onClick: () => void pasteFromClipboard(true), disabled: !canEdit },
      { label: "", onClick: () => {}, sep: true },
    ];
    const rowItems: CtxItem[] = [
      { label: nR > 1 ? `Inserir ${nR} linhas acima` : "Inserir linha acima", onClick: () => insertRows("above"), disabled: !canEdit },
      { label: nR > 1 ? `Inserir ${nR} linhas abaixo` : "Inserir linha abaixo", onClick: () => insertRows("below"), disabled: !canEdit },
      { label: nR > 1 ? `Excluir ${nR} linhas` : "Excluir linha", onClick: deleteRows, disabled: !canEdit, danger: true },
      { label: nR > 1 ? "Ocultar linhas" : "Ocultar linha", onClick: () => hide("row"), disabled: !canEdit },
      { label: "Mostrar linhas ocultas", onClick: () => showHidden({ axis: "row" }), disabled: !canEdit },
    ];
    const colItems: CtxItem[] = [
      { label: nC > 1 ? `Inserir ${nC} colunas à esquerda` : "Inserir coluna à esquerda", onClick: () => insertCols("left"), disabled: !canEdit },
      { label: nC > 1 ? `Inserir ${nC} colunas à direita` : "Inserir coluna à direita", onClick: () => insertCols("right"), disabled: !canEdit },
      { label: nC > 1 ? `Excluir ${nC} colunas` : "Excluir coluna", onClick: deleteCols, disabled: !canEdit, danger: true },
      { label: nC > 1 ? "Ocultar colunas" : "Ocultar coluna", onClick: () => hide("col"), disabled: !canEdit },
      { label: "Mostrar colunas ocultas", onClick: () => showHidden({ axis: "col" }), disabled: !canEdit },
    ];
    if (ctx.kind === "row") return [...base, ...rowItems, { label: "", onClick: () => {}, sep: true }, { label: "Ordenar A → Z", onClick: () => sortSelection(true), disabled: !canEdit }];
    if (ctx.kind === "col") return [...base, ...colItems, { label: "", onClick: () => {}, sep: true }, { label: "Ordenar A → Z", onClick: () => sortSelection(true), disabled: !canEdit }, { label: "Ordenar Z → A", onClick: () => sortSelection(false), disabled: !canEdit }];
    return [
      ...base,
      ...rowItems.slice(0, 2),
      ...colItems.slice(0, 2),
      { label: "", onClick: () => {}, sep: true },
      { label: "Excluir linha(s)", onClick: deleteRows, disabled: !canEdit, danger: true },
      { label: "Excluir coluna(s)", onClick: deleteCols, disabled: !canEdit, danger: true },
      { label: "Limpar conteúdo", onClick: clearContent, disabled: !canEdit, shortcut: "Del" },
    ];
  };

  const filterValues = useMemo(() => {
    if (!filterUi || !tab.filter) return [];
    const f = tab.filter;
    const set = new Set<string>();
    for (let r = f.r1 + 1; r <= f.r2 && set.size < 3000; r++) {
      const cell = tab.grid[r]?.[filterUi.col];
      set.add(cell ? formatValue(book.get(ti, r, filterUi.col), cell.fmt) : "");
    }
    return [...set].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })));
  }, [filterUi, tab, book, ti]);

  /* ----------------------------- barra de fórmulas ----------------------------- */
  const activeCell = tab.grid[sel.ar]?.[sel.ac];
  const barText = editing ? editing.text : editTextOf(activeCell);
  const rg = rangeOf(sel);
  const single = rg.r1 === rg.r2 && rg.c1 === rg.c2;
  const wholeCols = rg.r1 === 0 && rg.r2 >= tab.rows - 1;
  const wholeRows = rg.c1 === 0 && rg.c2 >= tab.cols - 1;
  const nameBox = single ? addr(sel.ar, sel.ac) : wholeCols ? `${colName(rg.c1)}:${colName(rg.c2)}` : wholeRows ? `${rg.r1 + 1}:${rg.r2 + 1}` : `${addr(rg.r1, rg.c1)}:${addr(rg.r2, rg.c2)}`;

  const gotoText = (text: string) => {
    const t = text.trim().toUpperCase();
    const m = /^([A-Z]{1,3}\d+)(?::([A-Z]{1,3}\d+))?$/.exec(t);
    if (!m) return;
    const a = parseAddr(m[1])!;
    const b = m[2] ? parseAddr(m[2])! : a;
    const n = normRange(a, b);
    setSel({ ar: n.r1, ac: n.c1, fr: Math.min(tab.rows - 1, n.r2), fc: Math.min(tab.cols - 1, n.c2) });
    gridRef.current?.scrollToCell(Math.min(tab.rows - 1, n.r1), Math.min(tab.cols - 1, n.c1));
    gridRef.current?.focusSink();
  };

  const stats = useMemo(() => (single ? null : selectionStats(tab, book, ti, rg)), [single, tab, book, ti, rg.r1, rg.r2, rg.c1, rg.c2]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------------- API para o cromo ----------------------------- */
  const api: Api = {
    canEdit,
    canManage: false,
    undo,
    redo,
    canUndo: hist.undo > 0,
    canRedo: hist.redo > 0,
    copy: () => doCopy(false),
    cut: () => doCopy(true),
    paste: (values) => void pasteFromClipboard(!!values),
    clearContent,
    clearFormat: () => forSel((cell) => (cell ? { ...cell, s: undefined, fmt: undefined } : cell)),
    selectAll: () => setSel({ ar: 0, ac: 0, fr: tab.rows - 1, fc: tab.cols - 1 }),
    toggle,
    align: (a) => setStyle({ al: a }),
    valign: (a) => setStyle({ va: a }),
    wrap: () => setStyle({ wrap: styleOfActive.wrap ? undefined : 1 }),
    fontSize: (n) => setStyle({ fs: n === 10 ? undefined : n }),
    setFmt,
    decimals,
    color: (kind, color) => setStyle(kind === "c" ? { c: color ?? undefined } : { bg: color ?? undefined }),
    borders: applyBorders,
    merge: mergeCells,
    freeze,
    insertRows,
    insertCols,
    deleteRows,
    deleteCols,
    hideRows: () => hide("row"),
    hideCols: () => hide("col"),
    showHidden: () => showHidden(),
    sort: (asc) => sortSelection(asc),
    filter: toggleFilter,
    toggleGrid: () => setTab((t) => ({ ...t, showGrid: !t.showGrid })),
    download,
    print: printSheet,
    openHistory,
    openLink: () => setDialog("link"),
    saveNow: () => void doSave(),
    rename: (n) => {
      setName(n);
      void renameSheet(sheet.id, n).then((r) => r && "error" in r && r.error && toast.error(r.error));
    },
    toggleFavorite: () => {
      setFavorite(!favorite);
      void toggleFavorite(sheet.id, !favorite);
    },
    focusGrid: () => requestAnimationFrame(() => gridRef.current?.focusSink()),
    state: {
      b: !!styleOfActive.b,
      i: !!styleOfActive.i,
      u: !!styleOfActive.u,
      st: !!styleOfActive.st,
      al: styleOfActive.al,
      wrap: !!styleOfActive.wrap,
      fmtKind: parseFmt(activeCell?.fmt).kind,
      fs: styleOfActive.fs ?? 10,
      filterOn: !!tab.filter,
      frozenRows: tab.frozenRows,
      frozenCols: tab.frozenCols,
      showGrid: tab.showGrid,
      textColor: styleOfActive.c ?? "",
      fillColor: styleOfActive.bg ?? "",
      favorite,
      multiRows: rg.r2 - rg.r1 + 1,
      multiCols: rg.c2 - rg.c1 + 1,
    },
  };

  const readOnlyNote = !canEdit;

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4.25rem-env(safe-area-inset-bottom))] min-w-0 flex-col overflow-hidden bg-background md:h-[calc(100dvh-3.5rem)]" data-tour="sheet-editor">
      <MenuBar api={api} name={name} status={status} backHref="/planilhas" />
      <IconBar api={api} />
      <FormulaBar
        nameBox={nameBox}
        onGoto={gotoText}
        value={barText}
        editing={editing?.mode === "bar"}
        disabled={!canEdit}
        inputRef={barRef}
        onFocus={() => {
          if (canEdit && !editingRef.current) {
            pointRef.current = null;
            setEdit({ r: sel.ar, c: sel.ac, text: editTextOf(activeCell), mode: "bar" });
          }
        }}
        onChange={(v) => {
          const ed = editingRef.current;
          if (ed) setEdit({ ...ed, text: v });
        }}
        onKeyDown={(e) => {
          const ed = editingRef.current;
          if (!ed) return;
          if (e.key === "Enter") {
            e.preventDefault();
            finishEdit(true, 1, 0);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finishEdit(false);
          } else onEditKeyDown(e);
        }}
        onBlur={() => {
          const ed = editingRef.current;
          if (ed && ed.mode === "bar") {
            requestAnimationFrame(() => {
              const cur = editingRef.current;
              if (cur && cur.mode === "bar" && document.activeElement !== barRef.current) finishEdit(true);
            });
          }
        }}
      />
      {readOnlyNote && <p className="border-b bg-muted/50 px-3 py-1 text-[12px] text-muted-foreground">Você pode ver e baixar esta planilha, mas não editar.</p>}
      <SheetGrid
        ref={gridRef}
        tab={tab}
        tabIndex={ti}
        book={book}
        layout={layout}
        sel={sel}
        editing={editing}
        canEdit={canEdit}
        onPoint={onPoint}
        onSelect={(s) => {
          if (editingRef.current && editingRef.current.mode !== "bar") finishEdit(true);
          setSel(s);
        }}
        onStartEdit={(r, c) => startEdit(r, c, "edit")}
        onEditChange={(text) => {
          const ed = editingRef.current;
          if (ed) {
            pointRef.current = null;
            setEdit({ ...ed, text });
          }
        }}
        onEditKeyDown={onEditKeyDown}
        onEditBlur={() => {
          const ed = editingRef.current;
          if (ed && ed.mode !== "bar") requestAnimationFrame(() => editingRef.current === ed && finishEdit(true));
        }}
        onResize={(axis, index, size, _final, indices) =>
          setTab((t) => {
            const map = { ...(axis === "col" ? t.colW : t.rowH) };
            for (const i of indices) map[i] = size;
            return axis === "col" ? { ...t, colW: map } : { ...t, rowH: map };
          })
        }
        onAutofit={(col) => {
          let max = 0;
          let n = 0;
          for (const rk in tab.grid) {
            const cell = tab.grid[rk][col];
            if (!cell) continue;
            if (++n > 3000) break;
            const t = formatValue(book.get(ti, Number(rk), col), cell.fmt);
            max = Math.max(max, Math.min(80, t.length) * ((cell.s?.fs ?? 10) / 10) * (cell.s?.b ? 8 : 7.2));
          }
          const w = Math.max(40, Math.min(600, Math.round(max + 18)));
          setTab((t) => ({ ...t, colW: { ...t.colW, [col]: w } }));
        }}
        onFill={fillRange}
        onContext={(c) => setCtx({ x: c.x, y: c.y, kind: c.kind })}
        onOpenFilter={(col, rect) => setFilterUi({ col, rect })}
        onSinkKeyDown={onSinkKeyDown}
        onSinkCopy={(e) => {
          e.preventDefault();
          doCopy(false, e.clipboardData);
        }}
        onSinkCut={(e) => {
          e.preventDefault();
          doCopy(true, e.clipboardData);
        }}
        onSinkPaste={(e) => {
          e.preventDefault();
          doPaste(e.clipboardData.getData("text/plain"), false);
        }}
        onLoadMore={growRows}
      />
      <div className="flex items-stretch border-t bg-card">
        <div className="min-w-0 flex-1">
          <TabsBar
            tabs={tabs.map((t) => ({ id: t.id, name: t.name }))}
            active={tab.id}
            canEdit={canEdit}
            onSelect={setActive}
            onAdd={addTab}
            onRename={renameTabTo}
            onDuplicate={duplicateTab}
            onDelete={deleteTab}
            onMove={moveTab}
            onReorder={reorderTab}
          />
        </div>
        <div className="hidden items-center gap-3 px-3 text-[12px] whitespace-nowrap text-muted-foreground sm:flex" aria-live="polite">
          {stats && stats.count > 0 && (
            <>
              <span>Contagem: {stats.count.toLocaleString("pt-BR")}</span>
              {stats.nums > 0 && (
                <>
                  <span>Soma: {formatValue(stats.sum, "n:2")}</span>
                  <span>Média: {formatValue(stats.sum / stats.nums, "n:2")}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems()} onClose={closeCtx} />}
      {filterUi && tab.filter && (
        <FilterPopover
          anchor={filterUi.rect}
          values={filterValues}
          allowed={tab.filter.rules[filterUi.col]}
          onApply={(allowed) =>
            setTab((t) => {
              if (!t.filter) return t;
              const rules = { ...t.filter.rules };
              if (allowed) rules[filterUi.col] = allowed;
              else delete rules[filterUi.col];
              return { ...t, filter: { ...t.filter, rules } };
            })
          }
          onSort={(asc) => {
            const f = tab.filter!;
            sortSelection(asc, filterUi.col, { r1: f.r1 + 1, c1: f.c1, r2: f.r2, c2: f.c2 });
          }}
          onClose={() => {
            setFilterUi(null);
            gridRef.current?.focusSink();
          }}
        />
      )}

      {/* conflito de versão */}
      <Dialog open={conflict !== null}>
        <DialogContent className="sm:max-w-md" showCloseButton={false} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Esta planilha foi alterada em outro lugar</DialogTitle>
            <DialogDescription>Alguém (ou outra aba do navegador) salvou uma versão mais nova enquanto você editava. Escolha o que manter.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
            <Button
              onClick={() => {
                versionRef.current = conflict ?? versionRef.current;
                tabsRef.current.forEach((t) => dirty.current.add(t.id));
                structDirty.current = true;
                setConflict(null);
                statusRef.current = "dirty";
                void doSave();
              }}
            >
              Manter a minha versão (sobrescrever)
            </Button>
            <Button variant="outline" onClick={() => { dirty.current.clear(); window.location.reload(); }}>
              Recarregar a versão salva (descartar minhas alterações)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirmações */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => { confirm?.ok(); setConfirm(null); }}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* histórico */}
      <Dialog open={dialog === "history"} onOpenChange={(o) => !o && setDialog("")}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de versões</DialogTitle>
            <DialogDescription>O sistema guarda instantâneos automaticamente (a cada ~10 minutos de edição). Restaurar substitui o conteúdo atual — o estado de agora também fica guardado.</DialogDescription>
          </DialogHeader>
          <div className="thin-scroll max-h-72 overflow-y-auto rounded-lg border">
            {versions === null && (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando…
              </p>
            )}
            {versions?.length === 0 && <p className="p-4 text-sm text-muted-foreground">Ainda não há versões. Elas aparecem depois das primeiras edições.</p>}
            {versions?.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-[13px] last:border-0">
                <div className="min-w-0">
                  <p className="font-medium">{fmtDateTime(v.at)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.label ?? "Instantâneo automático"}
                    {v.by ? ` · ${v.by}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      startBusy(async () => {
                        const r = await restoreVersion(sheet.id, v.id);
                        if (r && "error" in r && r.error) toast.error(r.error);
                        else {
                          dirty.current.clear();
                          structDirty.current = false;
                          window.location.reload();
                        }
                      })
                    }
                  >
                    Restaurar
                  </Button>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            {canEdit && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    await doSave();
                    const r = await createVersion(sheet.id, "Versão salva manualmente");
                    if (r && "error" in r && r.error) toast.error(r.error);
                    else {
                      toast.success("Versão salva.");
                      setVersions(await listVersions(sheet.id));
                    }
                  })
                }
              >
                Salvar versão agora
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* vínculo */}
      <Dialog open={dialog === "link"} onOpenChange={(o) => !o && setDialog("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular a negócio ou contato</DialogTitle>
            <DialogDescription>Útil para custos e materiais de um projeto específico. Escolher um negócio vincula também o contato dele.</DialogDescription>
          </DialogHeader>
          <Field label="Negócio">
            <SimpleSelect value={dealId} onValueChange={setDealId} options={[{ value: "", label: "Sem negócio" }, ...deals]} />
          </Field>
          <Field label="Contato">
            <SimpleSelect value={contactId} onValueChange={setContactId} options={[{ value: "", label: "Sem contato" }, ...contacts]} />
          </Field>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() =>
                startBusy(async () => {
                  const r = await linkSheet(sheet.id, dealId || null, contactId || null);
                  if (r && "error" in r && r.error) toast.error(r.error);
                  else {
                    toast.success("Vínculo atualizado.");
                    setDialog("");
                    router.refresh();
                  }
                })
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
