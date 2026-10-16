import { CARD_FEATURE_LABELS } from '@/constants/cardFeature';
import { getCountryName } from '@/lib/regions/countries';
import type { ProfileShowcase } from '@/actions/profile';
import type { InsightTitle } from '@/services/profile/insights';

/**
 * Pure derivations behind the profile member card, shared by the page
 * (ProfilePrototype) and the exported story image (server/profile/storyImage)
 * so both always say the same thing.
 */

type Overview = ProfileShowcase['overview'];

export function nameOf(p: Overview['profile']) {
  return p.displayName || `${p.firstName} ${p.lastName}`.trim() || p.username;
}

export function estDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Their top favorites, ranked: titles they rated highest first, then most
 * recent. Manual pinning ("crown this") would override this.
 */
export function rankedFavorites(showcase: ProfileShowcase, n: number): (InsightTitle & { rating: number | null })[] {
  const out: (InsightTitle & { rating: number | null; idx: number })[] = [];
  showcase.overview.recentFavorites.forEach((f, idx) => {
    if (f.type !== 'movie' && f.type !== 'tv') return;
    const date = f.type === 'movie' ? f.data.releaseDate : f.data.firstAirDate;
    const key = `${f.type}:${f.data.id}`;
    out.push({
      mediaType: f.type,
      tmdbId: f.data.id,
      title: f.type === 'movie' ? f.data.title : f.data.name,
      year: date ? date.slice(0, 4) : null,
      posterPath: f.data.posterPath,
      backdropPath: f.data.backdropPath,
      rating: showcase.insights.ratings[key] ?? null,
      idx,
    });
  });
  return out
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.idx - b.idx)
    .slice(0, n);
}

/** One honest line, only from real data; says less when there's less. */
export function billingLine(showcase: ProfileShowcase): string {
  const { tasteProfile } = showcase.overview;
  const { mix } = showcase.insights;
  const total = mix.films + mix.series;
  const parts: string[] = [];
  const genre = tasteProfile.genres[0];
  const decade = tasteProfile.decades[0];
  if (genre) parts.push(decade ? `Mostly ${decade} ${genre.toLowerCase()}` : `Mostly ${genre.toLowerCase()}`);
  if (total >= 3) {
    const films = Math.round((mix.films / total) * 100);
    parts.push(films >= 50 ? `Films ${films}% · Series ${100 - films}%` : `Series ${100 - films}% · Films ${films}%`);
  }
  if (tasteProfile.providers[0]) parts.push(`Watches on ${tasteProfile.providers[0]}`);
  return parts.length ? parts.join(' · ') : 'Just getting started';
}

export interface MemberCardModel {
  /** The title in the card's highlight slot, and its caption. */
  feature: InsightTitle | null;
  featureLabel: string;
  /** "10 titles logged", "23 in watchlists", "2 watchlists" — zeros dropped. */
  tally: string[];
  stamps: { label: string; value: string }[];
  country: string | null;
}

export function memberCardModel(showcase: ProfileShowcase): MemberCardModel {
  const p = showcase.overview.profile;
  const { tasteProfile } = showcase.overview;
  const { insights } = showcase;
  const now = insights.nowShowing[0] ?? null;
  const pinned = rankedFavorites(showcase, 1)[0] ?? null;
  // Highlight slot, per the owner's setting (Edit profile → Card highlight):
  // a chosen favorite under their label, their #1, or Now showing (→ #1).
  const cf = p.cardFeature;
  const custom = cf.mode === 'custom' && cf.label ? showcase.cardFeatureTitle : null;
  const feature = custom ?? (cf.mode === 'top_pick' ? (pinned ?? now) : (now ?? pinned));
  const featureLabel = custom
    ? CARD_FEATURE_LABELS[cf.label!]
    : feature && feature === now
      ? 'Now showing'
      : 'Their #1';

  const logged = insights.mix.films + insights.mix.series;
  // Public lists only, so owner and visitors (and "Preview as visitor") match.
  const lists = showcase.overview.publicWatchlists;
  const listed = lists.reduce((n, w) => n + w.itemCount, 0);
  const tally = [
    logged > 0 && `${logged} ${logged === 1 ? 'title' : 'titles'} logged`,
    listed > 0 && `${listed} in watchlists`,
    lists.length > 0 && `${lists.length} ${lists.length === 1 ? 'watchlist' : 'watchlists'}`,
  ].filter((s): s is string => Boolean(s));

  const stamps = [
    tasteProfile.genres[0] && { label: 'Genre', value: tasteProfile.genres[0] },
    tasteProfile.decades[0] && { label: 'Era', value: tasteProfile.decades[0] },
    tasteProfile.providers[0] && { label: 'Screen', value: tasteProfile.providers[0] },
    insights.reviews.average != null && { label: 'Avg', value: `${insights.reviews.average}★` },
  ].filter(Boolean) as { label: string; value: string }[];

  return {
    feature,
    featureLabel,
    tally,
    stamps,
    country: p.region ? (getCountryName(p.region) ?? p.region) : null,
  };
}
