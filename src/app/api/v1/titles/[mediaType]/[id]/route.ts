import { NextRequest, NextResponse } from "next/server";
import { getTitlePagePayload, MediaType } from "@/services/tmdb/title";
import { cookies } from "next/headers";
import { logger } from "@/lib/log";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaType: string; id: string }> }
) {
  const { mediaType, id } = await params;

  if (mediaType !== "movie" && mediaType !== "tv") {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_MEDIA_TYPE", message: "Invalid media type" } },
      { status: 400 }
    );
  }

  // Region resolution
  const searchParams = request.nextUrl.searchParams;
  let region = searchParams.get("region");

  if (!region) {
    const cookieStore = await cookies();
    region = cookieStore.get("watchly_region")?.value || null;
  }

  if (!region) {
    region = "US";
  }

  try {
    const data = await getTitlePagePayload({
      mediaType: mediaType as MediaType,
      id,
      region,
    });
    // Payload varies by region (query param or `watchly_region` cookie).
    // Cache per-browser only so a shared cache can't serve another
    // region's streaming availability.
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "private, max-age=600" } }
    );
  } catch (error) {
    logger.error("Error fetching title details", error, { mediaType, id });
    const err = error as { statusCode?: number };
    const status = err.statusCode === 404 ? 404 : 500;

    // Don't surface raw TMDB / internal messages to the client. The
    // status code is enough signal; the server log holds the detail.
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: status === 404 ? "NOT_FOUND" : "TMDB_ERROR",
          message:
            status === 404
              ? "Title not found"
              : "Could not load title. Please try again.",
        },
      },
      { status }
    );
  }
}
