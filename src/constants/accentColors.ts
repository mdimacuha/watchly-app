/**
 * Accent palette for per-user personalization. Each entry maps to the same
 * five CSS variables defined in src/styles/tokens.css so we can override
 * the user's `--primary` (and friends) by injecting these via inline style
 * on a scoped wrapper element.
 *
 * Profiles may also use a custom hex (`#RRGGBB`): the other shades are
 * derived from it, its lightness is kept in a range that stays readable on
 * the dark UI, and text on it flips to dark when the colour is light. Shelf
 * spine colours use the presets only.
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

/** A profile accent: a preset slug or a custom `#rrggbb`. */
export type AccentColor = AccentSlug | `#${string}`;

export interface AccentDefinition {
  /** Preset slug, or null for a custom colour. */
  slug: AccentSlug | null;
  name: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  /** rgba with low alpha — used for hover backgrounds and tinted surfaces. */
  primarySoft: string;
  /** rgba with medium alpha — used for focus rings. */
  ring: string;
  /** Text on the accent (buttons, badges). Absent = the theme default (white). */
  primaryForeground?: string;
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

export function getAccent(value: AccentColor | null | undefined): AccentDefinition | null {
  if (!value) return null;
  if (isAccentSlug(value)) return ACCENTS[value];
  const hex = normalizeAccentHex(value);
  return hex ? customAccent(hex) : null;
}

// ---------------------------------------------------------------------------
// Custom colours
// ---------------------------------------------------------------------------

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** Lightness range (HSL) that stays visible on the dark UI and keeps text readable. */
export const ACCENT_LIGHTNESS = { min: 0.38, max: 0.72 } as const;

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex(r: number, g: number, b: number): `#${string}` {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase() as `#${string}`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * A valid `#RRGGBB`, with lightness pulled into the readable range; null
 * when the input isn't a hex colour. Used on save and when rendering, so
 * stored values always render the same way.
 */
export function normalizeAccentHex(input: string): `#${string}` | null {
  const rgb = hexToRgb(input);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(...rgb);
  const clamped = Math.min(ACCENT_LIGHTNESS.max, Math.max(ACCENT_LIGHTNESS.min, l));
  return clamped === l ? rgbToHex(...rgb) : rgbToHex(...hslToRgb(h, s, clamped));
}

/** A stored value as an accent (preset or valid custom hex), else null. */
export function normalizeAccentColor(v: string | null | undefined): AccentColor | null {
  if (!v) return null;
  if (isAccentSlug(v)) return v;
  return normalizeAccentHex(v);
}

/** WCAG relative luminance (0–1). */
function luminance([r, g, b]: [number, number, number]): number {
  const ch = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function customAccent(hex: `#${string}`): AccentDefinition {
  const rgb = hexToRgb(hex)!;
  const [h, s, l] = rgbToHsl(...rgb);
  const shade = (dl: number) => rgbToHex(...hslToRgb(h, s, Math.max(0, l - dl)));
  const [r, g, b] = rgb;
  // Dark text when white would fall under ~4.5:1 on this colour.
  const lum = luminance(rgb);
  const whiteContrast = 1.05 / (lum + 0.05);
  return {
    slug: null,
    name: hex,
    primary: hex,
    primaryHover: shade(0.06),
    primaryActive: shade(0.12),
    primarySoft: `rgba(${r}, ${g}, ${b}, 0.12)`,
    ring: `rgba(${r}, ${g}, ${b}, 0.45)`,
    primaryForeground: whiteContrast < 4.5 ? '#0B0B0F' : '#FFFFFF',
  };
}

/** Narrows stored text (DB values are unvalidated) to a known accent slug. */
export function isAccentSlug(v: string | null | undefined): v is AccentSlug {
  return !!v && (ACCENT_SLUGS as readonly string[]).includes(v);
}
