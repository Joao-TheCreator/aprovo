import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Skeleton } from "@/components/ui/skeleton";

/** "Agendadas" skeleton: title plus three sections of timeline rows. */
export default function AgendadasLoading() {
  return (
    <PhoneFrame role="status" aria-label="Carregando as agendadas" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-9 w-48 rounded-xl" />
      </div>
      {[2, 1, 1].map((rows, s) => (
        <div key={s} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-2xl" />
            <Skeleton className="h-6 w-32 rounded-lg" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="bg-card border-border flex gap-3 rounded-3xl border p-3">
              <Skeleton className="size-16 shrink-0 rounded-2xl" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-3 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </PhoneFrame>
  );
}
