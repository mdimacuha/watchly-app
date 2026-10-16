import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Release notes are read from disk (src/services/changelog) by the route-group
  // layouts and /changelogs — make sure serverless bundles include them.
  outputFileTracingIncludes: {
    '/**/*': ['./changelogs/**/*.md'],
    // Story export embeds the wordmark from disk (server/profile/storyImage).
    '/api/me/profile/story': ['./public/brand-light.svg'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  images: {
    // Custom loader (src/lib/imageLoader.ts) serves TMDB images straight from
    // TMDB's CDN and every other source unchanged, bypassing the Vercel Image
    // Optimizer entirely → zero image transformations (and zero Vercel image
    // bandwidth for TMDB). See docs/caching-strategy.md §3e.
    loaderFile: './src/lib/imageLoader.ts',
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000, // 1 year — content-addressed/immutable URLs
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    deviceSizes: [320, 420, 640, 768, 1024, 1280, 1536, 1920],
    // NO remotePatterns — deliberately. `remotePatterns` exists only to
    // authorise the built-in /_next/image optimizer, and the loader above means
    // nothing we render ever reaches it. Leaving hosts allow-listed kept the
    // endpoint open: crawlers had already indexed ~150k /_next/image?url=... URLs
    // from before the loader shipped, and every replayed hit was still a billed
    // transformation (200 + cache MISS). With no allow-list those requests are
    // rejected for free. Re-adding a host here re-opens that hole — if you ever
    // genuinely need the optimizer, drop `loaderFile` in the same change.
  },
};

export default nextConfig;
