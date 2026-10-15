export function buildImageUrl(
  path: string | null | undefined,
  size: "original" | "w1280" | "w780" | "w500" | "w342" | "w300" | "w200" | "w185" | "w154" | "w92" = "original"
): string | null {
  if (!path) return null;
  // Ensure path starts with / if not present (though TMDB usually returns it with /)
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  // Use NEXT_PUBLIC_ var if available, fall back to server-side var, then default
  // Note: standard env vars are not available on client unless prefixed with NEXT_PUBLIC_
  const baseUrl = 
    process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL || 
    process.env.TMDB_IMAGE_BASE_URL || 
    "https://image.tmdb.org/t/p";
    
  return `${baseUrl}/${size}${cleanPath}`;
}
