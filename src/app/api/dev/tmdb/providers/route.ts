import { NextRequest, NextResponse } from "next/server";
import { getProvidersCatalog } from "@/server/tmdb/providersCatalog";

export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const region = searchParams.get("region") || "US";

  try {
    const catalog = await getProvidersCatalog(region);
    return NextResponse.json(catalog);
  } catch (error) {
    console.error("Dev route error:", error);
    return NextResponse.json(
      { error: "Failed to fetch providers catalog" },
      { status: 500 }
    );
  }
}
