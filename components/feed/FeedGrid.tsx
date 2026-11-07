import { Plus } from "lucide-react";

import { GridCell } from "@/components/feed/GridCell";
import { SortableGrid, type PlannedItem } from "@/components/feed/SortableGrid";
import type { FeedItem } from "@/lib/profiles/contracts";

const EMPTY: ReadonlySet<string> = new Set();
const NOOP = () => {};

export function FeedGrid({
  items,
  ratio,
  showStatus,
  onOpen,
  dragDisabled = true,
  selecting = false,
  selectedIds,
  onReorder,
  emptyText = "Grade em branco, ideia nova.",
}: {
  items: FeedItem[];
  ratio: "1:1" | "3:4";
  showStatus: boolean;
  onOpen: (item: FeedItem) => void;
  /** True in client mode, while a status filter is active or while selecting. */
  dragDisabled?: boolean;
  selecting?: boolean;
  selectedIds?: ReadonlySet<string>;
  onReorder?: (next: string[], prev: string[]) => void;
  /** Text next to the dashed cell when there is nothing to show. */
  emptyText?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-0.5">
        <div
          aria-hidden
          className={`flex flex-col items-center justify-center gap-1 border border-dashed border-neutral-400 text-neutral-500 ${ratio === "3:4" ? "aspect-[3/4]" : "aspect-square"}`}
        >
          <Plus className="size-6" />
        </div>
        <p className="col-span-2 flex items-center px-3 text-sm text-neutral-500">{emptyText}</p>
      </div>
    );
  }
  const planned = items.filter((i): i is PlannedItem => i.kind === "planned");
  const imported = items.filter((i) => i.kind === "imported");
  const canReorder = showStatus && !dragDisabled && !selecting && onReorder !== undefined;
  return (
    <div className="grid grid-cols-3 gap-0.5">
      <SortableGrid
        items={planned}
        ratio={ratio}
        showStatus={showStatus}
        onOpen={onOpen}
        dragDisabled={!canReorder}
        menuEnabled={canReorder}
        selecting={showStatus && selecting}
        selectedIds={selectedIds ?? EMPTY}
        onReorder={onReorder ?? NOOP}
      />
      {imported.map((item) => (
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
