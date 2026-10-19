"use client";
/* eslint-disable react-hooks/preserve-manual-memoization -- a grade usa memoização manual (vetores tipados de posições) de propósito para virtualizar */

/**
 * Grade virtualizada da planilha: desenha só o que cabe na tela (milhares de linhas fluidas),
 * trata ponteiro (seleção, arrastar, redimensionar, alça de preenchimento) e rolagem.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type Ref } from "react";
import { ChevronDown } from "lucide-react";
import type { Book } from "@/lib/sheets/formula";
import { formatValue, FErr } from "@/lib/sheets/format";
import { colName, type Cell, type TabData } from "@/lib/sheets/types";
import { HEADER_H, HEADER_W, indexAt, rangeOf, readableOn, type Layout, type Range, type Sel } from "./model";

export type Editing = { r: number; c: number; text: string; mode: "enter" | "edit" | "bar" };

export type GridHandle = {
  scrollToCell: (r: number, c: number) => void;
  viewportRows: () => number;
  focusSink: () => void;
  cellRect: (r: number, c: number) => DOMRect | null;
};

type Props = {
  ref?: Ref<GridHandle>;
  tab: TabData;
  tabIndex: number;
  book: Book;
  layout: Layout;
  sel: Sel;
  editing: Editing | null;
  canEdit: boolean;
  /** referência pelo clique/arrasto enquanto edita uma fórmula (devolve true se tratou) */
  onPoint: (r: number, c: number, phase: "start" | "move") => boolean;
  onSelect: (s: Sel, keepAnchor?: boolean) => void;
  onStartEdit: (r: number, c: number, mode: "edit") => void;
  onEditChange: (text: string) => void;
  onEditKeyDown: (e: RKeyboardEvent<HTMLTextAreaElement>) => void;
  onEditBlur: () => void;
  onResize: (axis: "col" | "row", index: number, size: number, final: boolean, indices: number[]) => void;
  onAutofit: (col: number) => void;
  onFill: (src: Range, target: Range) => void;
  onContext: (e: { x: number; y: number; kind: "cell" | "row" | "col"; index: number }) => void;
  onOpenFilter: (col: number, rect: DOMRect) => void;
  onSinkKeyDown: (e: RKeyboardEvent<HTMLTextAreaElement>) => void;
  onSinkCopy: (e: React.ClipboardEvent) => void;
  onSinkCut: (e: React.ClipboardEvent) => void;
  onSinkPaste: (e: React.ClipboardEvent) => void;
  onLoadMore: () => void;
};

const OVERSCAN_R = 4;
const OVERSCAN_C = 2;
const BASE_FONT = 13;

/* ----------------------------- célula ----------------------------- */

type CellProps = {
  r: number;
  c: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ext: number;
  text: string;
  isNum: boolean;
  isBool: boolean;
  isErr: boolean;
  cell: Cell | undefined;
  grid: boolean;
  z: number;
  filterBtn: boolean;
  filterOn: boolean;
};

