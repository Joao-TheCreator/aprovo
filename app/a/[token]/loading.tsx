import { Skeleton } from "@/components/ui/skeleton";

/** Shape of the public approval page while the link resolves (aurora + header card + grid). */
export default function ApprovalLinkLoading() {
  return (
    <div className="bg-background relative isolate flex flex-1 flex-col">
      <div aria-hidden className="bg-aurora pointer-events-none fixed inset-0 -z-10" />
      <main
        aria-busy="true"
        aria-label="Carregando aprovação"
        className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-6 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-10"
      >
        <div className="glass flex flex-col gap-4 rounded-4xl border border-white/10 p-5">
          <Skeleton className="h-6 w-24 rounded-full" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-16 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-4 w-40 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-6 w-full rounded-full" />
          <Skeleton className="h-6 w-2/3 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-3xl">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-none" />
          ))}
        </div>
      </main>
    </div>
  );
}
