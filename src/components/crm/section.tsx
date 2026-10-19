import { cn } from "@/lib/utils";

export function Section({
  title,
  action,
  children,
  className,
  tour,
}: {
  tour?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-tour={tour} className={cn("rounded-xl border bg-card p-4", className)}>
      <header className="mb-3 flex items-center gap-2">
        <h2 className="label">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      {children}
    </section>
  );
}
