"use client";

import { FormEvent, useState } from "react";
import type { Chapter, ChapterListItem, StoryPayload } from "@/lib/types";

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ChapterResponse = {
  source: string;
  resolvedUrl: string;
  sourcePath: string;
  chapter: Chapter;
};

const SAMPLE_URL = "https://truyenfull.vision/";

export default function Home() {
  const [url, setUrl] = useState(SAMPLE_URL);
  const [from, setFrom] = useState("1");
  const [limit, setLimit] = useState("20");
  const [story, setStory] = useState<StoryPayload | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function loadStory(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    setChapter(null);
    setLoading("Đang lấy metadata và danh sách chương...");

    try {
      const response = await fetch(`/api/v1/story?url=${encodeURIComponent(url)}`);
      const json = (await response.json()) as ApiResult<StoryPayload>;

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Không lấy được truyện");
      }

      setStory(json.data);
    } catch (err) {
      setStory(null);
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoading("");
    }
  }

  async function loadChapter(item: ChapterListItem) {
    if (!item.url) return;

    setError("");
    setLoading(`Đang lấy ${item.title}...`);

    try {
      const response = await fetch(`/api/v1/chapter?url=${encodeURIComponent(item.url)}`);
      const json = (await response.json()) as ApiResult<ChapterResponse>;

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Không lấy được chương");
      }

      setChapter(json.data.chapter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoading("");
    }
  }

  async function downloadZip() {
    setError("");
    setLoading("Đang scrape và đóng gói ZIP...");

    try {
      const response = await fetch("/api/v1/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          from: Number(from),
          limit: Number(limit),
        }),
      });

      if (!response.ok) {
        const json = (await response.json()) as ApiResult<never>;
        throw new Error(json.error ?? "Không tải được ZIP");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${story?.metadata.title ?? "truyen"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoading("");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>TruyenFull Scraper</h1>
          <span>API trung gian: resolve domain, scrape live, tải ZIP về máy user.</span>
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Nguồn truyện</h2>
          <form onSubmit={loadStory}>
            <div className="field">
              <label htmlFor="url">URL hoặc path TruyenFull</label>
              <input
                id="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://truyenfull.vision/ten-truyen/"
              />
            </div>

            <div className="actions">
              <button className="button" disabled={Boolean(loading)} type="submit">
                Lấy truyện
              </button>
              <button
                className="button secondary"
                disabled={!story || Boolean(loading)}
                onClick={downloadZip}
                type="button"
              >
                Tải ZIP
              </button>
            </div>
          </form>

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="from">Tải từ chương</label>
            <input id="from" min="1" type="number" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="limit">Số chương mỗi lần tải, tối đa 200</label>
            <input
              id="limit"
              min="1"
              max="200"
              type="number"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </div>

          {loading ? <div className="status">{loading}</div> : null}
          {error ? <div className="status error">{error}</div> : null}

          <div className="status">
            API: <code>/api/v1/story</code>, <code>/api/v1/chapter</code>, <code>/api/v1/download</code>
          </div>
        </section>

        <section className="panel">
          {!story ? (
            <div className="status">Nhập URL truyện cụ thể rồi bấm lấy truyện.</div>
          ) : (
            <>
              <div className="story">
                {story.metadata.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={story.metadata.title} className="cover" src={story.metadata.coverImage} />
                ) : (
                  <div className="cover" />
                )}

                <div>
                  <h2>{story.metadata.title}</h2>
                  <div className="meta">
                    <span>{story.metadata.author || "Không rõ tác giả"}</span>
                    <span>{story.metadata.status || "Không rõ trạng thái"}</span>
                    <span>{story.chapters.length} chương</span>
                  </div>
                  <div className="description">{story.metadata.description}</div>
                </div>
              </div>

              <div className="chapters">
                {story.chapters.map((item) => (
                  <button className="chapter" key={`${item.chapterNumber}-${item.url}`} onClick={() => loadChapter(item)}>
                    {item.chapterNumber}. {item.title}
                  </button>
                ))}
              </div>

              {chapter ? (
                <article className="reader">
                  <h3>
                    {chapter.chapterNumber}. {chapter.title}
                  </h3>
                  <div className="content">{chapter.contentText || chapter.content}</div>
                </article>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
