import { PosterGridSkeleton, SkeletonBox } from '@/components/watchly/skeletons';

/**
 * Route-level loading UI for the Programme "View All" pages
 * (/programme/[rowId]). The page resolves the whole feed server-side, so this
 * skeleton stands in for the ranked grid. Mirrors the page container
 * (max-w-6xl, gap-6), the back link, the header, and the exact grid columns
 * used by the ForYouCard grid so posters fill in with no layout shift.
 */
export default function ForYouRowLoading() {
  return (
    <div className="px-8 py-10 max-w-6xl mx-auto w-full flex flex-col gap-6">
      {/* Back link. */}
      <div className="flex items-center gap-2">
        <SkeletonBox className="h-[18px] w-[18px] rounded" />
        <SkeletonBox className="h-4 w-32" />
      </div>

      {/* Header — title + "Full list, ranked." subtitle. */}
      <div className="flex flex-col gap-2">
        <SkeletonBox className="h-8 w-64" />
        <SkeletonBox className="h-4 w-40 opacity-70" />
      </div>

      {/* Grid — matches grid-cols-2 sm:3 md:4 lg:5 xl:6 from the page. */}
      <PosterGridSkeleton
        count={18}
        className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      />
    </div>
  );
}
