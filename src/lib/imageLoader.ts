// Custom next/image loader. Serves TMDB images straight from TMDB's CDN
// (remapping the requested width to the nearest TMDB size bucket) and every
// other source (UploadThing, Google, local assets) unchanged. This bypasses the
// Vercel Image Optimizer entirely, so next/image consumes ZERO Vercel image
// transformations — and TMDB bytes are served by image.tmdb.org, not billed as
// Vercel image bandwidth. Every TMDB URL is immutable per size + hash.
//
// Runs in the browser (loaderFile modules are client-side): keep it a pure
// function with no imports and no server-only dependencies.

// TMDB's fixed poster/backdrop/still width buckets on image.tmdb.org.
const TMDB_WIDTH_BUCKETS = [92, 154, 185, 342, 500, 780, 1280];

export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // TMDB URLs look like https://image.tmdb.org/t/p/<size>/<hash>.jpg where
  // <size> is `w500` or `original`. Remap to the smallest bucket >= the width
  // next/image asked for so the browser fetches an appropriately sized image
  // (this also downsizes `original` backdrops instead of shipping full res).
  if (/\/t\/p\/(w\d+|original)\//.test(src)) {
    const bucket =
      TMDB_WIDTH_BUCKETS.find((b) => b >= width) ??
      TMDB_WIDTH_BUCKETS[TMDB_WIDTH_BUCKETS.length - 1];
    return src.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/w${bucket}/`);
  }
  // Everything else: serve the source URL as-is (no optimizer round-trip).
  return src;
}
