/**
 * The profile card's highlight slot (right side of the member card).
 *
 *   now_showing — what they're watching now (default); falls back to their
 *                 #1 when nothing is in progress
 *   top_pick    — their #1 favorite (highest-rated, then most recent)
 *   custom      — a favorite they chose, under a label they chose
 */
export const CARD_FEATURE_MODES = ['now_showing', 'top_pick', 'custom'] as const;
export type CardFeatureMode = (typeof CARD_FEATURE_MODES)[number];

export const CARD_FEATURE_LABELS = {
  die_for: 'Their something to die for',
  from_favorites: 'From their favorites',
  all_time: 'Their all-time favorite',
  comfort: 'Their comfort watch',
  desert_island: 'Their desert-island pick',
  rewatch: "Can't stop rewatching",
} as const;
export type CardFeatureLabel = keyof typeof CARD_FEATURE_LABELS;
export const CARD_FEATURE_LABEL_SLUGS = Object.keys(CARD_FEATURE_LABELS) as [
  CardFeatureLabel,
  ...CardFeatureLabel[],
];

export interface CardFeatureSetting {
  mode: CardFeatureMode;
  /** custom only */
  mediaType: 'movie' | 'tv' | null;
  mediaId: string | null;
  label: CardFeatureLabel | null;
}

export const DEFAULT_CARD_FEATURE: CardFeatureSetting = {
  mode: 'now_showing',
  mediaType: null,
  mediaId: null,
  label: null,
};

export function isCardFeatureMode(v: unknown): v is CardFeatureMode {
  return typeof v === 'string' && (CARD_FEATURE_MODES as readonly string[]).includes(v);
}

export function isCardFeatureLabel(v: unknown): v is CardFeatureLabel {
  return typeof v === 'string' && v in CARD_FEATURE_LABELS;
}
