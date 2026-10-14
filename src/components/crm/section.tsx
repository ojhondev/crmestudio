import { cn } from "@/lib/utils";

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-white p-4", className)}>
      <header className="mb-3 flex items-center gap-2">
        <h2 className="label">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      {children}
    </section>
  );
}
