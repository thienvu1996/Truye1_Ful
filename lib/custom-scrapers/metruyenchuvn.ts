import * as cheerio from "cheerio";
import type { Chapter, ChapterListItem, StoryMetadata } from "@/lib/types";

type ScrapeResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type BulkOptions = {
  maxPages?: number;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";

function absoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  return new URL(value, baseUrl).toString();
}

function extractNumber(value: string) {
  const matched = value.match(/chuong-(\d+)/i) ?? value.match(/ch(?:u|ư)ơ?ng\s*(\d+)/i);
  return matched ? Number(matched[1]) : 0;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function htmlToPlainText(html: string) {
  return cheerio
    .load(`<main>${html.replace(/<br\s*\/?>/gi, "\n")}</main>`)("main")
    .text()
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}`);
  }

  return response.text();
}

function parseChapterLinks(html: string, baseUrl: string): ChapterListItem[] {
  const $ = cheerio.load(html);
  const chapters: ChapterListItem[] = [];

  $("#chapter-list a, a[href*='/chuong-']").each((_, element) => {
    const href = $(element).attr("href");
    const title = cleanText($(element).text());
    const url = absoluteUrl(href, baseUrl);

    if (!href || !url || !title) return;

    const chapterNumber = extractNumber(href) || extractNumber(title);

    if (!chapterNumber) return;

    chapters.push({
      chapterNumber,
      title,
      url,
      id: url,
    });
  });

  return [...new Map(chapters.map((chapter) => [chapter.url, chapter])).values()].sort(
    (left, right) => left.chapterNumber - right.chapterNumber,
  );
}

function parseLastPage($: cheerio.CheerioAPI) {
  let lastPage = 1;

  $(".paging a[onclick]").each((_, element) => {
    const onclick = $(element).attr("onclick") ?? "";
    const matched = onclick.match(/page\(\s*\d+\s*,\s*(\d+)\s*\)/);

    if (matched) {
      lastPage = Math.max(lastPage, Number(matched[1]));
    }
  });

  return lastPage;
}

function parseBookId($: cheerio.CheerioAPI) {
  return (
    $("input[name='bid']").attr("value") ??
    ($("script")
      .map((_, element) => $(element).html() ?? "")
      .get()
      .join("\n")
      .match(/(?:rid|rc)\s*=\s*['"]?(\d+)/)?.[1])
  );
}

export class MeTruyenChuVnScraper {
  async scrapeStory(url: string): Promise<ScrapeResult<{ metadata: StoryMetadata; chapters: ChapterListItem[] }>> {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const title = cleanText($("h1[itemprop='name']").first().text()) || cleanText($("h1").first().text());
      const coverImage = absoluteUrl($(".book-info-pic img").attr("src") ?? $("meta[property='og:image']").attr("content"), url);
      const descriptionHtml = $("div[itemprop='description']").html() ?? "";
      const chapters = parseChapterLinks(html, url);

      return {
        success: true,
        data: {
          metadata: {
            title,
            author: cleanText($("a[itemprop='author']").first().text()),
            description: htmlToPlainText(descriptionHtml),
            coverImage,
            status: cleanText($(".label-status").first().text()),
            genres: $(".li--genres a")
              .map((_, element) => cleanText($(element).text()))
              .get()
              .filter(Boolean),
          },
          chapters,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Cannot scrape MeTruyenChu story",
      };
    }
  }

  async scrapeAllChapterPages(url: string, options: BulkOptions = {}): Promise<ScrapeResult<ChapterListItem[]>> {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const bookId = parseBookId($);
      const firstPageChapters = parseChapterLinks(html, url);
      const lastPage = Math.min(parseLastPage($), options.maxPages ?? 300);

      if (!bookId || lastPage <= 1) {
        return {
          success: true,
          data: firstPageChapters,
        };
      }

      const chapters = [...firstPageChapters];

      for (let page = 2; page <= lastPage; page += 1) {
        const response = await fetch(new URL(`/get/listchap/${bookId}?page=${page}`, url), {
          headers: {
            "user-agent": USER_AGENT,
          },
        });

        if (!response.ok) continue;

        const payload = (await response.json()) as { data?: string };

        if (payload.data) {
          chapters.push(...parseChapterLinks(payload.data, url));
        }
      }

      return {
        success: true,
        data: [...new Map(chapters.map((chapter) => [chapter.url, chapter])).values()].sort(
          (left, right) => left.chapterNumber - right.chapterNumber,
        ),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Cannot scrape MeTruyenChu chapters",
      };
    }
  }

  async scrapeChapter(url: string): Promise<ScrapeResult<Chapter>> {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const title = cleanText($(".current-chapter").first().text()) || cleanText($("h1").first().text());
      const content = $(".truyen").first().html()?.trim() ?? "";
      const chapterNumber = extractNumber(url) || extractNumber(title);
      const previousUrl = absoluteUrl($(".chapter_control .back:not(.disabled)").first().attr("href"), url);
      const nextUrl = absoluteUrl($(".chapter_control .next").first().attr("href"), url);

      return {
        success: true,
        data: {
          chapterNumber,
          title,
          content,
          contentText: htmlToPlainText(content),
          previousChapter: previousUrl ? { chapterNumber: Math.max(1, chapterNumber - 1), url: previousUrl } : undefined,
          nextChapter: nextUrl ? { chapterNumber: chapterNumber + 1, url: nextUrl } : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Cannot scrape MeTruyenChu chapter",
      };
    }
  }
}
