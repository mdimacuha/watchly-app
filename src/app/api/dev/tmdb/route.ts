import { NextRequest, NextResponse } from "next/server";
import { search, movie, tv } from "@/server/tmdb";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const op = searchParams.get("op");

  try {
    if (op === "search") {
      const q = searchParams.get("q");
      if (!q) {
        return NextResponse.json({ error: "Missing q param" }, { status: 400 });
      }
      const data = await search(q);
      return NextResponse.json(data);
    }

    if (op === "movie") {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing id param" }, { status: 400 });
      }
      const data = await movie.details(Number(id));
      return NextResponse.json(data);
    }

    if (op === "tv") {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing id param" }, { status: 400 });
      }
      const data = await tv.details(Number(id));
      return NextResponse.json(data);
    }

    return NextResponse.json(
      {
        error: "Unknown op",
        usage: "Use ?op=search&q=... or ?op=movie&id=... or ?op=tv&id=...",
      },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
