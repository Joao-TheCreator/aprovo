import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Skeleton } from "@/components/ui/skeleton";

/** Title block shared by the skeletons: micro eyebrow + display heading. */
function HeadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3 w-24 rounded-full" />
      <Skeleton className="h-9 w-56 rounded-full" />
    </div>
  );
}

/** Loading state of the profile list (cards with avatar, @ and counter pills). */
export function ProfilesListSkeleton() {
  return (
    <PhoneFrame role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">Carregando perfis…</span>
      <div className="flex flex-col gap-4">
        <HeadingSkeleton />
        <Skeleton className="h-12 w-full rounded-full sm:w-72" />
      </div>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="bg-card border-border shadow-card flex items-center gap-4 rounded-3xl border p-4"
          >
            <Skeleton className="size-[3.75rem] shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/5 rounded-full" />
              <Skeleton className="h-3 w-3/5 rounded-full" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </PhoneFrame>
  );
}

/** Generic page skeleton: heading + a few stacked cards. */
export function CardsPageSkeleton({ label, cards = 3 }: { label: string; cards?: number }) {
  return (
    <PhoneFrame role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">{label}</span>
      <HeadingSkeleton />
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="bg-card border-border shadow-card flex flex-col gap-4 rounded-3xl border p-5"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-2xl" />
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-3 w-4/5 rounded-full" />
          <Skeleton className="h-12 w-40 rounded-full" />
        </div>
      ))}
    </PhoneFrame>
  );
}
