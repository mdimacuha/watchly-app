import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import type { ReactNode } from 'react';
import type { ProfileShowcase } from '@/actions/profile';
import { billingLine, estDate, memberCardModel, nameOf } from '@/components/profile/profileModel';
import { ACCENTS, isAccentSlug } from '@/constants/accentColors';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import { buildImageUrl } from '@/lib/tmdb';
import { SITE_URL } from '@/lib/seo';

/**
 * Instagram-story export of a profile (1080×1920 PNG): the member card on
 * top, "By the numbers" below. Rendered with next/og (Satori), so layout is
 * flexbox-only and every multi-child element needs `display: flex`.
 */

export const STORY_SIZE = { width: 1080, height: 1920 } as const;

const C = {
  bg: '#09090b',
  card: '#18181b',
  secondary: '#27272a',
  border: '#27272a',
  fg: '#fafafa',
  muted: '#a1a1aa',
};

// ---------------------------------------------------------------------------
// Fonts — Geist (+ Mono for kickers) as TTF from Google Fonts. Memoized per
// server instance; on failure Satori's built-in font is used instead.
// ---------------------------------------------------------------------------

type StoryFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: 'normal' };
let fontsPromise: Promise<StoryFont[]> | null = null;

function loadFonts(): Promise<StoryFont[]> {
  fontsPromise ??= (async () => {
    // No User-Agent → Google serves TrueType, which Satori can read (not woff2).
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700&family=Geist+Mono:wght@500',
    ).then((r) => r.text());
    const faces = [...css.matchAll(/font-family: '([^']+)';[\s\S]*?font-weight: (\d+);[\s\S]*?src: url\(([^)]+)\)/g)];
    return Promise.all(
      faces.map(async ([, name, weight, url]) => ({
        name,
        weight: Number(weight) as StoryFont['weight'],
        style: 'normal' as const,
        data: await fetch(url).then((r) => r.arrayBuffer()),
      })),
    );
  })().catch(() => {
    fontsPromise = null; // retry next time
    return [];
  });
  return fontsPromise;
}

/** The Watchly wordmark (public/brand-light.svg) as a data URI; null → text fallback. */
let wordmarkPromise: Promise<string | null> | null = null;
function loadWordmark(): Promise<string | null> {
  wordmarkPromise ??= readFile(path.join(process.cwd(), 'public', 'brand-light.svg'))
    .then((buf) => `data:image/svg+xml;base64,${buf.toString('base64')}`)
    .catch(() => null);
  return wordmarkPromise;
}

