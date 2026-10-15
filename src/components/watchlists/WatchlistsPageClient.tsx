'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/watchly/EmptyState';
import { useToast } from '@/hooks/useToast';
import { createWatchlistAction } from '@/actions/watchlists';
import type { WatchlistWithCount } from '@/services/watchlists';
import { WatchlistCard } from './WatchlistCard';
import { WatchlistFormModal } from './WatchlistFormModal';

interface WatchlistsPageClientProps {
  watchlists: WatchlistWithCount[];
}

export function WatchlistsPageClient({ watchlists }: WatchlistsPageClientProps) {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const handleCreate = async (values: {
    name: string;
    description: string;
    isPublic: boolean;
  }) => {
    const created = await createWatchlistAction(values);
    toast.success('Watchlist created', `"${created.name}" is ready.`);
    router.push(`/watchlists/${created.id}`);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-muted-foreground text-body-regular max-w-lg">
          Organize titles you want to watch into custom lists.
        </p>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          <span>New list</span>
        </Button>
      </div>

      {watchlists.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No watchlists yet"
          description="Create your first watchlist to start collecting titles you want to watch."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              <span>Create list</span>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlists.map((w) => (
            <WatchlistCard key={w.id} watchlist={w} />
          ))}
        </div>
      )}

      <WatchlistFormModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        title="New watchlist"
        submitLabel="Create"
        onSubmit={handleCreate}
      />
    </>
  );
}
