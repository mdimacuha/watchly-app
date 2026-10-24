import { ImageResponse } from 'next/og';
import qrcode from 'qrcode-generator';
import { receiptRows, ticketCopy } from '@/components/profile/last-watched/ticketCopy';
import { buildImageUrl } from '@/lib/tmdb';
import { SITE_URL } from '@/lib/seo';
import type { LastWatchedTicket } from '@/services/watched/lastWatched';
import { STORY_SIZE, loadFonts, loadWordmark } from './storyImage';

/**
 * Instagram-story export of the last-watched ticket (1080×1920 PNG): the
 * profile's receipt, printed tall, with the customer's @username on it and
 * the "Admit one" stub torn off below, carrying a QR code to their profile.
 * Rendered with next/og (Satori): flexbox only, every multi-child element
 * needs `display: flex`. Times are in the owner's timezone (sent by their
 * browser); the copy rules are the profile's own (ticketCopy).
 */

const C = {
  bg: '#09090b',
  card: '#18181b',
  line: '#3f3f46',
  fg: '#fafafa',
  muted: '#a1a1aa',
};

const W = 936;
const TEAR_H = 34;

/** Deterministic jagged edge (seeded by the username), as points across W. */
function tearPoints(seed: string): [number, number][] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return (h % 1000) / 1000;
  };
  const pts: [number, number][] = [];
  for (let x = 0; x <= W; x += 14 + rand() * 16) pts.push([Math.min(x, W), 6 + rand() * (TEAR_H - 12)]);
  pts.push([W, 6 + rand() * (TEAR_H - 12)]);
  return pts;
}

/** The torn edge as an SVG: `top` = the receipt's ragged bottom; else the stub's ragged top. */
function tearSvg(pts: [number, number][], top: boolean): string {
  const edge = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const poly = top ? `0,0 ${W},0 ${[...pts].reverse().map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}` : `${edge} ${W},${TEAR_H} 0,${TEAR_H}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TEAR_H}" viewBox="0 0 ${W} ${TEAR_H}"><polygon points="${poly}" fill="${C.card}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** The profile URL as a QR code: dark modules on white (scanners need the contrast), quiet zone included. */
function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const q = 4;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + q} ${r + q}h1v1h-1z`;
  const size = n + q * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#09090b"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const mono = { fontFamily: 'Geist Mono', textTransform: 'uppercase' as const, letterSpacing: '0.16em' };

export async function renderTicketStory(ticket: LastWatchedTicket, username: string, timeZone: string | undefined): Promise<ImageResponse> {
  const [fonts, wordmark] = await Promise.all([loadFonts(), loadWordmark()]);
  const copy = ticketCopy(ticket, true, timeZone);
  const rows: [string, string][] = [...receiptRows(copy), ['Customer', `@${username}`]];
  const backdrop = buildImageUrl(ticket.backdropPath ?? ticket.posterPath, 'w1280');
  const poster = buildImageUrl(ticket.posterPath, 'w500');
  const profileUrl = `${SITE_URL}/user/${encodeURIComponent(username)}`;
  const tear = tearPoints(username + ticket.loggedAt);
  const title = ticket.title.length > 40 ? 64 : ticket.title.length > 22 ? 80 : 100;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', background: C.bg, color: C.fg, fontFamily: 'Geist', padding: '72px 72px 64px' }}>
        <div style={{ width: W, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {wordmark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wordmark} alt="" width={172} height={44} />
          ) : (
            <span style={{ fontSize: 40, fontWeight: 700 }}>Watchly</span>
          )}
          <span style={{ ...mono, fontSize: 22, color: C.muted }}>Last showing</span>
        </div>

        {/* The receipt. */}
        <div style={{ marginTop: 44, width: W, display: 'flex', flexDirection: 'column', background: C.card, borderRadius: '36px 36px 0 0', overflow: 'hidden' }}>
          <div style={{ position: 'relative', width: W, height: 540, display: 'flex' }}>
            {backdrop && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={backdrop} alt="" width={W} height={540} style={{ position: 'absolute', top: 0, left: 0, width: W, height: 540, objectFit: 'cover' }} />
            )}
            <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: 540, display: 'flex', backgroundImage: `linear-gradient(to bottom, rgba(24,24,27,0) 35%, ${C.card} 100%)` }} />
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" width={220} height={330} style={{ position: 'absolute', left: 56, bottom: -40, width: 220, height: 330, objectFit: 'cover', borderRadius: 14, boxShadow: '0 24px 48px rgba(0,0,0,0.55)' }} />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', padding: '84px 56px 44px' }}>
            <span style={{ ...mono, fontSize: 22, color: C.muted }}>Screen 1 · Admit one · Receipt</span>
            <span style={{ marginTop: 18, fontFamily: 'Anton', fontSize: title, lineHeight: 0.98, textTransform: 'uppercase', color: C.fg }}>{ticket.title}</span>
            <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'flex-end', gap: 16, ...mono, fontSize: 28 }}>
                  <span style={{ color: C.muted }}>{k}</span>
                  <div style={{ flex: 1, marginBottom: 9, borderBottom: `2px dashed ${C.line}`, display: 'flex' }} />
                  <span style={{ color: C.fg, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            <span style={{ ...mono, marginTop: 34, fontSize: 20, letterSpacing: '0.3em', color: C.muted }}>Thank you · keep this ticket</span>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tearSvg(tear, true)} alt="" width={W} height={TEAR_H} style={{ width: W, height: TEAR_H }} />

        {/* The stub, torn off: a gap, a nudge, a slight tilt. */}
        <div style={{ marginTop: 26, width: W, display: 'flex', flexDirection: 'column', transform: 'rotate(-1.6deg) translateX(10px)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tearSvg(tear, false)} alt="" width={W} height={TEAR_H} style={{ width: W, height: TEAR_H }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, background: C.card, borderRadius: '0 0 36px 36px', padding: '28px 56px 48px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'Anton', fontSize: 150, lineHeight: 0.9, textTransform: 'uppercase' }}>Admit</span>
              <span style={{ fontFamily: 'Anton', fontSize: 150, lineHeight: 0.9, textTransform: 'uppercase' }}>one</span>
              <span style={{ ...mono, marginTop: 20, fontSize: 26, color: C.fg }}>@{username}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSvg(profileUrl)} alt="" width={236} height={236} style={{ borderRadius: 16 }} />
              <span style={{ ...mono, fontSize: 18, color: C.muted }}>Scan for my profile</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', ...mono, fontSize: 20, letterSpacing: '0.12em', color: C.muted }}>{profileUrl.replace(/^https?:\/\//, '')}</div>
      </div>
    ),
    { ...STORY_SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
