'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/client/stores/auth';
import { useRegionStore } from '@/client/stores/region';
import { getCountryName } from '@/lib/regions/countries';
import { getWatchlistsForPickerAction } from '@/actions/watchlists';
import { languageName, useFinishTime } from './titleParts';
import { useToast } from '@/hooks/useToast';
import { getTitleAlertAction, setTitleAlertAction } from '@/actions/titleAlerts';
import type { TitleAlertSettings } from '@/services/alerts';
import type { Availability } from './useTitleAvailability';
import type { TitlePagePayload } from '@/services/tmdb/title';

const CARD = 'rounded-md border border-border bg-card p-4';

export function YouCard({
  titleData,
  availability,
  className,
}: {
  titleData: TitlePagePayload;
  availability: Availability;
  className?: string;
}) {
  const { mediaType, id, details } = titleData;
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const finish = useFinishTime(details.runtimeMinutes);

  return (
    <div className={cn(CARD, 'flex flex-col gap-4', className)}>
      <h3 className="text-sm font-bold text-foreground">You</h3>

      {details.runtimeMinutes ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{mediaType === 'tv' ? 'One episode now' : 'Start now'}</span>
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Clock className="w-3 h-3" /> {finish ? `ends ${finish}` : '—'}
          </span>
        </div>
      ) : null}

      {isAuthenticated ? (
        <InYourLists mediaType={mediaType} id={id} />
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          <Link href="/signin" className="text-foreground underline underline-offset-4">Sign in</Link> to add this to
          your lists and get alerts.
        </p>
      )}

      {isAuthenticated && <NotifyMe titleData={titleData} availability={availability} />}
    </div>
  );
}

function InYourLists({ mediaType, id }: { mediaType: 'movie' | 'tv'; id: string }) {
  const [lists, setLists] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWatchlistsForPickerAction(mediaType, id)
      .then((all) => {
        if (!cancelled) setLists(all.filter((l) => l.containsItem).map((l) => ({ id: l.id, name: l.name })));
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, id]);

  return (
    <div className="flex flex-col gap-2 text-xs min-h-[44px]">
      <span className="text-muted-foreground">In your lists</span>
      {lists === null ? (
        <div className="h-6 w-32 rounded-sm bg-secondary animate-pulse" />
      ) : lists.length === 0 ? (
        <span className="text-muted-foreground">Not in any list yet.</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {lists.map((l) => (
            <Link
              key={l.id}
              href={`/watchlists/${l.id}`}
              className="rounded-sm bg-secondary px-2 py-1 font-medium text-foreground hover:bg-secondary/70"
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type AlertKey = 'streaming' | 'leaving' | 'newSeason';

const ENDED_STATUSES = new Set(['Ended', 'Canceled']);
const NO_ALERT: TitleAlertSettings = { streaming: false, leaving: false, newSeason: false, region: null };

// "Notify me when": real alerts, checked daily for the user's region. An
// option is disabled (unless already on) when it can't happen from here:
// already streaming, not streaming, or a finished series.
function NotifyMe({ titleData, availability }: { titleData: TitlePagePayload; availability: Availability }) {
  const { mediaType, id } = titleData;
  const regionCode = useRegionStore((s) => s.regionCode);
  const regionName = useRegionStore((s) => s.regionName) || getCountryName(regionCode) || 'your region';
  const toast = useToast();
  const [alert, setAlert] = useState<TitleAlertSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTitleAlertAction({ mediaType, mediaId: id })
      .then((a) => {
        if (!cancelled) setAlert(a ?? NO_ALERT);
      })
      .catch(() => {
        if (!cancelled) setAlert(NO_ALERT);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, id]);

  // Streaming here right now (not a fallback country's offers)?
  const streamingHere =
    availability.status === 'ready'
      ? !availability.isFallbackRegion && availability.stream.length > 0
      : availability.status === 'empty'
        ? false
        : null;
  const ended = ENDED_STATUSES.has(titleData.extras.status ?? '');

  const options: { key: AlertKey; label: string; blockedBy: string | null }[] = [
    { key: 'streaming', label: `It streams in ${regionName}`, blockedBy: streamingHere ? 'Streaming now' : null },
    ...(mediaType === 'tv'
      ? [{ key: 'newSeason' as const, label: 'A new season airs', blockedBy: ended ? 'Series ended' : null }]
      : []),
    { key: 'leaving', label: 'It leaves a service', blockedBy: streamingHere === false ? 'Not streaming here' : null },
  ];

  const toggle = async (key: AlertKey) => {
    if (!alert || !regionCode || saving) return;
    const before = alert;
    const next = { ...alert, [key]: !alert[key], region: regionCode };
    setAlert(next);
    setSaving(true);
    const res = await setTitleAlertAction({
      mediaType,
      mediaId: id,
      region: regionCode,
      streaming: next.streaming,
      leaving: next.leaving,
      newSeason: next.newSeason,
    }).catch(() => ({ ok: false as const, error: 'Please try again.' }));
    setSaving(false);
    if (res.ok) {
      setAlert(res.alert);
    } else {
      setAlert(before);
      toast.error('Could not save the alert', res.error);
    }
  };

  const anyOn = !!alert && (alert.streaming || alert.leaving || alert.newSeason);
  const otherRegion = anyOn && alert?.region && alert.region !== regionCode ? alert.region : null;

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
        <Bell className="w-3 h-3" /> Notify me when
      </p>
      <div className="flex flex-col gap-1.5" aria-busy={saving}>
        {options.map((o) => {
          const checked = !!alert?.[o.key];
          const disabled = !alert || !regionCode || saving || (!!o.blockedBy && !checked);
          return (
            <label
              key={o.key}
              className={cn(
                'flex items-center gap-2 text-xs text-muted-foreground',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:text-foreground',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(o.key)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span className="flex-1">{o.label}</span>
              {o.blockedBy && !checked && <span className="text-[11px]">{o.blockedBy}</span>}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {otherRegion
          ? `Set for ${getCountryName(otherRegion) || otherRegion}; changing it moves it to ${regionName}. `
          : anyOn
            ? 'Checked daily. '
            : ''}
        <Link href="/settings#settings-notifications" className="underline underline-offset-4 hover:text-foreground">
          Manage alerts
        </Link>
      </p>
    </div>
  );
}

export function DetailsCard({ titleData, className }: { titleData: TitlePagePayload; className?: string }) {
  const { infoPanelData: d } = titleData;
  const countries = d.countries
    .map((c) => (c.name && c.name !== c.code ? c.name : getCountryName(c.code) ?? c.code))
    .join(', ');

  return (
    <div className={cn(CARD, className)}>
      <h3 className="text-sm font-bold text-foreground mb-3">Details</h3>
      <dl className="flex flex-col gap-3 text-xs">
        <Fact label="Country" value={countries} />
        <Fact label="Language" value={languageName(d.primaryLanguage)} />
        <Fact label="Studios" value={d.studios.slice(0, 3).map((s) => s.name).join(', ')} />
        <Fact label="Also known as" value={d.alternativeTitles.slice(0, 2).join(' · ')} />
      </dl>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export function LinksCard({ titleData, className }: { titleData: TitlePagePayload; className?: string }) {
  const links = titleData.extras.externalLinks;
  if (links.length === 0) return null;
  return (
    <div className={cn(CARD, className)}>
      <h3 className="text-sm font-bold text-foreground mb-3">External links</h3>
      <ul className="flex flex-col divide-y divide-border">
        {links.map((l) => (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between py-2 text-xs font-medium text-foreground hover:text-primary"
            >
              {l.label}
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
