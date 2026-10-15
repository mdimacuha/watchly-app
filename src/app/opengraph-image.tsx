import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/seo';

// Default site-wide social card. Any route without its own opengraph-image
// (home, legal, collection/artist fallbacks) inherits this branded image.
export const alt = `${SITE_NAME} — Find Where to Stream Movies & TV Shows`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
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
          background:
            'radial-gradient(1200px 600px at 78% -10%, #1E40AF 0%, rgba(30,64,175,0) 55%), linear-gradient(135deg, #0b0b12 0%, #09090b 60%)',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand lockup: play tile + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '96px',
              height: '96px',
              borderRadius: '22px',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
              boxShadow: '0 20px 60px rgba(59,130,246,0.35)',
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: '24px solid transparent',
                borderBottom: '24px solid transparent',
                borderLeft: '40px solid #F8FAFC',
                marginLeft: '8px',
              }}
            />
          </div>
          <div style={{ fontSize: '76px', fontWeight: 700, letterSpacing: '-2px' }}>
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: '44px',
            fontSize: '46px',
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: '900px',
            letterSpacing: '-1px',
          }}
        >
          Find where to stream movies &amp; TV shows.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '24px',
            fontSize: '28px',
            color: '#a1a1aa',
            maxWidth: '860px',
            lineHeight: 1.4,
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size },
  );
}
