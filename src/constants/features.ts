/**
 * Simple compile-time feature flags for gated v1 features.
 *
 * `reviews` and `watchlistUpvoting` back onto new DB tables (`user_reviews`,
 * `watchlist_votes`). They ship OFF so the app never queries a table that
 * hasn't been migrated yet. To enable: apply the pending migration
 * (`npm run db:migrate`) and flip the flag to `true` here.
 *
 * These are static booleans (no env plumbing) so they tree-shake and are
 * trivial to toggle. Promote to env-driven flags if per-environment control
 * is later needed.
 */
export const FEATURES = {
  /** Title rating + written review (self-only v1). Needs `user_reviews`. */
  reviews: true,
  /** Upvoting public watchlists. Needs `watchlist_votes`. */
  watchlistUpvoting: true,
} as const;

export type FeatureName = keyof typeof FEATURES;
