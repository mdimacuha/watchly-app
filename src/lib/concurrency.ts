/**
 * Maps `items` through `fn` with a cap on how many run at once, so a large
 * input list can't fan out into hundreds of simultaneous TMDB/HTTP calls.
 * Results are returned in input order. Mirrors the batch-of-5 pattern used
 * in `services/tmdb/search.ts`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const settled = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    for (let j = 0; j < settled.length; j++) {
      results[i + j] = settled[j];
    }
  }
  return results;
}
