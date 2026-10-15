import { NextRequest, NextResponse } from "next/server";
import {
  searchCollections,
  getTrendingCollections,
} from "@/services/tmdb/collection";
import { logger } from "@/lib/log";

// Public, non-personalized TMDB data — safe to cache at the route level.
export const revalidate = 3600;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");
  const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1;

  try {
    const data = await (q
      ? searchCollections(q, page)
      : getTrendingCollections(page));

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
    logger.error("Collections API Error", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load collections. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
