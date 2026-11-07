"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { LiveEvent } from "@/lib/approvals/contracts";
import { shortCaption } from "@/lib/approvals/ui-format";
import { useLiveEvents } from "@/lib/approvals/ui-live";

/** Invisible: listens to approval events of a profile, shows toasts and refreshes server data. */
export function LiveUpdates({
  profileId,
  captions,
}: {
  profileId: string;
  /** Optional postId -> caption map to name the post in toasts. */
  captions?: Record<string, string | null>;
}) {
  const router = useRouter();

  useLiveEvents(profileId, (event: LiveEvent) => {
    if (event.type === "post.status") {
      const who = event.decision?.approverName?.trim() || "O cliente";
      const caption = captions?.[event.postId];
      const target = caption ? `'${shortCaption(caption, 30)}'` : "uma publicação";
      if (event.status === "published") {
        toast.success(`Publicado no Instagram: ${target}`);
      } else if (event.status === "publish_failed") {
        // The event carries no error text (lib/realtime/events.ts is owned by T10): generic message.
        toast.error(`Não foi possível publicar ${target}. Veja o motivo na lista de agendadas.`);
      } else if (event.decision?.decision === "approved") toast.success(`${who} aprovou ${target}`);
      else if (event.decision?.decision === "changes_requested")
        toast.info(`${who} pediu ajustes em ${target}`);
      router.refresh();
    } else if (event.type === "link.opened") {
      toast("Link de aprovação aberto", { duration: 2500 });
      router.refresh();
    }
  });

  return null;
}
