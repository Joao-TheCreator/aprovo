"use client";

import { Check, MessageCircle } from "lucide-react";

import { GridCell } from "@/components/feed/GridCell";
import type { FeedItem, GridRatio } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

export type PublicItemState = "pending" | "approved" | "changes" | "locked";

/**
 * Read-only grid for the public page (lives inside the light Instagram island). Items of the
 * request get a gradient ring; pending ones also get a bouncing "novo" tag, decided ones a
 * check/comment badge. Everything else is dimmed so the request stands out.
 */
export function PublicFeedGrid({
  items,
  ratio,
  highlightIds,
  onOpen,
  states,
  activeId,
}: {
  items: FeedItem[];
  ratio: GridRatio;
  highlightIds: Set<string>;
  onOpen: (postId: string) => void;
  /** Optional per-item state of the request items (badge on the cell). */
  states?: Record<string, PublicItemState>;
  /** Item currently in the approval bar: thicker ring. */
  activeId?: string | null;
}) {
  return (
    <ul className="grid grid-cols-3 gap-0.5">
      {items.map((item) => {
        const highlighted = item.kind === "planned" && highlightIds.has(item.id);
        const state = highlighted ? (states?.[item.id] ?? "pending") : null;
        const active = highlighted && activeId === item.id;
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className={cn(
              "relative",
              highlighted ? "z-10" : highlightIds.size > 0 && "opacity-50 saturate-50",
            )}
          >
            <GridCell
              item={item}
              ratio={ratio}
              showStatus={false}
              onOpen={() => highlighted && onOpen(item.id)}
            />
            {highlighted ? (
              <span
                aria-hidden
                className={cn(
                  "bg-gradient-brand pointer-events-none absolute inset-0 transition-[padding] duration-(--ap-dur-fast) [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]",
                  active ? "p-1" : "p-[3px]",
                )}
              />
            ) : null}
            {state === "pending" ? (
              <span
                aria-hidden
                className="bg-gradient-brand text-on-brand shadow-glow pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 font-sans text-[10px] leading-4 font-bold motion-safe:animate-bounce"
              >
                <span className="size-1.5 rounded-full bg-current" />
                novo
              </span>
            ) : null}
            {state === "approved" || state === "changes" ? (
              <span
                aria-hidden
                className={cn(
                  "animate-success-pop text-ink pointer-events-none absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full",
                  state === "approved" ? "bg-gradient-success" : "bg-warning",
                )}
              >
                {state === "approved" ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  <MessageCircle className="size-3.5" strokeWidth={2.5} />
                )}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
