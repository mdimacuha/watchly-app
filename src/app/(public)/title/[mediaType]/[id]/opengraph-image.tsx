import { ImageResponse } from 'next/og';
import { getTitleMeta } from '@/services/tmdb/meta';
import { buildImageUrl } from '@/lib/tmdb';
import { SITE_NAME } from '@/lib/seo';

export const alt = 'Where to watch on Watchly';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Reuses the same cached `/{mediaType}/{id}` detail fetch as the page + its
// generateMetadata — a social crawler hitting this route triggers no extra
// upstream TMDB traffic once the Data Cache is warm.
export default async function Image({
  params,
}: {
  params: Promise<{ mediaType: string; id: string }>;
}) {
  const { mediaType, id } = await params;
  const meta =
    mediaType === 'movie' || mediaType === 'tv'
      ? await getTitleMeta({ mediaType, id })
      : null;

  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '46px',
          height: '46px',
          borderRadius: '11px',
          background: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: '11px solid transparent',
            borderBottom: '11px solid transparent',
            borderLeft: '18px solid #F8FAFC',
            marginLeft: '4px',
          }}
        />
      </div>
      <div style={{ fontSize: '34px', fontWeight: 700, letterSpacing: '-1px' }}>
        {SITE_NAME}
      </div>
    </div>
  );

  // Fallback: unknown/404 title → branded generic card.
  if (!meta) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '80px',
            background: 'linear-gradient(135deg, #0b0b12 0%, #09090b 60%)',
            color: '#fafafa',
            fontFamily: 'sans-serif',
          }}
        >
          {brand}
          <div style={{ display: 'flex', marginTop: '32px', fontSize: '52px', fontWeight: 700 }}>
            Find where to stream movies &amp; TV shows.
          </div>
        </div>
      ),
      { ...size },
    );
  }

  const backdrop = buildImageUrl(meta.backdropPath, 'w1280');
  const poster = buildImageUrl(meta.posterPath, 'w500');
  const metaLine = [
    meta.year,
    meta.mediaType === 'tv'
      ? meta.numberOfSeasons
        ? `${meta.numberOfSeasons} season${meta.numberOfSeasons === 1 ? '' : 's'}`
        : 'TV Series'
      : 'Movie',
    meta.genres.slice(0, 2).join(' · '),
  ]
    .filter(Boolean)
    .join('  •  ');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#09090b',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Backdrop */}
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1200px',
              height: '630px',
              objectFit: 'cover',
              opacity: 0.35,
            }}
          />
        )}
        {/* Legibility gradient */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1200px',
            height: '630px',
            display: 'flex',
            background:
              'linear-gradient(90deg, #09090b 22%, rgba(9,9,11,0.75) 55%, rgba(9,9,11,0.55) 100%)',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '70px',
            alignItems: 'center',
            gap: '56px',
          }}
        >
          {poster && (
            <img
              src={poster}
              alt=""
              width={320}
              height={480}
              style={{
                width: '320px',
                height: '480px',
                objectFit: 'cover',
                borderRadius: '20px',
                boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              height: '480px',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '3px',
                  color: '#60a5fa',
                  textTransform: 'uppercase',
                }}
              >
                Where to Watch
              </div>
              <div
                style={{
                  display: 'flex',
                  marginTop: '18px',
                  fontSize: meta.name.length > 32 ? '58px' : '72px',
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: '-2px',
                }}
              >
                {meta.name}
              </div>
              {metaLine && (
                <div
                  style={{
                    display: 'flex',
                    marginTop: '22px',
                    fontSize: '28px',
                    color: '#d4d4d8',
                  }}
                >
                  {metaLine}
                </div>
              )}
            </div>

            {brand}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
