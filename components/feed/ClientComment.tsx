import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Last comment from the client shown as an incoming chat bubble (docs/14, area B). Used in the
 * post detail (Tela 04) and in the editor (Tela 05). Keeps the "Comentário do cliente" label.
 */
export function ClientComment({ comment, className }: { comment: string; className?: string }) {
  return (
    <div role="status" className={cn("animate-rise flex items-end gap-2", className)}>
      <span
        aria-hidden
        className="bg-warning text-ink flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <MessageCircle className="size-4.5" strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-micro text-warning-ink pl-3 uppercase">Comentário do cliente</p>
        <div className="bg-surface-2 border-border text-body rounded-3xl rounded-bl-md border px-4 py-3">
          <p className="whitespace-pre-line">{comment}</p>
        </div>
      </div>
    </div>
  );
}
