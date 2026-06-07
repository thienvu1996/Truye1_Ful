import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getScraper, resolveSourceUrl, safeFilename } from "@/lib/sources";
import type { ChapterListItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: string;
      path?: string;
      from?: number;
      to?: number;
      limit?: number;
    };

    const input = body.url ?? body.path;

    if (!input) {
      return NextResponse.json(
        { success: false, error: "Body field `url` or `path` is required" },
        { status: 400 },
      );
    }

    const resolved = await resolveSourceUrl(input);
    const scraper = getScraper(resolved.url);
    const storyResult = await scraper.scrapeStory(resolved.url);
    const chaptersResult = await scraper.scrapeAllChapterPages(resolved.url, { maxPages: 300 });

    if (!storyResult.success || !storyResult.data) {
      throw new Error(storyResult.error ?? "Cannot scrape story");
    }

    const allChapters = ((chaptersResult.success ? chaptersResult.data : storyResult.data.chapters) ??
      []) as ChapterListItem[];
    const from = Math.max(1, Number(body.from ?? 1));
    const to = Math.max(from, Number(body.to ?? allChapters.length));
    const limit = Math.max(1, Math.min(200, Number(body.limit ?? 50)));
    const selected = allChapters
      .filter((chapter) => chapter.chapterNumber >= from && chapter.chapterNumber <= to)
      .slice(0, limit);

    if (selected.length === 0) {
      throw new Error("No chapters found in requested range");
    }

    const zip = new JSZip();
    const storyName = safeFilename(storyResult.data.metadata.title || "truyen");
    const folder = zip.folder(storyName);

    folder?.file(
      "metadata.json",
      JSON.stringify(
        {
          source: resolved.source,
          sourcePath: resolved.sourcePath,
          resolvedUrl: resolved.url,
          metadata: storyResult.data.metadata,
          exportedAt: new Date().toISOString(),
          chapterCount: selected.length,
        },
        null,
        2,
      ),
    );

    for (const item of selected) {
      if (!item.url) continue;

      const chapterResolved = await resolveSourceUrl(item.url, resolved.source);
      const chapterResult = await getScraper(chapterResolved.url).scrapeChapter(chapterResolved.url);

      if (chapterResult.success && chapterResult.data) {
        const number = String(chapterResult.data.chapterNumber || item.chapterNumber).padStart(5, "0");
        const title = safeFilename(chapterResult.data.title || item.title || `chuong-${number}`);
        folder?.file(`${number}-${title}.txt`, chapterResult.data.contentText || chapterResult.data.content);
      }

      await wait(900);
    }

    const content = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(content as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${storyName}.zip"`,
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
