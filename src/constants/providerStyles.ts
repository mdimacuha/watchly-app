export interface ProviderStyle {
  bg: string;
  text: string;
  border?: string;
}

// A palette of distinct, dark-mode friendly colors for deterministic fallback
export const PROVIDER_STYLE_PALETTE: ProviderStyle[] = [
  { bg: "bg-blue-600", text: "text-white" },
  { bg: "bg-green-600", text: "text-white" },
  { bg: "bg-purple-600", text: "text-white" },
  { bg: "bg-orange-600", text: "text-white" },
  { bg: "bg-pink-600", text: "text-white" },
  { bg: "bg-indigo-600", text: "text-white" },
  { bg: "bg-teal-600", text: "text-white" },
  { bg: "bg-cyan-600", text: "text-white" },
  { bg: "bg-rose-600", text: "text-white" },
  { bg: "bg-amber-600", text: "text-white" },
];

// Major streaming services with official brand colors
// TODO: confirm IDs with the dev route later
export const PROVIDER_STYLE_OVERRIDES: Record<number, ProviderStyle> = {
  8: { bg: "bg-[#E50914]", text: "text-white" }, // Netflix
  9: { bg: "bg-[#00A8E1]", text: "text-white" }, // Amazon Prime Video
  119: { bg: "bg-[#00A8E1]", text: "text-white" }, // Amazon Prime Video (alternate ID)
  337: { bg: "bg-[#113CCF]", text: "text-white" }, // Disney+
  15: { bg: "bg-[#1CE783]", text: "text-black" }, // Hulu
  384: { bg: "bg-[#002BE7]", text: "text-white" }, // HBO Max
  1899: { bg: "bg-[#002BE7]", text: "text-white" }, // Max
  350: { bg: "bg-[#2c2c2c]", text: "text-white" }, // Apple TV+
  531: { bg: "bg-[#0064FF]", text: "text-white" }, // Paramount+
  386: { bg: "bg-[#000000]", text: "text-white", border: "border-white/20" }, // Peacock
  387: { bg: "bg-[#000000]", text: "text-white", border: "border-white/20" }, // Peacock Premium
  283: { bg: "bg-[#F7941D]", text: "text-black" }, // Crunchyroll
  188: { bg: "bg-[#FF0000]", text: "text-white" }, // YouTube Premium
};

// Fallback by normalized key (slug) if ID changes or is missing
export const PROVIDER_KEY_OVERRIDES: Record<string, ProviderStyle> = {
  netflix: { bg: "bg-[#E50914]", text: "text-white" },
  "amazon-prime-video": { bg: "bg-[#00A8E1]", text: "text-white" },
  "prime-video": { bg: "bg-[#00A8E1]", text: "text-white" },
  "disney-plus": { bg: "bg-[#113CCF]", text: "text-white" },
  "disney": { bg: "bg-[#113CCF]", text: "text-white" },
  hulu: { bg: "bg-[#1CE783]", text: "text-black" },
  "hbo-max": { bg: "bg-[#002BE7]", text: "text-white" },
  max: { bg: "bg-[#002BE7]", text: "text-white" },
  "apple-tv-plus": { bg: "bg-[#000000]", text: "text-white" },
  "apple-tv": { bg: "bg-[#000000]", text: "text-white" },
  "apple-tv-store": { bg: "bg-[#000000]", text: "text-white" },
  "google-play": { bg: "bg-white", text: "text-black" },
  "google-play-movies": { bg: "bg-white", text: "text-black" },
  "paramount-plus": { bg: "bg-[#0064FF]", text: "text-white" },
  peacock: { bg: "bg-[#000000]", text: "text-white", border: "border-white/20" },
  "peacock-premium": { bg: "bg-[#000000]", text: "text-white", border: "border-white/20" },
  crunchyroll: { bg: "bg-[#F7941D]", text: "text-black" },
  "youtube-premium": { bg: "bg-[#FF0000]", text: "text-white" },
  youtube: { bg: "bg-[#FF0000]", text: "text-white" },
  rent: { bg: "bg-transparent", text: "text-muted-foreground", border: "border-muted-foreground" },
  "rent-only": { bg: "bg-transparent", text: "text-muted-foreground", border: "border-muted-foreground" },
};
