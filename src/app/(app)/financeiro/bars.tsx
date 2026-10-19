import { money } from "@/lib/format";
import type { Ranked } from "@/lib/finance";

/**
 * Barras horizontais ordenadas (magnitude): um tom só, base reta, ponta arredondada.
 * O valor fica no texto (não na cor da série); a tabela é a própria lista.
 */
export function HBars({ items, tone, empty = "Sem dados neste período." }: { items: Ranked[]; tone: "in" | "out" | "neutral"; empty?: string }) {
  if (!items.length) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const color = tone === "in" ? "var(--fin-in)" : tone === "out" ? "var(--fin-out)" : "var(--foreground)";
  return (
    <ul className="grid gap-3">
      {items.map((i) => (
        <li key={i.label} className="grid gap-1">
          <div className="flex items-baseline gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate" title={i.label}>
              {i.label}
            </span>
            <span className="num shrink-0">{money(i.value)}</span>
            <span className="w-9 shrink-0 text-right text-[11.5px] text-muted-foreground tabular-nums">{Math.round((i.value / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted" role="img" aria-label={`${i.label}: ${money(i.value)}`}>
            <div className="h-full rounded-r-[4px] rounded-l-[2px]" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: color, opacity: tone === "neutral" ? 0.72 : 1 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
