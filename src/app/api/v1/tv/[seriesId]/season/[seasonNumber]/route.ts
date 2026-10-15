import { NextRequest, NextResponse } from "next/server";
import { getTvSeasonDetails } from "@/services/tmdb/tvSeason";
import { logger } from "@/lib/log";

// Public, non-personalized TMDB data — safe to cache at the route level.
export const revalidate = 3600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string; seasonNumber: string }> }
) {
  try {
    const { seriesId, seasonNumber } = await params;
    const data = await getTvSeasonDetails(seriesId, seasonNumber);
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
    logger.error("TV Season API Error", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load season. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
