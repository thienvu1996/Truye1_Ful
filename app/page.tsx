"use client";

import { FormEvent, useState } from "react";
import { STORY_CATALOG } from "@/lib/story-catalog";
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

export default function Home() {
  const [url, setUrl] = useState<string>(STORY_CATALOG[0].url);
  const [from, setFrom] = useState("1");
  const [limit, setLimit] = useState("20");
  const [story, setStory] = useState<StoryPayload | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function loadStory(event?: FormEvent, nextUrl: string = url) {
    event?.preventDefault();
    setUrl(nextUrl);
    setError("");
    setChapter(null);
    setLoading("Loading story metadata and chapter list...");

    try {
      const response = await fetch(`/api/v1/story?url=${encodeURIComponent(nextUrl)}`);
      const json = (await response.json()) as ApiResult<StoryPayload>;

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Cannot load story");
      }

      setStory(json.data);
    } catch (err) {
      setStory(null);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading("");
    }
  }

  async function loadChapter(item: ChapterListItem) {
    if (!item.url) return;

    setError("");
    setLoading(`Loading ${item.title}...`);

    try {
      const response = await fetch(`/api/v1/chapter?url=${encodeURIComponent(item.url)}`);
      const json = (await response.json()) as ApiResult<ChapterResponse>;

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Cannot load chapter");
      }

      setChapter(json.data.chapter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading("");
    }
  }

  async function downloadZip() {
    setError("");
    setLoading("Scraping chapters and building ZIP...");

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
        throw new Error(json.error ?? "Cannot download ZIP");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${story?.metadata.title ?? "story"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading("");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>Story Scraper</h1>
          <span>Pick a story from supported sources, read live, or download chapters to the user's device.</span>
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Story sources</h2>
          <div className="catalog">
            {STORY_CATALOG.map((item) => (
              <button
                className={`catalog-item ${url === item.url ? "active" : ""}`}
                key={item.id}
                onClick={() => loadStory(undefined, item.url)}
                type="button"
              >
                <span>{item.source}</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>

          <h2 className="section-title">Manual URL</h2>
          <form onSubmit={loadStory}>
            <div className="field">
              <label htmlFor="url">Current source URL</label>
              <input
                id="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://metruyenchuvn.com/story-slug"
              />
            </div>

            <div className="actions">
              <button className="button" disabled={Boolean(loading)} type="submit">
                View story
              </button>
              <button
                className="button secondary"
                disabled={!story || Boolean(loading)}
                onClick={downloadZip}
                type="button"
              >
                Download ZIP
              </button>
            </div>
          </form>

          <div className="download-grid">
            <div className="field">
              <label htmlFor="from">Start chapter</label>
              <input id="from" min="1" type="number" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="limit">Chapters per download, max 200</label>
              <input
                id="limit"
                min="1"
                max="200"
                type="number"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </div>
          </div>

          {loading ? <div className="status">{loading}</div> : null}
          {error ? <div className="status error">{error}</div> : null}

          <div className="status">
            API: <code>/api/v1/story</code>, <code>/api/v1/chapter</code>, <code>/api/v1/download</code>
          </div>
        </section>

        <section className="panel">
          {!story ? (
            <div className="empty-state">Choose a preset story or paste a supported story URL.</div>
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
                    <span>{story.source}</span>
                    <span>{story.metadata.author || "Unknown author"}</span>
                    <span>{story.metadata.status || "Unknown status"}</span>
                    <span>{story.chapters.length} chapters</span>
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
