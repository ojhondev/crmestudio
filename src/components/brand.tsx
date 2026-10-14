import { cn } from "@/lib/utils";

/** Marca "R" do Estúdio Restaura (mesma geometria do logo do site). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 34 42" aria-hidden className={cn("h-6 w-auto", className)}>
      <g fill="#c8472d">
        <rect x="0" y="0.5" width="9" height="41" rx="1.4" />
        <circle cx="21.5" cy="10" r="9.6" />
        <path d="M12 22.6c0-.6.5-1.1 1.1-1.1h8.4c.4 0 .8.2 1 .6l10.9 18.4c.3.5-.1 1-.6 1H13.1c-.6 0-1.1-.5-1.1-1.1z" />
      </g>
    </svg>
  );
}

export function BrandLogo({ className, light }: { className?: string; light?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={light ? "/logo-white.png" : "/logo.png"}
      alt="Estúdio Restaura"
      className={cn("h-8 w-auto", className)}
    />
  );
}
