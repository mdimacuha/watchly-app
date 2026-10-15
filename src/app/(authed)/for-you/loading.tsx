import { PosterCardSkeleton, SkeletonBox } from '@/components/watchly/skeletons';

/**
 * Route-level loading UI for /for-you. The page fetches the whole feed
 * server-side (getForYouFeedAction), so this skeleton stands in for the
 * entire briefing until that resolves. Mirrors the real page's container
 * (max-w-6xl, gap-8), header, hero card, and horizontal rails so content
 * fills in with no layout shift or blank/text-only flash.
 */
export default function ForYouLoading() {
  return (
    <div className="px-8 py-10 max-w-6xl mx-auto w-full flex flex-col gap-8">
      {/* Header — matches the Sparkles icon + title + subtitle on the left
          and the Preferences button on the right. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <SkeletonBox className="h-6 w-6 rounded" />
            <SkeletonBox className="h-7 w-56" />
          </div>
          <SkeletonBox className="h-4 w-72 opacity-70" />
        </div>
        <SkeletonBox className="h-10 w-32 rounded-md" />
      </div>

      {/* Hero card — aligns with ForYouHero: bordered card, poster on the
          left, title/meta/providers/actions on the right. */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-0.5 bg-foreground/10" />
        <div className="flex flex-col md:flex-row gap-6 p-5 md:p-6">
          <SkeletonBox className="w-full max-w-[200px] md:max-w-[220px] shrink-0 mx-auto md:mx-0 aspect-2/3 rounded-lg" />
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <SkeletonBox className="h-6 w-40 rounded-full" />
            <SkeletonBox className="h-9 w-2/3" />
            <SkeletonBox className="h-4 w-1/2 opacity-70" />
            <div className="flex gap-2">
              <SkeletonBox className="h-6 w-16 rounded-full" />
              <SkeletonBox className="h-6 w-16 rounded-full" />
            </div>
            <SkeletonBox className="h-16 w-full opacity-70" />
            <div className="flex flex-wrap gap-2 mt-1">
              <SkeletonBox className="h-10 w-32 rounded-md" />
              <SkeletonBox className="h-10 w-40 rounded-md" />
              <SkeletonBox className="h-10 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      {/* A few horizontal rails — each with a title (+ View All) and a strip
          of poster cards, matching ForYouRow's layout and card width. */}
      {Array.from({ length: 3 }).map((_, r) => (
        <RailSkeleton key={r} />
      ))}
    </div>
  );
}

/** One horizontal recommendation rail (title + View All + poster strip). */
function RailSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBox className="h-6 w-56" />
        <SkeletonBox className="h-4 w-16 opacity-70" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <PosterCardSkeleton key={i} className="w-[180px] shrink-0" />
        ))}
      </div>
    </section>
  );
}
