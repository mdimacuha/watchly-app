import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/watchly/EmptyState';
import { requireUser } from '@/server/auth/requireUser';
import { PATHS } from '@/lib/app';

export const metadata: Metadata = { title: 'New & Coming Soon' };

/** Placeholder until release dates and streaming arrivals get their own page. */
export default async function NewAndComingSoonPage() {
  await requireUser();
  return (
    <div className="px-4 sm:px-8 py-16 max-w-6xl mx-auto w-full">
      <EmptyState
        icon={CalendarDays}
        title="New & Coming Soon is on its way"
        description="Release dates and what's arriving on your streaming services, all in one place. Until then, Tonight's Programme has picks ready for you."
        action={
          <Link href={PATHS.PROGRAMME} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Open Tonight&apos;s Programme
          </Link>
        }
      />
    </div>
  );
}
