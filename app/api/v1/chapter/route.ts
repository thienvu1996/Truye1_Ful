import { NextRequest, NextResponse } from "next/server";
import { getScraper, resolveSourceUrl } from "@/lib/sources";
import type { Chapter } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const input = request.nextUrl.searchParams.get("url") ?? request.nextUrl.searchParams.get("path");

    if (!input) {
      return NextResponse.json(
        { success: false, error: "Query param `url` or `path` is required" },
        { status: 400 },
      );
    }

    const resolved = await resolveSourceUrl(input);
    const scraper = getScraper(resolved.url);
    const result = await scraper.scrapeChapter(resolved.url);

    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Cannot scrape chapter");
    }

    return NextResponse.json({
      success: true,
      data: {
        source: resolved.source,
        resolvedUrl: resolved.url,
        sourcePath: resolved.sourcePath,
        chapter: result.data as Chapter,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
