import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end gap-4 px-5 pt-7 pb-5 sm:px-8 lg:px-10", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="label mb-1.5">{eyebrow}</p>}
        <h1 className="h-display text-[28px] sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 pb-12 sm:px-8 lg:px-10", className)}>{children}</div>;
}

export function EmptyState({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4.5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-sm text-[13px] text-muted-foreground">{children}</div>}
    </div>
  );
}
