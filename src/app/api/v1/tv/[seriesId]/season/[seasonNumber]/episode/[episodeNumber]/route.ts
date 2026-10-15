import { NextRequest, NextResponse } from "next/server";
import { getTvEpisodeDetails } from "@/services/tmdb/tvEpisode";
import { logger } from "@/lib/log";

// Public, non-personalized TMDB data — cache at the edge (mirrors the season route).
export const revalidate = 3600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string; seasonNumber: string; episodeNumber: string }> }
) {
  try {
    const { seriesId, seasonNumber, episodeNumber } = await params;
    const data = await getTvEpisodeDetails(seriesId, seasonNumber, episodeNumber);
    return NextResponse.json(
      { ok: true, data },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    logger.error("TV Episode API Error", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load episode. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
