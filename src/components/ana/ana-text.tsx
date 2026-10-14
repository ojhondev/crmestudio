import { Fragment } from "react";
import { cn } from "@/lib/utils";

/** Renderização leve do texto da Ana: parágrafos, listas com "-" e **negrito**. */
export function AnaText({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={cn("grid gap-2.5 text-[13.5px] leading-relaxed", className)}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l));
        if (isList)
          return (
            <ul key={i} className="grid gap-1 pl-4">
              {lines.map((l, j) => (
                <li key={j} className="list-disc marker:text-brand/70">
                  {inline(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ""))}
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="whitespace-pre-wrap">
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
