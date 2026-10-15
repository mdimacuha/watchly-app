import {
  PageHeaderSkeleton,
  CardBlockSkeleton,
  SkeletonBox,
} from '@/components/watchly/skeletons';

/**
 * Cascading loading state for /settings AND every settings sub-page
 * (/settings/account, /settings/privacy, /settings/appearance, …). Next
 * uses the nearest ancestor `loading.tsx` for any segment without its
 * own, so this single file covers the whole settings group.
 */
export default function SettingsLoading() {
  return (
    <div className="px-8 py-10 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <PageHeaderSkeleton />
      <SkeletonBox className="h-4 w-2/3 opacity-70" />
      <div className="flex flex-col gap-4">
        <CardBlockSkeleton lines={3} />
        <CardBlockSkeleton lines={2} />
      </div>
    </div>
  );
}
