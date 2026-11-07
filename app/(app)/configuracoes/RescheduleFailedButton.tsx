"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { rescheduleFailedForConnection } from "@/lib/publishing/actions";

export function RescheduleFailedButton({
  connectionId,
  count,
}: {
  connectionId: string;
  count: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="h-auto min-h-12 w-full py-3 text-center whitespace-normal"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await rescheduleFailedForConnection(connectionId);
          if (res.ok) {
            const n = res.data.rescheduled;
            toast.success(n === 1 ? "1 publicação reagendada" : `${n} publicações reagendadas`);
          } else {
            toast.error(res.message);
          }
          router.refresh();
        })
      }
    >
      <RotateCcw aria-hidden className={pending ? "animate-spin" : undefined} />
      {pending
        ? "Reagendando…"
        : count === 1
          ? "Reagendar a 1 publicação que falhou"
          : `Reagendar as ${count} publicações que falharam`}
    </Button>
  );
}
