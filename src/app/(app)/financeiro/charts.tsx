"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthPoint } from "@/lib/finance";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthShort = (key: string) => MONTHS[Number(key.slice(5)) - 1].slice(0, 3);
const monthLong = (key: string) => `${MONTHS[Number(key.slice(5)) - 1]} de ${key.slice(0, 4)}`;

const axis = (cents: number) => {
  const v = cents / 100;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return String(Math.round(v));
};

/** Escala "redonda": 4 degraus em 1/2/2,5/5 × 10ⁿ. */
function niceScale(maxCents: number, steps = 4) {
  const raw = Math.max(maxCents, 100) / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const ticks = Array.from({ length: Math.ceil(Math.max(maxCents, 100) / step) + 1 }, (_, i) => i * step);
  return { max: ticks[ticks.length - 1], ticks };
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Coluna com os dois cantos de cima arredondados (4px) e base reta. */
const topRounded = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.max(0, Math.min(r, h / 2, w / 2));
  return `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`;
};

type Labels = { in: string; out: string; resultIn: string; resultOut: string; result: string };

/**
 * Colunas agrupadas por mês: receita × despesa. Cor cheia = realizado (pago/recebido),
 * cor clara = em aberto. Toque/passe o mouse em um mês para ler os números.
 */
export function MonthlyColumns({
  data,
  selectedKey,
  mode = "realizado",
  title,
}: {
  data: MonthPoint[];
  selectedKey?: string;
  /** "realizado": pago + em aberto empilhados · "aberto": só o que ainda vai entrar/sair */
  mode?: "realizado" | "aberto";
  title: string;
}) {
  const [ref, w] = useWidth();
  const initial = Math.max(0, data.findIndex((d) => d.key === selectedKey));
  const [sel, setSel] = useState(initial >= 0 ? initial : data.length - 1);
  const H = 224;
  const L = 46;
  const R = 6;
  const T = 10;
  const B = 26;
  const labels: Labels =
    mode === "realizado"
      ? { in: "Receita", out: "Despesa", resultIn: "recebido", resultOut: "pago", result: "Resultado realizado" }
      : { in: "A receber", out: "A pagar", resultIn: "", resultOut: "", result: "Saldo previsto" };

  const tot = (d: MonthPoint) => ({ in: d.inPaid + d.inOpen, out: d.outPaid + d.outOpen });
  const maxVal = Math.max(0, ...data.flatMap((d) => [tot(d).in, tot(d).out]));
  const { max, ticks } = niceScale(maxVal);
  const empty = maxVal === 0;
  const iw = Math.max(0, w - L - R);
  const ih = H - T - B;
  const y = (v: number) => T + ih - (v / max) * ih;
  const gw = data.length ? iw / data.length : 0;
  const bw = Math.min(24, Math.max(6, gw * 0.34));
  const GAP = 2; // espaço de superfície entre segmentos e entre barras vizinhas
  const skip = gw < 30 ? 2 : 1;

  const bar = (key: string, x: number, paid: number, openV: number, color: string) => {
    const yPaid = y(paid);
    const yTop = y(paid + openV);
    const hasOpen = openV > 0;
    const paidH = paid > 0 ? y(0) - yPaid : 0;
    const openH = hasOpen ? Math.max(0, yPaid - yTop - (paid > 0 ? GAP : 0)) : 0;
    return (
      <g key={key} style={{ color }}>
        {paid > 0 && <path d={topRounded(x, yPaid, bw, paidH, hasOpen && openH > 1 ? 0 : 4)} fill="currentColor" />}
        {hasOpen && openH > 0.5 && <path d={topRounded(x, yTop, bw, openH)} fill="currentColor" fillOpacity={0.38} />}
      </g>
    );
  };

  const cur = data[sel] ?? data[data.length - 1];
  const c = tot(cur);
  const result = mode === "realizado" ? cur.inPaid - cur.outPaid : c.in - c.out;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: "var(--fin-in)" }} />
          {labels.in}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: "var(--fin-out)" }} />
          {labels.out}
        </span>
        {mode === "realizado" && <span>cor cheia = já pago · clara = em aberto</span>}
      </div>

      <div ref={ref} className="w-full" style={{ height: H }}>
        {w > 0 && (
          <svg width={w} height={H} role="group" aria-label={title} className="block overflow-visible text-foreground">
            {ticks.map((tk) => (
              <g key={tk}>
                <line x1={L} x2={w - R} y1={y(tk)} y2={y(tk)} stroke="currentColor" strokeOpacity={tk === 0 ? 0.28 : 0.09} strokeWidth={1} />
                <text x={L - 8} y={y(tk)} textAnchor="end" dominantBaseline="middle" fontSize={10.5} fill="currentColor" fillOpacity={0.55}>
                  {tk === 0 ? "0" : axis(tk)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const gx = L + i * gw;
              const cx = gx + gw / 2;
              const t = tot(d);
              const active = i === sel;
              return (
                <g key={d.key}>
                  {active && <rect x={gx + 1} y={T} width={Math.max(0, gw - 2)} height={ih} rx={6} fill="currentColor" fillOpacity={0.05} />}
                  {bar(`${d.key}-in`, cx - bw - GAP / 2, d.inPaid, d.inOpen, "var(--fin-in)")}
                  {bar(`${d.key}-out`, cx + GAP / 2, d.outPaid, d.outOpen, "var(--fin-out)")}
                  {i % skip === 0 && (
                    <text x={cx} y={H - 8} textAnchor="middle" fontSize={10.5} fill="currentColor" fillOpacity={active ? 0.95 : 0.55} fontWeight={active ? 600 : 400}>
                      {monthShort(d.key)}
                    </text>
                  )}
                  {/* área de toque: coluna inteira, bem maior que a barra */}
                  <rect
                    x={gx}
                    y={0}
                    width={gw}
                    height={H}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${monthLong(d.key)}: ${labels.in} ${money(t.in)}, ${labels.out} ${money(t.out)}`}
                    aria-pressed={active}
                    className="cursor-pointer outline-none focus-visible:stroke-[var(--ring)]"
                    style={{ strokeWidth: 2 }}
                    onPointerEnter={() => setSel(i)}
                    onFocus={() => setSel(i)}
                    onClick={() => setSel(i)}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {empty && <p className="mt-1 text-[12.5px] text-muted-foreground">Sem lançamentos neste período.</p>}

      <div className="mt-3 grid gap-2.5 rounded-xl bg-muted/50 p-3 text-[13px]" aria-live="polite">
        <p className="label capitalize">{monthLong(cur.key)}</p>
        {(
          [
            { color: "var(--fin-in)", label: labels.in, total: c.in, paid: cur.inPaid, open: cur.inOpen, verb: "recebido" },
            { color: "var(--fin-out)", label: labels.out, total: c.out, paid: cur.outPaid, open: cur.outOpen, verb: "pago" },
          ] as const
        ).map((row) => (
          <div key={row.label} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2">
            <span className="size-2.5 self-center rounded-[3px]" style={{ background: row.color }} />
            <span>{row.label}</span>
            <span className="num text-right">{money(row.total)}</span>
            {mode === "realizado" && (
              <span className="col-span-3 col-start-2 text-xs text-muted-foreground">
                {row.verb} {money(row.paid)} · em aberto {money(row.open)}
              </span>
            )}
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t pt-2">
          <span className="text-muted-foreground">{labels.result}</span>
          <span className={cn("num text-[15px]", result < 0 ? "text-destructive" : "text-foreground")}>
            {result < 0 ? "−" : ""}
            {money(Math.abs(result))}
          </span>
        </div>
      </div>

      <details className="mt-2 text-[12.5px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver em tabela</summary>
        <div className="thin-scroll mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-right tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-medium">Mês</th>
                <th className="font-medium">{labels.in}</th>
                {mode === "realizado" && <th className="font-medium">em aberto</th>}
                <th className="font-medium">{labels.out}</th>
                {mode === "realizado" && <th className="font-medium">em aberto</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t">
                  <td className="py-1 text-left capitalize">{monthShort(d.key)}/{d.key.slice(2, 4)}</td>
                  <td>{money(d.inPaid)}</td>
                  {mode === "realizado" && <td className="text-muted-foreground">{money(d.inOpen)}</td>}
                  <td>{money(d.outPaid)}</td>
                  {mode === "realizado" && <td className="text-muted-foreground">{money(d.outOpen)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
