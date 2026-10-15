/**
 * Accent palette for per-user personalization. Each entry maps to the same
 * five CSS variables defined in src/styles/tokens.css so we can override
 * the user's `--primary` (and friends) by injecting these via inline style
 * on a scoped wrapper element.
 *
 * Foreground stays white across the palette — that's why we curated this
 * specific set instead of allowing free-form hex.
 */

export const ACCENT_SLUGS = [
  'blue',
  'purple',
  'pink',
  'rose',
  'orange',
  'amber',
  'teal',
  'emerald',
] as const;

export type AccentSlug = (typeof ACCENT_SLUGS)[number];

export interface AccentDefinition {
  slug: AccentSlug;
  name: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  /** rgba with low alpha — used for hover backgrounds and tinted surfaces. */
  primarySoft: string;
  /** rgba with medium alpha — used for focus rings. */
  ring: string;
}

export const ACCENTS: Record<AccentSlug, AccentDefinition> = {
  blue: {
    slug: 'blue',
    name: 'Blue',
    primary: '#3B4FFF',
    primaryHover: '#2F3FE6',
    primaryActive: '#2633C7',
    primarySoft: 'rgba(59, 79, 255, 0.12)',
    ring: 'rgba(59, 79, 255, 0.45)',
  },
  purple: {
    slug: 'purple',
    name: 'Purple',
    primary: '#8B5CF6',
    primaryHover: '#7C4DEC',
    primaryActive: '#6D3FD8',
    primarySoft: 'rgba(139, 92, 246, 0.12)',
    ring: 'rgba(139, 92, 246, 0.45)',
  },
  pink: {
    slug: 'pink',
    name: 'Pink',
    primary: '#EC4899',
    primaryHover: '#D63A89',
    primaryActive: '#BE2E78',
    primarySoft: 'rgba(236, 72, 153, 0.12)',
    ring: 'rgba(236, 72, 153, 0.45)',
  },
  rose: {
    slug: 'rose',
    name: 'Rose',
    primary: '#F43F5E',
    primaryHover: '#E0354F',
    primaryActive: '#C72B43',
    primarySoft: 'rgba(244, 63, 94, 0.12)',
    ring: 'rgba(244, 63, 94, 0.45)',
  },
  orange: {
    slug: 'orange',
    name: 'Orange',
    primary: '#F97316',
    primaryHover: '#E2640E',
    primaryActive: '#C5560C',
    primarySoft: 'rgba(249, 115, 22, 0.12)',
    ring: 'rgba(249, 115, 22, 0.45)',
  },
  amber: {
    slug: 'amber',
    name: 'Amber',
    primary: '#D97706',
    primaryHover: '#BE6A05',
    primaryActive: '#A35C04',
    primarySoft: 'rgba(217, 119, 6, 0.12)',
    ring: 'rgba(217, 119, 6, 0.45)',
  },
  teal: {
    slug: 'teal',
    name: 'Teal',
    primary: '#14B8A6',
    primaryHover: '#10A293',
    primaryActive: '#0D8A7E',
    primarySoft: 'rgba(20, 184, 166, 0.12)',
    ring: 'rgba(20, 184, 166, 0.45)',
  },
  emerald: {
    slug: 'emerald',
    name: 'Emerald',
    primary: '#10B981',
    primaryHover: '#0EA372',
    primaryActive: '#0C8B61',
    primarySoft: 'rgba(16, 185, 129, 0.12)',
    ring: 'rgba(16, 185, 129, 0.45)',
  },
};

export function getAccent(slug: AccentSlug | null | undefined): AccentDefinition | null {
  if (!slug) return null;
  return ACCENTS[slug] ?? null;
}
