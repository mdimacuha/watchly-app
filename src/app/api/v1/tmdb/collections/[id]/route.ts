import { NextRequest, NextResponse } from "next/server";
import { getCollectionDetails } from "@/services/tmdb/collection";
import { logger } from "@/lib/log";

// Public, non-personalized TMDB data — safe to cache at the route level.
export const revalidate = 3600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getCollectionDetails(id);
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
    logger.error("Collection API Error", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load collection. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
