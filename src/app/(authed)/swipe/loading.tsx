import {
  PageHeaderSkeleton,
  SkeletonBox,
} from '@/components/watchly/skeletons';

export default function SwipeLoading() {
  return (
    <div className="px-6 py-8 sm:py-10 max-w-4xl mx-auto w-full flex flex-col gap-6">
      <PageHeaderSkeleton />
      <SkeletonBox className="h-4 w-72 opacity-70" />
      <div className="relative w-full max-w-lg mx-auto aspect-[2/3]">
        <SkeletonBox className="absolute inset-0 rounded-xl" />
      </div>
      <div className="flex items-center justify-center gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox
            key={i}
            className={i === 0 || i === 3 ? 'w-14 h-14 rounded-full' : 'w-12 h-12 rounded-full'}
          />
        ))}
      </div>
    </div>
  );
}
