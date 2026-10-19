import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="mb-4 h-8 w-40" />
      <Skeleton className="mb-3 h-9 rounded-lg" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3 border-b py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
