import { Plus } from "lucide-react";

import { GridCell } from "@/components/feed/GridCell";
import type { FeedItem } from "@/lib/profiles/contracts";

export function FeedGrid({
  items,
  ratio,
  showStatus,
  onOpen,
}: {
  items: FeedItem[];
  ratio: "1:1" | "3:4";
  showStatus: boolean;
  onOpen: (item: FeedItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-0.5">
        <div
          className={`flex flex-col items-center justify-center gap-1 border border-dashed border-neutral-400 text-neutral-500 ${ratio === "3:4" ? "aspect-[3/4]" : "aspect-square"}`}
        >
          <Plus aria-hidden className="size-6" />
        </div>
        <p className="col-span-2 flex items-center px-3 text-sm text-neutral-500">
          Nenhuma publicação ainda
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {items.map((item) => (
        <GridCell
          key={`${item.kind}-${item.id}`}
          item={item}
          ratio={ratio}
          showStatus={showStatus}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