const CellView = memo(function CellView({ x, y, w, h, ext, text, isNum, isBool, isErr, cell, grid, z, filterBtn, filterOn }: CellProps) {
  const s = cell?.s;
  const style: CSSProperties = { left: x, top: y, width: w + ext, height: h, zIndex: z };
  if (s) {
    if (s.bg) {
      style.background = s.bg;
      style.color = s.c ?? readableOn(s.bg);
    } else if (s.c) style.color = s.c;
    if (s.b) style.fontWeight = 700;
    if (s.i) style.fontStyle = "italic";
    if (s.u || s.st) style.textDecoration = `${s.u ? "underline" : ""} ${s.st ? "line-through" : ""}`.trim();
    if (s.fs) style.fontSize = Math.round(s.fs * 1.333);
    if (s.wrap) {
      style.whiteSpace = "pre-wrap";
      style.overflowWrap = "anywhere";
      style.alignItems = s.va === "m" ? "center" : s.va === "b" ? "flex-end" : "flex-start";
    }
    if (s.bt) style.borderTop = `1px solid ${s.bt}`;
    if (s.bb) style.borderBottom = `1px solid ${s.bb}`;
    if (s.bl) style.borderLeft = `1px solid ${s.bl}`;
    if (s.br) style.borderRight = `1px solid ${s.br}`;
  }
  if (!s?.bg && (z > 1 || ext > 0)) style.background = "var(--background)";
  const align = s?.al ?? (isNum ? "r" : isBool ? "c" : "l");
  style.justifyContent = align === "r" ? "flex-end" : align === "c" ? "center" : "flex-start";
  if (!s?.wrap) style.alignItems = s?.va === "t" ? "flex-start" : s?.va === "b" ? "flex-end" : "center";
  return (
    <div
      className={`absolute flex overflow-hidden px-1 leading-tight select-none ${grid ? "border-r border-b border-r-[color:var(--sheet-line)] border-b-[color:var(--sheet-line)]" : ""} ${isErr ? "text-destructive" : ""}`}
      style={style}
    >
      <span className={s?.wrap ? "min-w-0" : "min-w-0 truncate"}>{text}</span>
      {filterBtn && (
        <span className={`absolute top-1/2 right-0.5 grid size-4.5 -translate-y-1/2 place-items-center rounded border bg-background text-muted-foreground ${filterOn ? "border-brand text-brand" : ""}`} data-filter-btn>
          <ChevronDown className="size-3" />
        </span>
      )}
    </div>
  );
});

/* ----------------------------- grade ----------------------------- */

