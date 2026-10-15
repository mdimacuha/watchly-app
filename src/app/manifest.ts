import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from '@/lib/seo';

/**
 * PWA / web app manifest, served at `/manifest.webmanifest`. Next auto-injects
 * the `<link rel="manifest">` from this file convention.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      {
        src: '/icon-512-maskable.png',
        type: 'image/png',
        sizes: '512x512',
        purpose: 'maskable',
      },
    ],
  };
}
