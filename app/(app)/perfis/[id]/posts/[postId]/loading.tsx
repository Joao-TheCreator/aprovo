import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Skeleton } from "@/components/ui/skeleton";

/** Post detail skeleton (docs/14): Instagram post in the light island + action card. */
export default function PostLoading() {
  return (
    <div role="status" aria-label="Carregando a publicação" className="flex flex-col gap-4">
      <PhoneFrame
        data-theme="light"
        className="md:shadow-card overflow-hidden bg-white pb-4 md:rounded-[2rem] md:border md:border-neutral-200"
      >
        <div className="flex h-14 items-center gap-3 px-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-3.5 w-32 rounded-md" />
        </div>
        <Skeleton className="aspect-square w-full rounded-none" />
        <div className="flex flex-col gap-2 px-3 pt-4">
          <Skeleton className="h-3 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
        </div>
      </PhoneFrame>
      <PhoneFrame>
        <div className="glass flex flex-col gap-3 rounded-4xl border border-white/10 p-3">
          <Skeleton className="h-7 w-28 rounded-full" />
          <div className="flex gap-2">
            <Skeleton className="h-12 flex-1 rounded-full" />
            <Skeleton className="h-12 flex-1 rounded-full" />
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}
