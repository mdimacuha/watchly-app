import type { Metadata } from 'next';
import { getTitlePagePayload, MediaType } from '@/services/tmdb/title';
import { notFound } from 'next/navigation';
import { TitleDetailsClient } from '@/components/title/TitleDetailsClient';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTitleMeta } from '@/services/tmdb/meta';
import { buildImageUrl } from '@/lib/tmdb';
import { JsonLd } from '@/components/seo/JsonLd';
import { absoluteUrl, clampDescription } from '@/lib/seo';

// Region-agnostic and free of per-user reads → ISR-cacheable. Region providers
// and favorite/watchlist state load client-side (ClientProviderSection /
// TitleActions). A crawl of thousands of title pages now serves from cache
// instead of a full SSR + TMDB render per hit — the fix for the 0%-cache /
// high-Active-CPU incident.
//
// 24h: the cached HTML carries only TMDB catalog metadata — providers are
// fetched client-side per region — and that does not change hourly. A shorter
// window just rewrites every crawled page 24x a day for no freshness gain.
export const revalidate = 86400;

// Marks this dynamic segment as statically generated (ISR). We prerender none
// at build (empty list) and let on-demand params render once, then cache per
// `revalidate` — turning a crawl of thousands of titles into cache hits after
// the first render of each. Without this, a dynamic segment stays fully dynamic
// (ƒ) regardless of `revalidate`.
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ mediaType: string; id: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mediaType: string; id: string }>;
}): Promise<Metadata> {
  const { mediaType, id } = await params;
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }

  const meta = await getTitleMeta({ mediaType, id });
  if (!meta) {
    // Unknown title → don't index a soft-404 shell.
    return {
      title: 'Title not found',
      description: 'This title could not be found on Watchly.',
      robots: { index: false, follow: false },
    };
  }

  const yearSuffix = meta.year ? ` (${meta.year})` : '';
  const heading = `${meta.name}${yearSuffix}`;
  const title = `${heading} — Where to Watch`;
  const description = clampDescription(
    `Find where to watch ${heading} in your region. Check streaming ` +
      `availability on Netflix, Disney+, Prime Video, Max, and 100+ services.`,
  );
  const canonical = `/title/${meta.mediaType}/${meta.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: meta.mediaType === 'movie' ? 'video.movie' : 'video.tv_show',
      title: heading,
      description,
      url: canonical,
      // og:image comes from the sibling opengraph-image.tsx (composed card).
    },
    twitter: {
      card: 'summary_large_image',
      title: heading,
      description,
    },
  };
}

export default async function TitlePage({ params }: PageProps) {
  const { mediaType, id } = await params;

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    notFound();
  }

  let titleData;
  try {
    // Region-agnostic: no region arg → empty provider buckets; providers load
    // client-side by the user's region. No session / cookie / per-user read
    // here — that's what keeps this page statically cacheable.
    titleData = await getTitlePagePayload({
      mediaType: mediaType as MediaType,
      id,
    });
  } catch (error) {
    console.error('Failed to fetch title data:', error);
    // Simple Error UI
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-4 text-center">
        <h1 className="text-2xl font-bold">Failed to load title</h1>
        <p className="text-muted-foreground">
          The requested title could not be found or there was an error.
        </p>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    );
  }

  const posterImage = buildImageUrl(titleData.details.posterPath, 'w500');
  const genreNames = titleData.details.genres.map((g) => g.name);
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': mediaType === 'movie' ? 'Movie' : 'TVSeries',
    name: titleData.details.title,
    url: absoluteUrl(`/title/${mediaType}/${id}`),
    ...(posterImage ? { image: posterImage } : {}),
    ...(titleData.details.overview
      ? { description: titleData.details.overview }
      : {}),
    ...(genreNames.length ? { genre: genreNames } : {}),
  };

  return (
    <div className="bg-background min-h-screen">
      <JsonLd data={jsonLd} />
      <TitleDetailsClient titleData={titleData} />
    </div>
  );
}
