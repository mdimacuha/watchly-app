import type { Metadata } from "next";
import { getPersonPagePayload } from "@/services/tmdb/person";
import { notFound } from "next/navigation";
import { ArtistClient } from "./ArtistClient";
import { TmdbError } from "@/server/tmdb/errors";
import { getPersonMeta } from "@/services/tmdb/meta";
import { clampDescription } from "@/lib/seo";

// Region-agnostic + no per-user reads → ISR-cacheable (same pattern as the
// title page). Favorite state loads client-side (FavoriteButton fetchInitial).
// Filmography availability badges load client-side for the visitor's region
// (useRegionBadges), so no one country is baked into the cached HTML.
// See docs/vercel-perf-roadmap.md.
// 24h — cached HTML is TMDB catalog metadata only, which does not change hourly.
export const revalidate = 86400;
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = await getPersonMeta(id);
  if (!meta) {
    return { title: "Person not found", robots: { index: false, follow: false } };
  }

  const role = meta.knownForDepartment
    ? meta.knownForDepartment.toLowerCase()
    : "cast & crew";
  const title = `${meta.name} — Movies, TV Shows & Where to Watch`;
  const description = clampDescription(
    meta.biography ||
      `Explore ${meta.name}'s filmography (${role}) and find where to stream their movies and TV shows on Watchly.`,
  );
  const canonical = `/artist/${id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title: `${meta.name} on Watchly`,
      description,
      url: canonical,
      // Inherits the branded root opengraph-image (portrait art is a poor
      // fit for a 1200×630 card).
    },
    twitter: {
      card: "summary_large_image",
      title: `${meta.name} on Watchly`,
      description,
    },
  };
}

export default async function ArtistPage({ params }: PageProps) {
  const { id } = await params;

  // Only a genuinely missing person should 404. A transient TMDB failure
  // (rate limit, network) must not masquerade as "this person doesn't exist"
  // and make a valid cast link look broken — surface it as an error instead.
  let payload;
  try {
    payload = await getPersonPagePayload(id);
  } catch (e) {
    if (e instanceof TmdbError && e.status === 404) notFound();
    throw e;
  }

  return <ArtistClient payload={payload} />;
}
