import type { Metadata } from 'next';
import { getCollectionDetails } from '@/services/tmdb/collection';
import Image from 'next/image';
import Link from 'next/link';
import { buildImageUrl } from '@/lib/tmdb';
import { notFound } from 'next/navigation';
import { PosterCard } from '@/components/watchly/PosterCard';
import { BackLink } from '@/components/nav/BackLink';
import { getCollectionMeta } from '@/services/tmdb/meta';
import { clampDescription } from '@/lib/seo';

import { CollectionActions } from '@/components/collections/CollectionActions';

// Region-agnostic + no per-user reads → ISR-cacheable (same pattern as the
// title page). Favorite state loads client-side (FavoriteButton fetchInitial).
// Per-part availability badges use a fixed default region so the page can be
// shared-cached; accurate per-region availability lives on each title page.
// 24h — cached HTML is TMDB catalog metadata only, which does not change hourly.
export const revalidate = 86400;
export async function generateStaticParams() {
  return [];
}

// Default region for the (cached) per-part availability badges.
const DEFAULT_BADGE_REGION = 'US';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}): Promise<Metadata> {
  const { collectionId } = await params;
  const meta = await getCollectionMeta(collectionId);
  if (!meta) {
    return {
      title: 'Collection not found',
      robots: { index: false, follow: false },
    };
  }

  const description = clampDescription(
    meta.overview ||
      `Explore the ${meta.name} — find where to watch every movie in the collection across your streaming services.`,
  );
  const canonical = `/collection/${collectionId}`;
  const image =
    buildImageUrl(meta.backdropPath, 'w1280') ||
    buildImageUrl(meta.posterPath, 'w780') ||
    undefined;

  return {
    title: meta.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: meta.name,
      description,
      url: canonical,
      ...(image ? { images: [{ url: image, width: 1280, height: 720 }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.name,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;

  let collection;
  try {
    collection = await getCollectionDetails(collectionId, DEFAULT_BADGE_REGION);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Hero */}
      <div className="relative w-full h-[40vh] md:h-[50vh]">
        {/* Floating back control over the hero image. */}
        <BackLink
          fallbackHref="/for-you"
          className="absolute top-4 left-4 md:top-6 md:left-6 z-20 rounded-full bg-background/70 hover:bg-background/90 backdrop-blur-sm border border-border/60 px-3 py-1.5 shadow-sm"
        />
        {collection.backdropPath && (
          <Image
            src={buildImageUrl(collection.backdropPath, 'original') || ''}
            alt={collection.name}
            fill
            className="object-cover opacity-50"
            priority
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/60 to-transparent" />

        <div className="absolute bottom-0 left-0 w-full p-6 md:p-12">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            {collection.name}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground mb-6">
            {collection.overview}
          </p>
          
          <CollectionActions
            collectionId={collection.id}
            collectionName={collection.name}
          />
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 mt-8">
        <h2 className="text-xl font-bold mb-6">Collection Parts</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {collection.parts.map(part => (
            <Link key={part.id} href={`/title/movie/${part.id}`}>
              <PosterCard
                title={part.title}
                year={part.releaseDate ? part.releaseDate.split('-')[0] : ''}
                genre="Movie"
                imageSrc={buildImageUrl(part.posterPath, 'w500') || ''}
                className="w-full max-w-none"
                mediaType="movie"
                availability={part.providerBadges}
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
