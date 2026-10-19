import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="flex h-12 items-center border-b px-3 sm:px-5">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex gap-3 overflow-hidden p-3 sm:px-5">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="w-[82vw] max-w-[304px] shrink-0 rounded-xl bg-muted/60 p-2 sm:w-[288px]">
            <Skeleton className="mb-3 h-8" />
            <Skeleton className="mb-2 h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
