import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="px-5 pt-6 pb-4 sm:px-8 sm:pt-7 sm:pb-5 lg:px-10">
        <Skeleton className="mb-2 h-3 w-24" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex gap-3 overflow-hidden px-5 sm:px-8 lg:px-10">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="w-[80vw] max-w-[300px] shrink-0 rounded-xl bg-muted/60 p-2 sm:w-[272px]">
            <Skeleton className="mb-3 h-4 w-28" />
            <Skeleton className="mb-2 h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
