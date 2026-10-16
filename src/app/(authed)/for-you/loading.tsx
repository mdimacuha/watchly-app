import { SkeletonBox } from '@/components/watchly/skeletons';

/**
 * Route-level loading UI for /for-you. Mirrors Tonight's Programme
 * (ForYouProgramme): header + services button, the Continue strip, the Dial,
 * the Feature, two Supports and the Wildcard — so content fills in without
 * layout shift.
 */
export default function ForYouLoading() {
  return (
    <div className="px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <SkeletonBox className="h-8 w-64" />
          <SkeletonBox className="h-4 w-80 max-w-full opacity-70" />
        </div>
        <SkeletonBox className="h-10 w-32 rounded-md" />
      </div>

      {/* Continue strip */}
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBox key={i} className="h-20 w-64 shrink-0 rounded-xl" />
        ))}
      </div>

      {/* Dial */}
      <SkeletonBox className="h-28 w-full rounded-xl" />

      {/* Feature */}
      <SkeletonBox className="h-80 w-full rounded-xl" />

      {/* Supports */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonBox className="h-48 rounded-xl" />
        <SkeletonBox className="h-48 rounded-xl" />
      </div>

      {/* Wildcard */}
      <SkeletonBox className="h-40 w-full rounded-xl" />
    </div>
  );
}
