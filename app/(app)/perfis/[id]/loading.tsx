import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Skeleton } from "@/components/ui/skeleton";

/** Feed skeleton (docs/14): toolbar chips, Instagram header and a 3-column square grid. */
export default function PerfilLoading() {
  return (
    <div role="status" aria-label="Carregando o perfil" className="flex flex-col gap-4">
      <PhoneFrame className="flex gap-2 overflow-hidden">
        {[36, 28, 30, 24].map((w, i) => (
          <Skeleton key={i} className="h-11 shrink-0 rounded-full" style={{ width: `${w}%` }} />
        ))}
      </PhoneFrame>
      <PhoneFrame
        data-theme="light"
        className="md:shadow-card overflow-hidden bg-white md:rounded-[2rem] md:border md:border-neutral-200"
      >
        <div className="flex items-center gap-6 p-4">
          <Skeleton className="size-[86px] shrink-0 rounded-full" />
          <div className="flex flex-1 justify-around">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Skeleton className="h-4 w-8 rounded-md" />
                <Skeleton className="h-3 w-14 rounded-md" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <Skeleton className="h-3 w-1/3 rounded-md" />
          <Skeleton className="h-3 w-2/3 rounded-md" />
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-none" />
          ))}
        </div>
      </PhoneFrame>
    </div>
  );
}
