import { useToastStore } from "@/client/stores/toast";

export function generateShareUrl(mediaType: "movie" | "tv" | "co", id: string | number): string {
  // Ensure we are on the client side to get the origin, otherwise default to relative (or env var if needed)
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${mediaType}-${id}`;
}

async function shareLink(url: string, shareTitle: string, shareText: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url });
      return;
    } catch (err) {
      // User cancelled or share failed, fall back to clipboard
      console.warn("Share failed or cancelled, falling back to clipboard", err);
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    useToastStore.getState().addToast({
      title: "Link copied to clipboard!",
      type: "success"
    });
  } catch (err) {
    console.error("Failed to copy to clipboard", err);
    useToastStore.getState().addToast({
      title: "Failed to copy link.",
      type: "error"
    });
  }
}

export async function shareTitle(mediaType: "movie" | "tv" | "co", id: string | number, title: string) {
  const url = generateShareUrl(mediaType, id);
  return shareLink(url, `Check out ${title} on Watchly`, `I found ${title} on Watchly!`);
}

export async function shareWatchlist(id: string, name: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/watchlists/${id}`;
  return shareLink(url, `Check out "${name}" on Watchly`, `Take a look at my watchlist "${name}" on Watchly!`);
}
