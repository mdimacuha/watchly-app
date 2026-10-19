'use client';

import React from 'react';
import { type TitlePageProps } from './titleParts';
import { TitleHero, OverviewBlock, SeasonsBlock } from './TitleHero';
import { DetailsCard, LinksCard, YouCard } from './RailCards';
import { MediaSection } from './MediaSection';
import { CrewGrid, StarringRow } from './TitlePeople';
import { ReviewsPanel } from './ReviewsPanel';
import { RelatedRail } from './RelatedRail';
import { useTitleReviews } from './useTitleReviews';
import { useTitleAvailability } from './useTitleAvailability';

// Two columns with a sticky rail. The reading column carries the
// story (overview → seasons → media → people → reviews); the rail keeps
// personal state and reference facts in reach while scrolling.
export function TitlePageBody({ titleData, onWatchTrailer, onPlayVideo, playing, onClosePlayer }: TitlePageProps) {
  const reviews = useTitleReviews(titleData.mediaType, titleData.id);
  // One lookup shared by the hero strip and the alerts in the rail.
  const availability = useTitleAvailability(titleData.mediaType, titleData.id);

  return (
    <div className="w-full">
      <TitleHero
        titleData={titleData}
        onWatchTrailer={onWatchTrailer}
        playing={playing}
        onClosePlayer={onClosePlayer}
        aggregate={reviews.aggregate}
        availability={availability}
      />

      <div className="container mx-auto px-4 md:px-8 py-12 flex flex-col lg:flex-row gap-10">
        <div className="flex-1 min-w-0 flex flex-col gap-12">
          <OverviewBlock titleData={titleData} />
          <SeasonsBlock titleData={titleData} />
          <MediaSection media={titleData.extras.media} onPlayVideo={onPlayVideo} />
          <div className="flex flex-col gap-8">
            <StarringRow cast={titleData.cast} />
            <CrewGrid titleData={titleData} />
          </div>
          <ReviewsPanel state={reviews} />
        </div>

        <aside className="lg:w-[280px] shrink-0 flex flex-col gap-4 lg:sticky lg:top-6 self-start w-full">
          <YouCard titleData={titleData} availability={availability} />
          <DetailsCard titleData={titleData} />
          <LinksCard titleData={titleData} />
        </aside>
      </div>

      <div className="container mx-auto px-4 md:px-8 pb-12 flex flex-col gap-12">
        <RelatedRail
          title={`If you liked ${titleData.details.title}, you might want to try this`}
          items={titleData.extras.related}
        />
      </div>
    </div>
  );
}
