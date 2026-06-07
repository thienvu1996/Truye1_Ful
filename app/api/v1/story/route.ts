import { NextRequest, NextResponse } from "next/server";
import { getScraper, resolveSourceUrl } from "@/lib/sources";
import type { ChapterListItem, StoryMetadata, StoryPayload } from "@/lib/types";

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

    const [storyResult, chaptersResult] = await Promise.all([
      scraper.scrapeStory(resolved.url),
      scraper.scrapeAllChapterPages(resolved.url, { maxPages: 300 }),
    ]);

    if (!storyResult.success || !storyResult.data) {
      throw new Error(storyResult.error ?? "Cannot scrape story metadata");
    }

    const payload: StoryPayload = {
      source: resolved.source,
      resolvedUrl: resolved.url,
      sourcePath: resolved.sourcePath,
      metadata: storyResult.data.metadata as StoryMetadata,
      chapters: ((chaptersResult.success ? chaptersResult.data : storyResult.data.chapters) ??
        []) as ChapterListItem[],
    };

    return NextResponse.json({
      success: true,
      data: payload,
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
