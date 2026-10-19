import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import type { Block } from "@/lib/help";

export function HelpBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="grid gap-5 text-[14.5px] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.t === "p") return <p key={i}>{b.text}</p>;
        if (b.t === "list")
          return (
            <div key={i} className="grid gap-2">
              {b.title && <h3 className="h-section text-[15px]">{b.title}</h3>}
              <ul className="grid gap-1.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j} className="list-disc marker:text-brand/70">
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          );
        if (b.t === "steps")
          return (
            <div key={i} className="grid gap-2.5">
              {b.title && <h3 className="h-section text-[15px]">{b.title}</h3>}
              <ol className="grid gap-2">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] text-brand">{j + 1}</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        const warn = b.t === "warn";
        const Icon = warn ? TriangleAlert : Lightbulb;
        return (
          <div
            key={i}
            className={
              warn
                ? "flex gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                : "flex gap-3 rounded-xl border border-brand/25 bg-brand-soft p-3.5"
            }
          >
            <Icon className={warn ? "mt-0.5 size-4 shrink-0" : "mt-0.5 size-4 shrink-0 text-brand"} />
            <p>
              <strong className="font-semibold">{warn ? "Atenção: " : "Dica: "}</strong>
              {b.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export { Info };
