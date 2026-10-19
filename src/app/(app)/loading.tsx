import { Skeleton } from "@/components/ui/skeleton";

/** Aparece na hora ao navegar, enquanto o servidor prepara a tela. */
export default function Loading() {
  return (
    <div className="px-5 pt-6 sm:px-8 sm:pt-7 lg:px-10" aria-busy="true" aria-label="Carregando">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-6 h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-5 h-64 rounded-xl" />
    </div>
  );
}
