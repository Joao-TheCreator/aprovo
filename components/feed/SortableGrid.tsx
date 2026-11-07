"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState } from "react";

import { GridCell } from "@/components/feed/GridCell";
import { moveId, type MoveDirection } from "@/lib/posts/reorder";
import type { FeedItem } from "@/lib/profiles/contracts";
import { haptic } from "@/lib/ui/haptics";

export type PlannedItem = Extract<FeedItem, { kind: "planned" }>;

type Common = {
  ratio: "1:1" | "3:4";
  showStatus: boolean;
  onOpen: (item: FeedItem) => void;
};

function SortableCell({
  item,
  disabled,
  menuEnabled,
  index,
  count,
  onMove,
  selected,
  selecting,
  guardedOpen,
  ...common
}: Common & {
  item: PlannedItem;
  disabled: boolean;
  menuEnabled: boolean;
  index: number;
  count: number;
  onMove: (id: string, dir: MoveDirection) => void;
  selected: boolean;
  selecting: boolean;
  guardedOpen: (item: FeedItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  return (
    <GridCell
      item={item}
      ratio={common.ratio}
      showStatus={common.showStatus}
      onOpen={guardedOpen}
      sortable={{
        setNodeRef,
        style: { transform: CSS.Transform.toString(transform), transition },
        isDragging,
        // Space starts a keyboard drag (Enter keeps opening the post); see sensors below.
        buttonProps: { ...attributes, ...listeners },
      }}
      menu={
        menuEnabled
          ? { canUp: index > 0, canDown: index < count - 1, onMove: (d) => onMove(item.id, d) }
          : undefined
      }
      selection={selecting ? { selected } : undefined}
    />
  );
}

/**
 * Planned cells of the grid (rendered as a fragment inside the parent CSS grid).
 * Imported cells are not part of the sortable context, so they cannot be dragged or receive drops.
 */
export function SortableGrid({
  items,
  dragDisabled,
  menuEnabled,
  selecting,
  selectedIds,
  onReorder,
  ...common
}: Common & {
  /** Planned items in current order (the full list when dragging is enabled). */
  items: PlannedItem[];
  dragDisabled: boolean;
  menuEnabled: boolean;
  selecting: boolean;
  selectedIds: ReadonlySet<string>;
  /** Called with the new order of all planned ids. */
  onReorder: (next: string[], prev: string[]) => void;
}) {
  const sensors = useSensors(
    // Mouse: drag after moving 6px. Touch: long press (250 ms) so scrolling still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastDragEnd = useRef(0);
  const ids = items.map((i) => i.id);
  const active = items.find((i) => i.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    lastDragEnd.current = Date.now();
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const from = ids.indexOf(String(a.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, String(a.id));
    haptic("tap");
    onReorder(next, ids);
  }
  function guardedOpen(item: FeedItem) {
    // A drag ending on a click (keyboard Space, long-press release) must not open the post.
    if (Date.now() - lastDragEnd.current < 300) return;
    common.onOpen(item);
  }
  function onMove(id: string, dir: MoveDirection) {
    const next = moveId(ids, id, dir);
    if (next.some((v, i) => v !== ids[i])) {
      haptic("tap");
      onReorder(next, ids);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy} disabled={dragDisabled}>
        {items.map((item, index) => (
          <SortableCell
            key={item.id}
            item={item}
            index={index}
            count={items.length}
            disabled={dragDisabled}
            menuEnabled={menuEnabled}
            onMove={onMove}
            selecting={selecting}
            selected={selectedIds.has(item.id)}
            guardedOpen={guardedOpen}
            {...common}
          />
        ))}
      </SortableContext>
      <DragOverlay>
        {active ? (
          <GridCell
            item={active}
            ratio={common.ratio}
            showStatus={common.showStatus}
            onOpen={() => {}}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
