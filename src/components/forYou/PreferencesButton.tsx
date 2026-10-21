'use client';

import { useState, useTransition } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { getForYouPreferencesAction } from '@/actions/forYouPrefs';
import { PreferencesPicker } from './PreferencesPicker';
import type { CatalogProvider } from '@/server/tmdb/providersCatalog';

/**
 * Top-right button on /programme. Lazy-loads the catalog only when opened
 * so first-paint of For You stays fast.
 */
export function PreferencesButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{
    selected: number[] | null;
    catalog: CatalogProvider[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const openModal = () => {
    setOpen(true);
    if (!data) {
      startTransition(async () => {
        try {
          const r = await getForYouPreferencesAction();
          setData({ selected: r.selectedProviders, catalog: r.catalog });
        } catch {
          // leave data null; modal shows a small fallback
        }
      });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={openModal}
        className="gap-2"
      >
        <Filter className="w-4 h-4" />
        Preferences
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} className="max-w-lg">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Programme preferences</h2>
            <p className="text-xs text-muted-foreground">
              Pick the streaming services to filter rows to.
            </p>
          </div>
          {data ? (
            <PreferencesPicker
              initialSelected={data.selected}
              catalog={data.catalog}
              onSaved={() => setOpen(false)}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              {pending ? 'Loading services…' : 'Could not load services.'}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
