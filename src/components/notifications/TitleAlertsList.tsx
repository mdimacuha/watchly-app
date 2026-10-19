'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X } from 'lucide-react';
import { buildImageUrl } from '@/lib/tmdb';
import { getCountryName } from '@/lib/regions/countries';
import { useToast } from '@/hooks/useToast';
import { removeTitleAlertAction } from '@/actions/titleAlerts';
import type { TitleAlertListItem } from '@/services/alerts';

function alertLabels(a: TitleAlertListItem): string[] {
  const out: string[] = [];
  if (a.streaming) out.push('Starts streaming');
  if (a.leaving) out.push('Leaves a service');
  if (a.newSeason) out.push('New season');
  return out;
}

/** The user's "Notify me when" alerts, with remove. */
export function TitleAlertsList({ initial }: { initial: TitleAlertListItem[] }) {
  const [alerts, setAlerts] = useState(initial);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const remove = (a: TitleAlertListItem) => {
    const before = alerts;
    setAlerts((list) => list.filter((x) => !(x.mediaType === a.mediaType && x.mediaId === a.mediaId)));
    startTransition(async () => {
      const res = await removeTitleAlertAction({ mediaType: a.mediaType, mediaId: a.mediaId });
      if (!res.ok) {
        setAlerts(before);
        toast.error('Could not remove the alert', res.error ?? 'Please try again.');
      }
    });
  };

  if (alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4">
        No title alerts yet. On any movie or show, use <span className="text-foreground">Notify me when</span>{' '}
        to hear when it starts streaming near you, leaves a service, or gets a new season.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {alerts.map((a) => {
        const poster = buildImageUrl(a.posterPath, 'w92');
        return (
          <li key={`${a.mediaType}-${a.mediaId}`} className="flex items-center gap-3 p-3">
            <div className="relative w-9 aspect-2/3 shrink-0 rounded overflow-hidden bg-muted">
              {poster && <Image src={poster} alt="" fill className="object-cover" sizes="36px" />}
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={`/title/${a.mediaType}/${a.mediaId}`}
                className="text-sm font-semibold text-foreground hover:text-primary truncate block"
              >
                {a.title}
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {alertLabels(a).join(' · ')} · {getCountryName(a.region) || a.region}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(a)}
              aria-label={`Remove alerts for ${a.title}`}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <X size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
