/**
 * Watchlist ranking placement, shared by the client (optimistic update) and
 * the watchlists service (authoritative write) so both agree on the order.
 *
 * `items` must be in display order: unranked ("Recently Added") items first,
 * then ranked items in rank order. Returns the new display order with
 * `itemId` moved:
 *   - rank 0      → unranked, placed at the top of the unranked group
 *   - rank 1..n   → that position among ranked items (clamped to the end)
 *
 * The caller is responsible for updating the moved item's ranked flag.
 */
export function placeAtRank<T extends { id: string }>(
  items: T[],
  itemId: string,
  rank: number,
  isRanked: (item: T) => boolean,
): T[] {
  const target = items.find((i) => i.id === itemId);
  if (!target) return items;

  const rest = items.filter((i) => i.id !== itemId);
  const unranked = rest.filter((i) => !isRanked(i));
  const ranked = rest.filter(isRanked);

  if (rank === 0) return [target, ...unranked, ...ranked];

  const index = Math.min(rank, ranked.length + 1) - 1;
  ranked.splice(index, 0, target);
  return [...unranked, ...ranked];
}
