import { tmdbFetch } from '@/server/tmdb/client';
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
import type { FavoriteType } from './index';

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

export async function enrichFavorites(
  favorites: RawFavorite[]
): Promise<EnrichedFavorite[]> {
  const results = await mapWithConcurrency(favorites, 5, async (f) => {
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
    } catch {
      return null;
    }
  });
  return results.filter((r): r is EnrichedFavorite => r !== null);
}
