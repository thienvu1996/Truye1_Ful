"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { STORY_CATALOG } from "@/lib/story-catalog";
import {
  deleteOfflineStory,
  getOfflineChapter,
  getOfflineStories,
  getStoryIdFromPayload,
  saveOfflineChapter,
  saveOfflineStory,
  type OfflineStory,
} from "@/lib/offline-store";
import type { Chapter, ChapterListItem, StoryPayload } from "@/lib/types";

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ChapterResponse = {
  chapter: Chapter;
};

type ViewMode = "catalog" | "offline";

export default function Home() {
  const [mode, setMode] = useState<ViewMode>("catalog");
  const [url, setUrl] = useState<string>(STORY_CATALOG[0].url);
  const [story, setStory] = useState<StoryPayload | null>(null);
  const [offlineStories, setOfflineStories] = useState<OfflineStory[]>([]);
  const [activeOfflineStory, setActiveOfflineStory] = useState<OfflineStory | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("1");
  const [limit, setLimit] = useState("20");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const storyId = story ? getStoryIdFromPayload(story) : activeOfflineStory?.id;
  const chapters = story?.chapters ?? activeOfflineStory?.chapters ?? [];

  const filteredChapters = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) return chapters;

    return chapters.filter(
      (item) => item.title.toLowerCase().includes(keyword) || String(item.chapterNumber).includes(keyword),
    );
  }, [chapters, query]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    refreshOfflineStories();
  }, []);

  async function refreshOfflineStories() {
    setOfflineStories(await getOfflineStories());
  }

  async function loadStory(event?: FormEvent, nextUrl: string = url) {
    event?.preventDefault();
    setMode("catalog");
    setUrl(nextUrl);
    setError("");
    setProgress("");
    setChapter(null);
    setActiveOfflineStory(null);
    setLoading("Loading story...");

    try {
      const response = await fetch(`/api/v1/story?url=${encodeURIComponent(nextUrl)}`);
      const json = (await response.json()) as ApiResult<StoryPayload>;

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Cannot load story");
      }

      setStory(json.data);
      setFrom("1");
    } catch (err) {
      setStory(null);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading("");
    }
  }

  async function loadOnlineChapter(item: ChapterListItem) {
    if (!item.url) return;

    setError("");
    setProgress("");
    setLoading(`Loading chapter ${item.chapterNumber}...`);

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

  async function loadOfflineChapter(item: ChapterListItem) {
    if (!activeOfflineStory) return;

    setError("");
    setProgress("");
    setLoading(`Opening saved chapter ${item.chapterNumber}...`);

    try {
      const savedChapter = await getOfflineChapter(activeOfflineStory.id, item.chapterNumber);

      if (!savedChapter) {
        throw new Error("This chapter has not been saved offline yet");
      }

      setChapter(savedChapter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading("");
    }
  }

  async function saveForOffline() {
    if (!story || !storyId) return;

    const start = Math.max(1, Number(from));
    const count = Math.max(1, Math.min(200, Number(limit)));
    const selected = story.chapters.filter((item) => item.chapterNumber >= start).slice(0, count);

    setError("");
    setLoading("Saving offline...");
    setProgress(`0 / ${selected.length}`);

    try {
      await saveOfflineStory(story);

      for (let index = 0; index < selected.length; index += 1) {
        const item = selected[index];

        if (!item.url) continue;

        setProgress(`${index + 1} / ${selected.length}: ${item.title}`);

        const response = await fetch(`/api/v1/chapter?url=${encodeURIComponent(item.url)}`);
        const json = (await response.json()) as ApiResult<ChapterResponse>;

        if (response.ok && json.success && json.data) {
          await saveOfflineChapter(storyId, item.url, json.data.chapter);
        }
      }

      await refreshOfflineStories();
      setProgress(`Saved ${selected.length} chapters offline`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading("");
    }
  }

  async function openOfflineStory(savedStory: OfflineStory) {
    setMode("offline");
    setStory(null);
    setActiveOfflineStory(savedStory);
    setChapter(null);
    setQuery("");
    setError("");
    setProgress("");
  }

  async function removeOfflineStory(savedStory: OfflineStory) {
    await deleteOfflineStory(savedStory.id);
    await refreshOfflineStories();

    if (activeOfflineStory?.id === savedStory.id) {
      setActiveOfflineStory(null);
      setChapter(null);
    }
  }

  async function downloadZip() {
    const currentUrl = story?.resolvedUrl ?? activeOfflineStory?.sourceUrl;

    if (!currentUrl) return;

    setError("");
    setLoading("Building ZIP...");

    try {
      const response = await fetch("/api/v1/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: currentUrl,
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
      a.download = `${story?.metadata.title ?? activeOfflineStory?.title ?? "story"}.zip`;
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
    <main className="reader-shell">
      <aside className="sidebar-pane">
        <div className="app-mark">
          <span>StoryReader</span>
          <strong>Offline web reader</strong>
        </div>

        <div className="segmented">
          <button className={mode === "catalog" ? "active" : ""} onClick={() => setMode("catalog")} type="button">
            Browse
          </button>
          <button className={mode === "offline" ? "active" : ""} onClick={() => setMode("offline")} type="button">
            Offline
          </button>
        </div>

        {mode === "catalog" ? (
          <>
            <form className="source-form" onSubmit={loadStory}>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste story URL" />
              <button disabled={Boolean(loading)} type="submit">
                Load
              </button>
            </form>

            <div className="book-list">
              {STORY_CATALOG.map((item) => (
                <button className="book-row" key={item.id} onClick={() => loadStory(undefined, item.url)} type="button">
                  <span>{item.source}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="book-list">
            {offlineStories.length === 0 ? <p className="muted">No offline stories yet.</p> : null}
            {offlineStories.map((item) => (
              <div className="offline-row" key={item.id}>
                <button className="book-row" onClick={() => openOfflineStory(item)} type="button">
                  <span>{item.source}</span>
                  <strong>{item.title}</strong>
                </button>
                <button className="icon-button" onClick={() => removeOfflineStory(item)} title="Remove" type="button">
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {(story || activeOfflineStory) && (
          <div className="save-panel">
            <div className="mini-grid">
              <label>
                Start
                <input min="1" type="number" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label>
                Count
                <input max="200" min="1" type="number" value={limit} onChange={(event) => setLimit(event.target.value)} />
              </label>
            </div>
            <button className="wide-button" disabled={!story || Boolean(loading)} onClick={saveForOffline} type="button">
              Save offline
            </button>
            <button className="wide-button secondary" disabled={Boolean(loading)} onClick={downloadZip} type="button">
              Download ZIP
            </button>
          </div>
        )}

        {loading ? <p className="status">{loading}</p> : null}
        {progress ? <p className="status">{progress}</p> : null}
        {error ? <p className="status error">{error}</p> : null}
      </aside>

      <section className="library-pane">
        {!story && !activeOfflineStory ? (
          <div className="library-empty">Choose a story to start reading.</div>
        ) : (
          <>
            <div className="story-header">
              {(story?.metadata.coverImage || activeOfflineStory?.coverImage) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={story?.metadata.title ?? activeOfflineStory?.title ?? ""}
                  src={story?.metadata.coverImage ?? activeOfflineStory?.coverImage}
                />
              )}
              <div>
                <span className="source-pill">{story?.source ?? activeOfflineStory?.source}</span>
                <h1>{story?.metadata.title ?? activeOfflineStory?.title}</h1>
                <p>{story?.metadata.author ?? activeOfflineStory?.author ?? "Unknown author"}</p>
                <p>{chapters.length} chapters</p>
              </div>
            </div>

            <div className="chapter-toolbar">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters" />
            </div>

            <div className="chapter-list">
              {filteredChapters.map((item) => (
                <button
                  className={chapter?.chapterNumber === item.chapterNumber ? "active" : ""}
                  key={`${item.chapterNumber}-${item.url}`}
                  onClick={() => (mode === "offline" ? loadOfflineChapter(item) : loadOnlineChapter(item))}
                  type="button"
                >
                  <span>{item.chapterNumber}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <article className="reading-pane">
        {!chapter ? (
          <div className="reading-empty">Open a chapter to read here.</div>
        ) : (
          <>
            <header>
              <span>Chapter {chapter.chapterNumber}</span>
              <h2>{chapter.title}</h2>
            </header>
            <div className="reading-content">{chapter.contentText || chapter.content}</div>
          </>
        )}
      </article>
    </main>
  );
}
