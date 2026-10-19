import { unstable_cache } from 'next/cache';
import { tmdbFetch } from '@/server/tmdb/client';
import { TmdbError } from '@/server/tmdb/errors';
import { mapWithConcurrency } from '@/lib/concurrency';
import {
  mapMovie,
  mapTv,
  mapPerson,
  mapCollection,
} from '@/server/tmdb/mappers';
import type {
  MovieCard,
  TvCard,
  PersonCard,
  CollectionCard,
} from '@/server/tmdb/types';
import { getFavorites, type FavoriteType } from './index';
import { favoritesTag } from './cacheTag';

export type EnrichedFavorite =
  | { type: 'movie'; data: MovieCard; favoriteId: string; createdAt: string }
  | { type: 'tv'; data: TvCard; favoriteId: string; createdAt: string }
  | { type: 'artist'; data: PersonCard; favoriteId: string; createdAt: string }
  | {
      type: 'collection';
      data: CollectionCard;
      favoriteId: string;
      createdAt: string;
    };

interface RawFavorite {
  favoriteId: string;
  favoriteType: FavoriteType;
  createdAt: Date;
}

const TMDB_PATH: Record<FavoriteType, string> = {
  movie: '/movie',
  tv: '/tv',
  artist: '/person',
  collection: '/collection',
};

const TMDB_MAPPER: Record<
  FavoriteType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (raw: any) => MovieCard | TvCard | PersonCard | CollectionCard
> = {
  movie: (raw) => mapMovie({ ...raw, media_type: 'movie' }),
  tv: (raw) => mapTv({ ...raw, media_type: 'tv' }),
  artist: (raw) => mapPerson({ ...raw, media_type: 'person' }),
  collection: mapCollection,
};

const ENRICH_CONCURRENCY = 10;
const ENRICHED_REVALIDATE_SECONDS = 60 * 60; // matches tmdbFetch's 1h default

/**
 * Thrown out of the cached builder so a result with transient TMDB failures
 * is never stored; carries the items so the caller can still serve them.
 */
class PartialEnrichError extends Error {
  constructor(public items: EnrichedFavorite[]) {
    super('Partial favorites enrichment');
  }
}

/**
 * The /favorites payload, cached per user. A cold build is one TMDB fetch
 * per favorite (hundreds for heavy users); repeat visits are a single cache
 * read. `addFavorite` / `removeFavorite` bust the tag.
 *
 * A build where a TMDB fetch failed transiently (5xx, timeout, rate limit)
 * is served but NOT cached — that favorite would otherwise vanish from the
 * page for the full TTL. A 404 (title removed from TMDB) is permanent, so
 * it doesn't block caching.
 */
export async function getEnrichedFavorites(
  userId: string,
): Promise<EnrichedFavorite[]> {
  const cached = unstable_cache(
    async (uid: string) => {
      const { items, transientFailures } = await enrich(await getFavorites(uid));
      if (transientFailures > 0) throw new PartialEnrichError(items);
      return items;
    },
    ['favorites-enriched', userId],
    { revalidate: ENRICHED_REVALIDATE_SECONDS, tags: [favoritesTag(userId)] },
  );

  try {
    return await cached(userId);
  } catch (err) {
    if (err instanceof PartialEnrichError) return err.items;
    throw err;
  }
}

export async function enrichFavorites(
  favorites: RawFavorite[]
): Promise<EnrichedFavorite[]> {
  return (await enrich(favorites)).items;
}

async function enrich(
  favorites: RawFavorite[],
): Promise<{ items: EnrichedFavorite[]; transientFailures: number }> {
  let transientFailures = 0;
  const results = await mapWithConcurrency(favorites, ENRICH_CONCURRENCY, async (f) => {
    const type = f.favoriteType;
    const path = TMDB_PATH[type];
    const mapper = TMDB_MAPPER[type];

    if (!path || !mapper) return null;

    try {
      const raw = await tmdbFetch(`${path}/${f.favoriteId}`);
      return {
        type,
        data: mapper(raw),
        favoriteId: f.favoriteId,
        createdAt: f.createdAt.toISOString(),
      };
    } catch (err) {
      if (!(err instanceof TmdbError && err.status === 404)) transientFailures++;
      return null;
    }
  });
  return {
    items: results.filter((r): r is EnrichedFavorite => r !== null),
    transientFailures,
  };
}