// Mirrors UserAvatar's hash → gradient so the initials disc matches the app.
const AVATAR_GRADIENTS: [string, string][] = [
  ['#6366f1', '#d946ef'],
  ['#10b981', '#06b6d4'],
  ['#f59e0b', '#f43f5e'],
  ['#0ea5e9', '#8b5cf6'],
  ['#ec4899', '#f97316'],
  ['#14b8a6', '#3b82f6'],
  ['#a855f7', '#ec4899'],
  ['#84cc16', '#10b981'],
];
function avatarGradient(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

/** 8-digit hex with alpha, e.g. alpha('#f43f5e', 0.4). */
function alpha(hex: string, a: number) {
  return `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}

export async function renderProfileStory(showcase: ProfileShowcase, origin: string): Promise<ImageResponse> {
  const [fonts, wordmark] = await Promise.all([loadFonts(), loadWordmark()]);
  const { overview } = showcase;
  const p = overview.profile;
  const accent = isAccentSlug(p.accentColor) ? ACCENTS[p.accentColor].primary : ACCENTS.blue.primary;
  const { feature, featureLabel, tally, stamps, country } = memberCardModel(showcase);
  const hero = feature ? buildImageUrl(feature.backdropPath ?? feature.posterPath, 'w1280') : null;
  const avatarSrc = p.avatarUrl ? new URL(p.avatarUrl, origin).toString() : null;
  const [g1, g2] = avatarGradient(`${p.firstName ?? ''}${p.lastName ?? ''}` || '?');
  const initials = `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || p.username[0]?.toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: C.bg,
          color: C.fg,
          fontFamily: 'Geist',
          position: 'relative',
          padding: '80px 88px 72px',
        }}
      >
        {/* Backdrop wash from the featured title, fading into the canvas. */}
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" width={1080} height={900} style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 900, objectFit: 'cover', opacity: 0.35 }} />
        )}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1080,
            height: 900,
            backgroundImage: `linear-gradient(to bottom, ${alpha(C.bg, 0.2)}, ${alpha(C.bg, 0.75)} 60%, ${C.bg})`,
          }}
        />

        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          {wordmark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wordmark} alt="Watchly" width={216} height={56} />
          ) : (
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Watchly</div>
          )}
          <Kicker color={C.muted}>Member card</Kicker>
        </div>

        {/* Member card — accent gradient edge, ticket notches */}
        <div style={{ display: 'flex', position: 'relative', borderRadius: 44, padding: 3, backgroundImage: `linear-gradient(135deg, ${accent}, ${alpha(accent, 0.3)} 45%, ${C.border})` }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderRadius: 41, background: C.card, padding: '36px 44px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: `linear-gradient(135deg, ${alpha(accent, 0.12)}, transparent 50%)` }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'Geist Mono', fontSize: 20, letterSpacing: 4, textTransform: 'uppercase', color: C.muted }}>
              <span>Est. {estDate(p.memberSince)}</span>
              {tally.length > 0 && <span>{tally.join(' · ')}</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginTop: 24 }}>
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="" width={150} height={150} style={{ borderRadius: 999, objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 150, height: 150, borderRadius: 999, backgroundImage: `linear-gradient(135deg, ${g1}, ${g2})`, fontSize: 56, fontWeight: 700, color: '#fff' }}>
                  {initials}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.05 }}>{nameOf(p)}</span>
                  {isVerifiedAccount(p.username) && <VerifiedCheck color={accent} />}
                </div>
                <span style={{ fontSize: 30, color: C.muted, marginTop: 6 }}>
                  @{p.username}
                  {country ? ` · ${country}` : ''}
                </span>
              </div>
            </div>

            {p.bio && <div style={{ display: 'flex', fontSize: 32, marginTop: 22, lineHeight: 1.35 }}>{p.bio.slice(0, 160)}</div>}
            <div style={{ display: 'flex', fontSize: 28, marginTop: 24, paddingLeft: 20, borderLeft: `5px solid ${accent}`, lineHeight: 1.35 }}>
              {billingLine(showcase)}
            </div>

            {stamps.length > 0 && (
              <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
                {stamps.map((s, i) => (
                  <div
                    key={s.label}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '14px 30px',
                      borderRadius: 999,
                      border: `3px dashed ${alpha(accent, 0.65)}`,
                      transform: `rotate(${i % 2 ? 2 : -2}deg)`,
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: C.muted }}>{s.label}</span>
                    <span style={{ fontSize: 28, fontWeight: 700 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}

            {feature && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 22, paddingTop: 20, borderTop: `2px dashed ${C.border}` }}>
                {feature.posterPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={buildImageUrl(feature.posterPath, 'w342')!} alt="" width={96} height={144} style={{ borderRadius: 12, objectFit: 'cover' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
                  <Kicker color={accent}>{featureLabel}</Kicker>
                  <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>{feature.title}</span>
                  {feature.year && <span style={{ fontSize: 26, color: C.muted }}>{feature.year}</span>}
                </div>
              </div>
            )}
          </div>
          {/* Ticket punches: half-circles cut into both edges (canvas-coloured,
              accent rim continuing the gradient border), drawn last so they sit
              on top of the card. */}
          <div style={{ position: 'absolute', left: 0, top: '50%', marginTop: -26, width: 26, height: 52, background: C.bg, borderTopRightRadius: 26, borderBottomRightRadius: 26, border: `3px solid ${alpha(accent, 0.55)}`, borderLeft: 'none' }} />
          <div style={{ position: 'absolute', right: 0, top: '50%', marginTop: -26, width: 26, height: 52, background: C.bg, borderTopLeftRadius: 26, borderBottomLeftRadius: 26, border: `3px solid ${alpha(accent, 0.55)}`, borderRight: 'none' }} />
        </div>

        {/* By the numbers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 28, marginBottom: 16 }}>
          <Kicker color={C.fg}>By the numbers</Kicker>
          <div style={{ display: 'flex', flex: 1, height: 2, background: C.border }} />
        </div>
        <Numbers showcase={showcase} accent={accent} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 44, flexShrink: 0, fontSize: 26, color: C.muted }}>
          <span>Find me on Watchly</span>
          <span style={{ color: C.fg, fontWeight: 600 }}>{`${SITE_URL.replace(/^https?:\/\//, '')}/user/${p.username}`}</span>
        </div>
      </div>
    ),
    {
      ...STORY_SIZE,
      fonts: fonts.length ? fonts : undefined,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}

// ---------------------------------------------------------------------------
// By the numbers — same frames as the page, paired into rows of two; the
// Watchly Swipe frame always spans the full width.
// ---------------------------------------------------------------------------

function Numbers({ showcase, accent }: { showcase: ProfileShowcase; accent: string }) {
  const { overview, insights } = showcase;
  const total = insights.mix.films + insights.mix.series;
  const films = total ? Math.round((insights.mix.films / total) * 100) : 0;
  const weights = (overview.tasteProfile.genreWeights ?? []).slice(0, 5);
  const half: { label: string; node: ReactNode; background?: string | null }[] = [];

  if (total >= 3) {
    half.push({
      label: 'Films vs series',
      node: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Big value={`${films}%`} unit="films" />
          <Bar pct={films} color={accent} />
          <Small>{`${insights.mix.films} films · ${insights.mix.series} series`}</Small>
        </div>
      ),
    });
  }
  if (overview.tasteProfile.decades[0]) {
    half.push({
      label: 'Favourite era',
      node: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Big value={overview.tasteProfile.decades[0]} />
          <Small>{`then ${overview.tasteProfile.decades.slice(1).join(', ') || '—'}`}</Small>
        </div>
      ),
    });
  }
  if (insights.comingSoon) {
    const t = insights.comingSoon;
    half.push({
      label: 'Coming soon',
      background: t.backdropPath ?? t.posterPath,
      node: (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginTop: 'auto' }}>
          {t.posterPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={buildImageUrl(t.posterPath, 'w342')!} alt="" width={88} height={132} style={{ borderRadius: 10, objectFit: 'cover' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{t.title}</span>
            <span style={{ fontSize: 22, color: C.muted, marginTop: 6 }}>{t.year ? `${t.year} · Up next` : 'Up next'}</span>
          </div>
        </div>
      ),
    });
  }
  if (weights.length) {
    const max = weights[0].count;
    half.push({
      label: 'Taste DNA',
      node: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {weights.map((w) => (
            <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 22 }}>
              <span style={{ width: 170 }}>{w.name}</span>
              <div style={{ display: 'flex', flex: 1, height: 10, borderRadius: 999, background: C.secondary }}>
                <div style={{ width: `${Math.round((w.count / max) * 100)}%`, height: 10, borderRadius: 999, background: accent }} />
              </div>
            </div>
          ))}
        </div>
      ),
    });
  }
  if (insights.reviews.count > 0 && insights.reviews.average != null) {
    half.push({
      label: 'Review voice',
      node: <Big value={`${insights.reviews.average}★`} unit={`avg of ${insights.reviews.count}`} />,
    });
  }

  const rows: (typeof half)[] = [];
  for (let i = 0; i < half.length; i += 2) rows.push(half.slice(i, i + 2));
  let n = 0;

  const s = insights.swipes && insights.swipes.total > 0 ? insights.swipes : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', gap: 16 }}>
          {row.map((f) => (
            <Frame key={f.label} n={++n} label={f.label} background={f.background}>
              {f.node}
            </Frame>
          ))}
        </div>
      ))}
      {s && (
        <div style={{ display: 'flex' }}>
          <Frame n={++n} label="Watchly Swipe">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
              <Big value={s.total.toLocaleString('en-US')} unit="swipes" />
              <Small>{`Said yes to ${Math.round(((s.liked + s.saved) / s.total) * 100)}%`}</Small>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
              {[
                { label: 'Liked', value: s.liked, color: accent },
                { label: 'Favorited', value: s.saved, color: accent },
                { label: 'Passed', value: s.passed, color: C.muted },
              ].map((b) => (
                <div key={b.label} style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22 }}>
                    <span>{b.label}</span>
                    <span style={{ color: C.muted }}>{b.value}</span>
                  </div>
                  <div style={{ display: 'flex', height: 10, borderRadius: 999, background: C.secondary }}>
                    <div style={{ width: `${Math.round((b.value / s.total) * 100)}%`, height: 10, borderRadius: 999, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Frame>
        </div>
      )}
    </div>
  );
}

/** A bento cell; an optional backdrop fills it, faded up from the bottom like the page's frames. */
function Frame({ n, label, background, children }: { n: number; label: string; background?: string | null; children: ReactNode }) {
  const bg = background ? buildImageUrl(background, 'w780') : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', borderRadius: 28, border: `2px solid ${C.border}`, background: C.card, padding: '20px 26px' }}>
      {bg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg} alt="" width={460} height={320} style={{ position: 'absolute', top: 0, left: 0, width: 460, height: 320, objectFit: 'cover', opacity: 0.4 }} />
      )}
      {bg && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: `linear-gradient(to top, ${C.card}, ${alpha(C.card, 0.7)} 45%, ${alpha(C.card, 0.3)})` }} />
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 18, color: C.muted }}>{String(n).padStart(2, '0')}</span>
        <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: C.muted }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>{children}</div>
    </div>
  );
}

function Big({ value, unit }: { value: string; unit?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>{value}</span>
      {unit && <span style={{ fontSize: 24, color: C.muted }}>{unit}</span>}
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 999, background: C.secondary, marginTop: 14 }}>
      <div style={{ width: `${pct}%`, height: 10, borderRadius: 999, background: color }} />
    </div>
  );
}

function Small({ children }: { children: string }) {
  return <span style={{ fontSize: 22, color: C.muted, marginTop: 10 }}>{children}</span>;
}

function Kicker({ children, color }: { children: string; color: string }) {
  return (
    <span style={{ fontFamily: 'Geist Mono', fontSize: 20, fontWeight: 500, letterSpacing: 5, textTransform: 'uppercase', color }}>
      {children}
    </span>
  );
}

/** lucide BadgeCheck, inlined (Satori renders SVG but not React icon components). */
function VerifiedCheck({ color }: { color: string }) {
  return (
    <svg width="52" height="52" viewBox="0 0 24 24" fill={alpha(color, 0.15)} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
