import 'server-only';

import { getNotifications, type TitleAlertNotification } from '@/services/notifications/getNotifications';
import { getForYouPool, type ContinueStatus } from './pool';

/**
 * The sidebar's "Tonight" ticket: tonight's feature (plus a few to swap to),
 * the titles you're in the middle of, and a title you follow that just
 * arrived on a service. A small slice of the cached Programme pool, so the
 * sidebar never ships the whole pool to the client.
 */

export interface TonightTitle {
  key: string;
  href: string;
  title: string;
  mediaType: 'movie' | 'tv';
  posterPath: string | null;
  backdropPath: string | null;
  year: string | null;
  runtimeMinutes: number | null;
  /** First streaming service in your region, if any. */
  service: string | null;
}

export interface TonightPick extends TonightTitle {
  /** "Because you liked X". */
  why: string | null;
}

export interface TonightTicket extends TonightTitle {
  status: ContinueStatus;
}

export interface TonightArrival {
  key: string;
  href: string;
  title: string;
  posterUrl: string | null;
  service: string | null;
}

export interface SidebarTonight {
  arrival: TonightArrival | null;
  picks: TonightPick[];
  tickets: TonightTicket[];
}

const PICKS = 4;
const TICKETS = 3;

function isArrival(n: { kind: string; isRead: boolean }): n is TitleAlertNotification {
  return n.kind === 'title_available' && !n.isRead;
}

export async function getSidebarTonight(userId: string, region: string): Promise<SidebarTonight> {
  const [pool, alerts] = await Promise.all([
    getForYouPool(userId, region),
    // An arrival is a bonus: never let notifications break the card.
    getNotifications(userId, { scope: 'you', pageSize: 20 }).catch(() => null),
  ]);

  const toTitle = (key: string, ui: (typeof pool.picks)[number]['ui']): TonightTitle => ({
    key,
    href: `/title/${ui.mediaType}/${ui.tmdbId}`,
    title: ui.title,
    mediaType: ui.mediaType,
    posterPath: ui.posterPath,
    backdropPath: ui.backdropPath,
    year: ui.year,
    runtimeMinutes: ui.runtimeMinutes,
    service: ui.providers[0]?.providerName ?? null,
  });

  const arrived = alerts?.items.find(isArrival);

  return {
    arrival: arrived
      ? {
          key: arrived.id,
          href: arrived.href,
          title: arrived.title ?? 'A title you follow',
          posterUrl: arrived.posterUrl,
          service: arrived.providers[0] ?? null,
        }
      : null,
    picks: pool.picks.slice(0, PICKS).map((p) => ({ ...toTitle(p.key, p.ui), why: p.reasons[0] ?? null })),
    tickets: pool.continueItems.slice(0, TICKETS).map((c) => ({ ...toTitle(c.key, c.ui), status: c.status })),
  };
}
