"use client";

import { GridCell } from "@/components/feed/GridCell";
import type { FeedItem, GridRatio } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

/** Read-only grid for the public page: items of the request get a purple ring, others are dimmed. */
export function PublicFeedGrid({
  items,
  ratio,
  highlightIds,
  onOpen,
}: {
  items: FeedItem[];
  ratio: GridRatio;
  highlightIds: Set<string>;
  onOpen: (postId: string) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-0.5">
      {items.map((item) => {
        const highlighted = item.kind === "planned" && highlightIds.has(item.id);
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className={cn(
              "relative",
              highlighted
                ? "ring-roxo z-10 ring-[3px] ring-inset"
                : highlightIds.size > 0 && "opacity-60",
            )}
          >
            <GridCell
              item={item}
              ratio={ratio}
              showStatus={false}
              onOpen={() => highlighted && onOpen(item.id)}
            />
            {highlighted ? (
              <span aria-hidden className="ring-roxo pointer-events-none absolute inset-0 ring-[3px] ring-inset" />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
