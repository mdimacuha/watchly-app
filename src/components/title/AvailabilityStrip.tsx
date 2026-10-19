'use client';

import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { OfferChip, RegionSwitch } from './titleParts';
import { accessLabel, type Availability, type Offer } from './useTitleAvailability';

const PILL = 'rounded-md border border-border bg-card px-2.5 py-1.5';
const VISIBLE = 3;

// A's strip: region label + Streaming on / Rent-buy on groups. Groups longer
// than three collapse behind a "View all" pill styled like the service pills.
export function AvailabilityStrip({
  availability: a,
  stacked,
}: {
  availability: Availability;
  /** Always one column (Quick View's narrow modal). */
  stacked?: boolean;
}) {
  const regionLabel =
    a.status === 'ready' ? a.shownRegionName : a.status === 'empty' ? a.regionName : null;

  return (
    <section
      aria-label="Where to watch"
      className={cn(
        'min-h-[76px] flex flex-col gap-x-6 gap-y-3 border-y border-border py-3.5',
        !stacked && 'lg:flex-row lg:items-start',
      )}
    >
      <div className={`flex items-center gap-3 shrink-0 ${stacked ? '' : 'lg:flex-col lg:items-start lg:gap-0.5 lg:pt-1.5'}`}>
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Watch in {regionLabel ? <span className="font-bold text-foreground">{regionLabel}</span> : '…'}
        </span>
        <RegionSwitch />
      </div>

      {a.status === 'loading' && (
        <div className="flex gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-11 w-36 rounded-md bg-secondary animate-pulse" />
          ))}
        </div>
      )}

      {a.status === 'error' && (
        <button onClick={a.retry} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:pt-2.5">
          <RotateCw className="w-3.5 h-3.5" /> Couldn&apos;t load. Try again
        </button>
      )}

      {a.status === 'empty' && (
        <p className="text-sm text-muted-foreground lg:pt-2.5">Not available to stream, rent or buy here yet.</p>
      )}

      {a.status === 'ready' && (
        <div className="flex flex-col gap-3 min-w-0">
          {a.stream.length > 0 && <Group label="Streaming on" offers={a.stream} />}
          {a.rentBuy.length > 0 && <Group label="Rent / buy on" offers={a.rentBuy} withAccess />}
          {(a.isFallbackRegion || a.viaJustWatch) && (
            <p className="text-xs text-muted-foreground">
              {a.isFallbackRegion && `Not listed in ${a.regionName}; showing ${a.shownRegionName}. `}
              {a.viaJustWatch && (
                <>
                  Source:{' '}
                  {a.justWatchUrl ? (
                    <a href={a.justWatchUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                      JustWatch
                    </a>
                  ) : (
                    'JustWatch'
                  )}
                </>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Group({ label, offers, withAccess }: { label: string; offers: Offer[]; withAccess?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = offers.length > VISIBLE;
  const shown = expanded || !overflow ? offers : offers.slice(0, VISIBLE);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      {shown.map((o) => (
        <OfferChip
          key={o.provider_id}
          offer={o}
          note={withAccess ? accessLabel(o.access) : undefined}
          className={PILL}
        />
      ))}
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className={`${PILL} h-11 text-sm font-semibold text-foreground hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {expanded ? 'Show less' : `View all ${offers.length}`}
        </button>
      )}
    </div>
  );
}
