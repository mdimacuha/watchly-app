'use client';

import React, { useState } from 'react';
import { TitlePagePayload } from '@/services/tmdb/title';
import { BackLink } from '@/components/nav/BackLink';
import { TitleHero } from './TitleHero';
import { TrailerModal } from './TrailerModal';
import { TitleFeedSection } from './TitleFeedSection';
import { ReviewsSection } from './ReviewsSection';
import { FEATURES } from '@/constants/features';
import { useAuthStore } from '@/client/stores/auth';

interface TitleDetailsClientProps {
  titleData: TitlePagePayload;
}

export function TitleDetailsClient({ titleData }: TitleDetailsClientProps) {
  const [isTrailerOpen, setTrailerOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const isReviewable = titleData.mediaType === 'movie' || titleData.mediaType === 'tv';
  return (
    <div className="relative flex flex-col min-h-screen">
      {/* Floating over the hero rather than sitting in a plain strip above it. */}
      <BackLink
        fallbackHref="/for-you"
        className="absolute top-4 left-4 md:top-6 md:left-6 z-30 rounded-full bg-background/70 hover:bg-background/90 backdrop-blur-sm border border-border/60 px-3 py-1.5 shadow-sm"
      />

      <TitleHero
        titleData={titleData}
        onWatchTrailer={() => setTrailerOpen(true)}
      />

      {/* Title reviews (self-only v1). Gated behind FEATURES.reviews so the
          un-migrated `user_reviews` table is never queried while off. */}
      {FEATURES.reviews && isReviewable && (
        <div className="container mx-auto px-4 py-8">
          <ReviewsSection
            mediaType={titleData.mediaType}
            id={titleData.id}
            isAuthenticated={isAuthenticated}
          />
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        <TitleFeedSection items={titleData.feedItems} />
      </div>

      <TrailerModal
        isOpen={isTrailerOpen}
        onClose={() => setTrailerOpen(false)}
        trailer={titleData.trailer}
      />
    </div>
  );
}