export function SheetGrid({ ref, ...props }: Props) {
  const { tab, tabIndex, book, layout, sel, editing, canEdit } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const sink = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [size, setSize] = useState({ w: 800, h: 500 });
  const raf = useRef(0);
  const [live, setLive] = useState<{ axis: "col" | "row"; indices: number[]; size: number } | null>(null);
  const [fillTarget, setFillTarget] = useState<Range | null>(null);
  const drag = useRef<{ kind: "sel" | "col" | "row" | "resize" | "fill"; axis?: "col" | "row"; index?: number; indices?: number[]; startPos?: number; startSize?: number; src?: Range; touch?: boolean; moved?: boolean; sx?: number; sy?: number; st?: number; sl?: number; ar?: number; ac?: number } | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const lastTap = useRef({ t: 0, r: -1, c: -1 });

  const { rowTop, colLeft } = layout;
  const fr = tab.frozenRows;
  const fc = tab.frozenCols;

  // ---- tamanho e rolagem
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const onScroll = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = scroller.current;
      if (el) setScroll({ top: el.scrollTop, left: el.scrollLeft });
    });
  }, []);

  const viewH = Math.max(0, size.h - HEADER_H);
  const viewW = Math.max(0, size.w - HEADER_W);

  // ---- janelas visíveis
  const rowsToRender = useMemo(() => {
    const out: number[] = [];
    for (let r = 0; r < Math.min(fr, tab.rows); r++) if (!layout.rowHidden[r]) out.push(r);
    const a = Math.max(fr, indexAt(rowTop, scroll.top + layout.frozenH) - OVERSCAN_R);
    const b = Math.min(tab.rows - 1, indexAt(rowTop, scroll.top + viewH) + OVERSCAN_R);
    for (let r = a; r <= b; r++) if (!layout.rowHidden[r]) out.push(r);
    return out;
  }, [fr, tab.rows, layout, rowTop, scroll.top, viewH]);
  const colsToRender = useMemo(() => {
    const out: number[] = [];
    for (let c = 0; c < Math.min(fc, tab.cols); c++) if (!layout.colHidden[c]) out.push(c);
    const a = Math.max(fc, indexAt(colLeft, scroll.left + layout.frozenW) - OVERSCAN_C);
    const b = Math.min(tab.cols - 1, indexAt(colLeft, scroll.left + viewW) + OVERSCAN_C);
    for (let c = a; c <= b; c++) if (!layout.colHidden[c]) out.push(c);
    return out;
  }, [fc, tab.cols, layout, colLeft, scroll.left, viewW]);

  // ---- mesclagens
  const merges = useMemo(() => {
    const origin = new Map<number, { r1: number; c1: number; r2: number; c2: number }>();
    const covered = new Map<number, number>();
    for (const m of tab.merges) {
      origin.set(m.r1 * 1024 + m.c1, m);
      for (let r = m.r1; r <= Math.min(m.r2, m.r1 + 2000); r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.set(r * 1024 + c, m.r1 * 1024 + m.c1);
    }
    return { origin, covered };
  }, [tab.merges]);

  // ---- geometria de uma célula/intervalo (com compensação das áreas congeladas)
  const xOf = useCallback((c: number) => colLeft[c] + (c < fc ? scroll.left : 0), [colLeft, fc, scroll.left]);
  const yOf = useCallback((r: number) => rowTop[r] + (r < fr ? scroll.top : 0), [rowTop, fr, scroll.top]);
  const rectOf = useCallback(
    (rg: Range) => {
      const x1 = xOf(rg.c1);
      const y1 = yOf(rg.r1);
      const x2 = colLeft[rg.c2 + 1] + (rg.c2 < fc ? scroll.left : 0);
      const y2 = rowTop[rg.r2 + 1] + (rg.r2 < fr ? scroll.top : 0);
      return { left: x1, top: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
    },
    [xOf, yOf, colLeft, rowTop, fc, fr, scroll],
  );

  // ---- acerto de clique
  const hit = useCallback(
    (clientX: number, clientY: number) => {
      const el = scroller.current!;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left - HEADER_W;
      const y = clientY - rect.top - HEADER_H;
      const cx = fc > 0 && x < layout.frozenW ? x : x + el.scrollLeft;
      const cy = fr > 0 && y < layout.frozenH ? y : y + el.scrollTop;
      let c = Math.max(0, Math.min(tab.cols - 1, indexAt(colLeft, cx)));
      let r = Math.max(0, Math.min(tab.rows - 1, indexAt(rowTop, cy)));
      const org = merges.covered.get(r * 1024 + c);
      if (org !== undefined) {
        r = Math.floor(org / 1024);
        c = org % 1024;
      }
      return { r, c };
    },
    [fc, fr, layout.frozenW, layout.frozenH, tab.cols, tab.rows, colLeft, rowTop, merges],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToCell(r, c) {
        const el = scroller.current;
        if (!el) return;
        const x1 = colLeft[c];
        const x2 = colLeft[c + 1];
        const y1 = rowTop[r];
        const y2 = rowTop[r + 1];
        if (c >= fc) {
          if (x1 - layout.frozenW < el.scrollLeft) el.scrollLeft = Math.max(0, x1 - layout.frozenW);
          else if (x2 > el.scrollLeft + el.clientWidth - HEADER_W) el.scrollLeft = x2 - (el.clientWidth - HEADER_W);
        }
        if (r >= fr) {
          if (y1 - layout.frozenH < el.scrollTop) el.scrollTop = Math.max(0, y1 - layout.frozenH);
          else if (y2 > el.scrollTop + el.clientHeight - HEADER_H) el.scrollTop = y2 - (el.clientHeight - HEADER_H);
        }
      },
      viewportRows() {
        return Math.max(1, Math.floor((scroller.current?.clientHeight ?? 400) / 24) - 2);
      },
      focusSink() {
        sink.current?.focus({ preventScroll: true });
      },
      cellRect(r, c) {
        const el = scroller.current;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const left = b.left + HEADER_W + xOf(c) - (c < fc ? 0 : el.scrollLeft);
        const top = b.top + HEADER_H + yOf(r) - (r < fr ? 0 : el.scrollTop);
        return new DOMRect(left, top, colLeft[c + 1] - colLeft[c], rowTop[r + 1] - rowTop[r]);
      },
    }),
    [colLeft, rowTop, fc, fr, layout.frozenH, layout.frozenW, xOf, yOf],
  );

  // ---- ponteiro na área de células
  const movePointer = (cx: number, cy: number) => {
    const d = drag.current;
    if (!d) return;
    const { r, c } = hit(cx, cy);
    if (d.kind === "sel") {
      if (props.onPoint(r, c, "move")) return;
      props.onSelect({ ar: d.ar ?? sel.ar, ac: d.ac ?? sel.ac, fr: r, fc: c }, true);
    } else if (d.kind === "fill" && d.src) {
      const s = d.src;
      // só uma direção: a que o ponteiro mais se afastou da origem
      const down = r > s.r2 ? r - s.r2 : 0;
      const up = r < s.r1 ? s.r1 - r : 0;
      const right = c > s.c2 ? c - s.c2 : 0;
      const left = c < s.c1 ? s.c1 - c : 0;
      const max = Math.max(down, up, right, left);
      if (max === 0) setFillTarget(null);
      else if (max === down || max === up) setFillTarget(down >= up ? { ...s, r2: r } : { ...s, r1: r });
      else setFillTarget(right >= left ? { ...s, c2: c } : { ...s, c1: c });
    }
  };

  // ---- rolagem automática ao arrastar perto da borda
  useEffect(() => {
    const id = setInterval(() => {
      const d = drag.current;
      const el = scroller.current;
      if (!d || !el || d.touch || (d.kind !== "sel" && d.kind !== "fill")) return;
      const b = el.getBoundingClientRect();
      const { x, y } = last.current;
      const dx = x > b.right - 30 ? 28 : x < b.left + HEADER_W + 30 ? -28 : 0;
      const dy = y > b.bottom - 30 ? 28 : y < b.top + HEADER_H + 30 ? -28 : 0;
      if (dx || dy) {
        el.scrollLeft += dx;
        el.scrollTop += dy;
        movePointer(x, y);
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, tab]);

  const onCellsPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    const target = e.target as HTMLElement;
    const { r, c } = hit(e.clientX, e.clientY);
    if (target.closest("[data-filter-btn]")) {
      const rect = (target.closest("[data-filter-btn]") as HTMLElement).getBoundingClientRect();
      props.onOpenFilter(c, rect);
      e.preventDefault();
      return;
    }
    last.current = { x: e.clientX, y: e.clientY };
    if (e.pointerType === "touch") {
      drag.current = { kind: "sel", touch: true, sx: e.clientX, sy: e.clientY, st: scroller.current?.scrollTop, sl: scroller.current?.scrollLeft };
      return;
    }
    if (props.onPoint(r, c, "start")) {
      drag.current = { kind: "sel", ar: r, ac: c };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    sink.current?.focus({ preventScroll: true });
    if (e.shiftKey) props.onSelect({ ...sel, fr: r, fc: c }, true);
    else props.onSelect({ ar: r, ac: c, fr: r, fc: c });
    drag.current = { kind: "sel", ar: e.shiftKey ? sel.ar : r, ac: e.shiftKey ? sel.ac : c };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onCellsPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    last.current = { x: e.clientX, y: e.clientY };
    const d = drag.current;
    if (!d || d.touch) return;
    movePointer(e.clientX, e.clientY);
  };
  const onCellsPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "fill") {
      if (fillTarget && d.src) props.onFill(d.src, fillTarget);
      setFillTarget(null);
      return;
    }
    if (d.touch) {
      const el = scroller.current;
      const moved = Math.abs(e.clientX - (d.sx ?? 0)) > 8 || Math.abs(e.clientY - (d.sy ?? 0)) > 8 || Math.abs((el?.scrollTop ?? 0) - (d.st ?? 0)) > 4 || Math.abs((el?.scrollLeft ?? 0) - (d.sl ?? 0)) > 4;
      if (moved) return;
      const { r, c } = hit(e.clientX, e.clientY);
      const now = e.timeStamp;
      if (now - lastTap.current.t < 380 && lastTap.current.r === r && lastTap.current.c === c && canEdit) props.onStartEdit(r, c, "edit");
      else if (!props.onPoint(r, c, "start")) props.onSelect({ ar: r, ac: c, fr: r, fc: c });
      lastTap.current = { t: now, r, c };
    }
  };
  const onCellsDouble = (e: React.MouseEvent) => {
    if (!canEdit || (e.target as HTMLElement).closest("[data-filter-btn]")) return;
    const { r, c } = hit(e.clientX, e.clientY);
    props.onStartEdit(r, c, "edit");
  };
  const onCellsContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const { r, c } = hit(e.clientX, e.clientY);
    const rg = rangeOf(sel);
    if (r < rg.r1 || r > rg.r2 || c < rg.c1 || c > rg.c2) props.onSelect({ ar: r, ac: c, fr: r, fc: c });
    props.onContext({ x: e.clientX, y: e.clientY, kind: "cell", index: r });
  };

  const startFill = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    last.current = { x: e.clientX, y: e.clientY };
    drag.current = { kind: "fill", src: rangeOf(sel) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  // ---- cabeçalhos
  const headerPointerDown = (axis: "col" | "row", index: number) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    sink.current?.focus({ preventScroll: true });
    const rect = e.currentTarget.getBoundingClientRect();
    const edge = axis === "col" ? rect.right - e.clientX : rect.bottom - e.clientY;
    if (edge <= 6 && canEdit) {
      // redimensionar (todas as colunas/linhas selecionadas, se esta fizer parte da seleção)
      const rg = rangeOf(sel);
      const inSel = axis === "col" ? index >= rg.c1 && index <= rg.c2 && rg.r1 === 0 && rg.r2 >= tab.rows - 1 : index >= rg.r1 && index <= rg.r2 && rg.c1 === 0 && rg.c2 >= tab.cols - 1;
      const indices: number[] = [];
      if (inSel) for (let i = axis === "col" ? rg.c1 : rg.r1; i <= (axis === "col" ? rg.c2 : rg.r2); i++) indices.push(i);
      else indices.push(index);
      drag.current = { kind: "resize", axis, index, indices, startPos: axis === "col" ? e.clientX : e.clientY, startSize: axis === "col" ? colLeft[index + 1] - colLeft[index] : rowTop[index + 1] - rowTop[index] };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (axis === "col") {
      if (e.shiftKey) props.onSelect({ ar: 0, ac: sel.ac, fr: tab.rows - 1, fc: index }, true);
      else props.onSelect({ ar: 0, ac: index, fr: tab.rows - 1, fc: index });
      drag.current = { kind: "col", index, ac: e.shiftKey ? sel.ac : index };
    } else {
      if (e.shiftKey) props.onSelect({ ar: sel.ar, ac: 0, fr: index, fc: tab.cols - 1 }, true);
      else props.onSelect({ ar: index, ac: 0, fr: index, fc: tab.cols - 1 });
      drag.current = { kind: "row", index, ar: e.shiftKey ? sel.ar : index };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const headerPointerMove = (axis: "col" | "row", index: number) => (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      const rect = e.currentTarget.getBoundingClientRect();
      const edge = axis === "col" ? rect.right - e.clientX : rect.bottom - e.clientY;
      e.currentTarget.style.cursor = edge <= 6 && canEdit ? (axis === "col" ? "col-resize" : "row-resize") : "default";
      return;
    }
    if (d.kind === "resize" && d.axis === axis) {
      const delta = (axis === "col" ? e.clientX : e.clientY) - (d.startPos ?? 0);
      const sz = Math.max(axis === "col" ? 16 : 10, Math.round((d.startSize ?? 0) + delta));
      setLive({ axis, indices: d.indices ?? [index], size: sz });
    } else if (d.kind === "col" || d.kind === "row") {
      const { r, c } = hit(axis === "col" ? e.clientX : HEADER_W + scroller.current!.getBoundingClientRect().left + 5, axis === "row" ? e.clientY : HEADER_H + scroller.current!.getBoundingClientRect().top + 5);
      if (d.kind === "col") props.onSelect({ ar: 0, ac: d.ac ?? index, fr: tab.rows - 1, fc: c }, true);
      else props.onSelect({ ar: d.ar ?? index, ac: 0, fr: r, fc: tab.cols - 1 }, true);
    }
  };
  const headerPointerUp = (axis: "col" | "row") => (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "resize" && d.axis === axis) {
      const delta = (axis === "col" ? e.clientX : e.clientY) - (d.startPos ?? 0);
      const sz = Math.max(axis === "col" ? 16 : 10, Math.round((d.startSize ?? 0) + delta));
      setLive(null);
      if (Math.abs(delta) >= 1) props.onResize(axis, d.index ?? 0, sz, true, d.indices ?? [d.index ?? 0]);
    }
  };
  const headerContext = (kind: "row" | "col", index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const rg = rangeOf(sel);
    const inSel = kind === "col" ? index >= rg.c1 && index <= rg.c2 && rg.r1 === 0 && rg.r2 >= tab.rows - 1 : index >= rg.r1 && index <= rg.r2 && rg.c1 === 0 && rg.c2 >= tab.cols - 1;
    if (!inSel) props.onSelect(kind === "col" ? { ar: 0, ac: index, fr: tab.rows - 1, fc: index } : { ar: index, ac: 0, fr: index, fc: tab.cols - 1 });
    props.onContext({ x: e.clientX, y: e.clientY, kind, index });
  };

  // resize ao vivo: aplica no layout visual (sem tocar nos dados até soltar)
  const liveSize = (axis: "col" | "row", i: number) => (live && live.axis === axis && live.indices.includes(i) ? live.size : null);

  // ---- editor da célula
  useEffect(() => {
    if (editing && editing.mode !== "bar" && editor.current) {
      const el = editor.current;
      el.focus({ preventScroll: true });
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    // só ao abrir a edição em outra célula
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.r, editing?.c, editing?.mode === "bar"]);
  useLayoutEffect(() => {
    const el = editor.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }
  });

  // ---- carregar mais linhas ao chegar ao fim
  const nearEnd = scroll.top + viewH >= layout.totalH - 200 && tab.rows < 100000;

  const ar = sel.ar;
  const ac = sel.ac;
  const selRange = rangeOf(sel);
  const single = selRange.r1 === selRange.r2 && selRange.c1 === selRange.c2;
  const mergeOfActive = merges.origin.get(ar * 1024 + ac);
  const activeRect = rectOf(mergeOfActive ?? { r1: ar, c1: ac, r2: ar, c2: ac });
  const selRect = rectOf(selRange);
  const filter = tab.filter;

  const cells: React.ReactNode[] = [];
  const drawCell = (r: number, c: number) => {
    const key = r * 1024 + c;
    if (merges.covered.has(key)) return;
    const cell = tab.grid[r]?.[c];
    const mg = merges.origin.get(key);
    const frozenR = r < fr;
    const frozenC = c < fc;
    const z = frozenR ? (frozenC ? 4 : 3) : frozenC ? 2 : 1;
    const x = xOf(c);
    const y = yOf(r);
    const wBase = liveSize("col", c) ?? colLeft[c + 1] - colLeft[c];
    const hBase = liveSize("row", r) ?? rowTop[r + 1] - rowTop[r];
    const w = mg ? colLeft[mg.c2 + 1] - colLeft[c] : wBase;
    const h = mg ? rowTop[mg.r2 + 1] - rowTop[r] : hBase;
    let text = "";
    let isNum = false;
    let isBool = false;
    let isErr = false;
    if (editing && editing.mode === "bar" && editing.r === r && editing.c === c) text = editing.text;
    else if (cell && (cell.v !== undefined || cell.f !== undefined)) {
      const v = book.get(tabIndex, r, c);
      text = formatValue(v, cell.fmt);
      isNum = typeof v === "number";
      isBool = typeof v === "boolean";
      isErr = v instanceof FErr;
    }
    // texto que "vaza" para as células vazias da direita
    let ext = 0;
    if (text && !isNum && !cell?.s?.wrap && !cell?.s?.bg && !mg && (cell?.s?.al ?? "l") === "l" && typeof text === "string" && text.length * 7 > w - 8) {
      let cc = c + 1;
      let acc = 0;
      const need = text.length * 7.2 + 8 - w;
      while (cc < tab.cols && cc < c + 12 && acc < need && !tab.grid[r]?.[cc] && !merges.covered.has(r * 1024 + cc) && !(editing && editing.r === r && editing.c === cc)) {
        acc += colLeft[cc + 1] - colLeft[cc];
        cc++;
      }
      ext = acc;
    }
    const isHeaderFilter = !!filter && r === filter.r1 && c >= filter.c1 && c <= filter.c2;
    cells.push(
      <CellView
        key={key}
        r={r}
        c={c}
        x={x}
        y={y}
        w={w}
        h={h}
        ext={ext}
        text={text}
        isNum={isNum}
        isBool={isBool}
        isErr={isErr}
        cell={cell}
        grid={tab.showGrid || !!cell?.s?.bg}
        z={ext ? Math.max(z, 1) + 0.5 : z}
        filterBtn={isHeaderFilter}
        filterOn={isHeaderFilter && !!filter?.rules[c]}
      />,
    );
  };
  for (const r of rowsToRender) for (const c of colsToRender) drawCell(r, c);
  // mesclagens cuja origem está fora da janela mas a área aparece
  if (tab.merges.length) {
    const rs = new Set(rowsToRender);
    const cs = new Set(colsToRender);
    for (const m of tab.merges) {
      if (rs.has(m.r1) && cs.has(m.c1)) continue;
      const vr = rowsToRender.some((r) => r >= m.r1 && r <= m.r2);
      const vc = colsToRender.some((c) => c >= m.c1 && c <= m.c2);
      if (vr && vc && m.r1 >= fr && m.c1 >= fc) drawCell(m.r1, m.c1);
    }
  }

  // ---- cabeçalhos visíveis
  const colHeads = colsToRender.map((c) => {
    const x = xOf(c);
    const w = liveSize("col", c) ?? colLeft[c + 1] - colLeft[c];
    const active = c >= selRange.c1 && c <= selRange.c2;
    const whole = selRange.r1 === 0 && selRange.r2 >= tab.rows - 1;
    return (
      <div
        key={c}
        data-colhead
        onPointerDown={headerPointerDown("col", c)}
        onPointerMove={headerPointerMove("col", c)}
        onPointerUp={headerPointerUp("col")}
        onContextMenu={headerContext("col", c)}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.right - e.clientX <= 6 && canEdit) props.onAutofit(c);
        }}
        className={`absolute top-0 flex items-center justify-center border-r border-b text-[11px] font-medium select-none ${whole && active ? "bg-brand text-white" : active ? "bg-muted font-semibold text-foreground" : "bg-card text-muted-foreground"}`}
        style={{ left: HEADER_W + x, width: w, height: HEADER_H, zIndex: c < fc ? 3 : 1, touchAction: "manipulation" }}
      >
        {colName(c)}
      </div>
    );
  });
  const rowHeads = rowsToRender.map((r) => {
    const y = yOf(r);
    const h = liveSize("row", r) ?? rowTop[r + 1] - rowTop[r];
    const active = r >= selRange.r1 && r <= selRange.r2;
    const whole = selRange.c1 === 0 && selRange.c2 >= tab.cols - 1;
    return (
      <div
        key={r}
        onPointerDown={headerPointerDown("row", r)}
        onPointerMove={headerPointerMove("row", r)}
        onPointerUp={headerPointerUp("row")}
        onContextMenu={headerContext("row", r)}
        className={`absolute left-0 flex items-center justify-center border-r border-b text-[11px] select-none ${whole && active ? "bg-brand text-white" : active ? "bg-muted font-semibold text-foreground" : "bg-card text-muted-foreground"}`}
        style={{ top: y, width: HEADER_W, height: h, zIndex: r < fr ? 3 : 1 }}
      >
        {r + 1}
      </div>
    );
  });

  const editRect = editing && editing.mode !== "bar" ? rectOf(merges.origin.get(editing.r * 1024 + editing.c) ?? { r1: editing.r, c1: editing.c, r2: editing.r, c2: editing.c }) : null;
  const editStyle = editing ? tab.grid[editing.r]?.[editing.c]?.s : undefined;

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      data-sheet-scroller
      className="thin-scroll relative min-h-0 flex-1 overflow-auto overscroll-contain bg-background"
      style={{ ["--sheet-line" as string]: "color-mix(in oklch, var(--border), var(--foreground) 6%)", fontSize: BASE_FONT }}
    >
      {/* teclado: alvo invisível que recebe digitação, atalhos e colar/copiar */}
      <textarea
        ref={sink}
        aria-label="Planilha: use as setas para navegar e digite para editar"
        inputMode="none"
        className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
        tabIndex={0}
        readOnly
        onKeyDown={props.onSinkKeyDown}
        onCopy={props.onSinkCopy}
        onCut={props.onSinkCut}
        onPaste={props.onSinkPaste}
      />
      <div style={{ width: HEADER_W + layout.totalW + 60, height: HEADER_H + layout.totalH + 44 }} className="relative">
        {/* linha de letras */}
        <div className="sticky top-0 z-30 border-b bg-card" style={{ height: HEADER_H, width: HEADER_W + layout.totalW + 60 }}>
          <div
            className="sticky left-0 z-40 border-r border-b bg-card"
            style={{ width: HEADER_W, height: HEADER_H }}
            onPointerDown={() => props.onSelect({ ar: 0, ac: 0, fr: tab.rows - 1, fc: tab.cols - 1 })}
            title="Selecionar tudo"
          />
          <div className="absolute top-0 left-0 h-full w-full">{colHeads}</div>
        </div>
        {/* corpo */}
        <div className="relative" style={{ height: layout.totalH + 44, width: HEADER_W + layout.totalW + 60 }}>
          <div className="sticky left-0 z-20 border-r bg-card" style={{ width: HEADER_W, height: layout.totalH + 44 }}>
            {rowHeads}
          </div>
          <div
            className="absolute top-0"
            style={{ left: HEADER_W, width: layout.totalW + 60, height: layout.totalH + 44, touchAction: "pan-x pan-y" }}
            onPointerDown={onCellsPointerDown}
            onPointerMove={onCellsPointerMove}
            onPointerUp={onCellsPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onDoubleClick={onCellsDouble}
            onContextMenu={onCellsContext}
          >
            {cells}
            {/* linhas que separam a área congelada */}
            {fr > 0 && <div className="pointer-events-none absolute z-[5] h-0.5 bg-foreground/30" style={{ left: 0, top: scroll.top + layout.frozenH - 1, width: layout.totalW + 60 }} />}
            {fc > 0 && <div className="pointer-events-none absolute z-[5] w-0.5 bg-foreground/30" style={{ top: 0, left: scroll.left + layout.frozenW - 1, height: layout.totalH + 44 }} />}
            {/* seleção */}
            {!single && <div className="pointer-events-none absolute z-[6] border border-brand bg-brand/10" style={selRect} />}
            <div className="pointer-events-none absolute z-[7] border-2 border-brand" style={{ left: activeRect.left - 1, top: activeRect.top - 1, width: activeRect.width + 1, height: activeRect.height + 1 }} />
            {canEdit && !editing && (
              <div
                onPointerDown={startFill}
                onPointerMove={onCellsPointerMove}
                onPointerUp={onCellsPointerUp}
                className="absolute z-[8] size-2.5 cursor-crosshair rounded-[1px] border border-background bg-brand max-md:size-4"
                style={{ left: selRect.left + selRect.width - 6, top: selRect.top + selRect.height - 6 }}
                aria-hidden
              />
            )}
            {fillTarget && <div className="pointer-events-none absolute z-[6] border-2 border-dashed border-brand/70" style={rectOf(fillTarget)} />}
            {/* editor */}
            {editRect && editing && (
              <textarea
                ref={editor}
                value={editing.text}
                rows={1}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                onChange={(e) => props.onEditChange(e.target.value)}
                onKeyDown={props.onEditKeyDown}
                onBlur={props.onEditBlur}
                className="absolute z-[10] resize-none overflow-hidden border-2 border-brand bg-background px-1 leading-tight text-foreground shadow-md outline-none"
                style={{
                  left: editRect.left - 1,
                  top: editRect.top - 1,
                  minWidth: editRect.width + 1,
                  minHeight: editRect.height + 1,
                  width: Math.max(editRect.width + 1, Math.min(520, editing.text.length * 7.6 + 24)),
                  fontWeight: editStyle?.b ? 700 : undefined,
                  fontStyle: editStyle?.i ? "italic" : undefined,
                  fontSize: editStyle?.fs ? Math.round(editStyle.fs * 1.333) : undefined,
                  textAlign: editStyle?.al === "r" ? "right" : editStyle?.al === "c" ? "center" : "left",
                }}
              />
            )}
            {nearEnd && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={props.onLoadMore}
                className="absolute rounded-md border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                style={{ left: 8, top: layout.totalH + 8 }}
              >
                Adicionar mais 1.000 linhas
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
