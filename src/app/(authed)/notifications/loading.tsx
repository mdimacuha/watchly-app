import {
  PageHeaderSkeleton,
  ListRowSkeleton,
} from '@/components/watchly/skeletons';

export default function NotificationsLoading() {
  return (
    <div className="px-8 py-10 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <PageHeaderSkeleton />
      <div className="rounded-xl border border-border bg-card divide-y divide-border/40 px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
