import { NextRequest, NextResponse } from "next/server";
import { getCollectionImages } from "@/services/tmdb/collection";
import { logger } from "@/lib/log";

// Public, non-personalized TMDB image list — cache hard at the edge.
export const revalidate = 86400;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getCollectionImages(parseInt(id));
    return NextResponse.json(
      { ok: true, data },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (error) {
    logger.error("Collection Images API Error", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load collection images.",
        },
      },
      { status: 500 }
    );
  }
}
