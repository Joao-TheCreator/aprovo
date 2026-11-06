/** Pure helpers for ordering planned posts in the grid (no I/O; safe on client and server). */

export type MoveDirection = "up" | "down" | "top";

/** Returns a new id list with `id` moved; the same list reference-equal content if it cannot move. */
export function moveId(ids: readonly string[], id: string, dir: MoveDirection): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const to = dir === "top" ? 0 : dir === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length || to === from) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Sorts `items` by the position of their id in `order`; ids not in `order` keep relative order last. */
export function applyOrder<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const index = new Map(order.map((id, i) => [id, i]));
  return [...items].sort(
    (a, b) => (index.get(a.id) ?? Infinity) - (index.get(b.id) ?? Infinity) || 0,
  );
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
