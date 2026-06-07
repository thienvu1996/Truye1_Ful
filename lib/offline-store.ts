"use client";

import type { Chapter, ChapterListItem, StoryPayload } from "@/lib/types";

const DB_NAME = "story-reader-offline";
const DB_VERSION = 1;
const STORIES_STORE = "stories";
const CHAPTERS_STORE = "chapters";

export type OfflineStory = {
  id: string;
  title: string;
  author?: string;
  coverImage?: string;
  source: string;
  sourceUrl: string;
  chapters: ChapterListItem[];
  savedAt: string;
};

export type OfflineChapter = Chapter & {
  storyId: string;
  sourceUrl: string;
  savedAt: string;
};

function storyIdFromUrl(url: string) {
  return `story:${url}`;
}

function chapterId(storyId: string, chapterNumber: number) {
  return `${storyId}:chapter:${chapterNumber}`;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORIES_STORE)) {
        db.createObjectStore(STORIES_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
        const chapters = db.createObjectStore(CHAPTERS_STORE, { keyPath: "id" });
        chapters.createIndex("storyId", "storyId", { unique: false });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function promisify<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export function getStoryIdFromPayload(story: StoryPayload) {
  return storyIdFromUrl(story.resolvedUrl);
}

export async function saveOfflineStory(story: StoryPayload) {
  const db = await openDb();
  const tx = db.transaction(STORIES_STORE, "readwrite");
  const savedStory: OfflineStory = {
    id: getStoryIdFromPayload(story),
    title: story.metadata.title,
    author: story.metadata.author,
    coverImage: story.metadata.coverImage,
    source: story.source,
    sourceUrl: story.resolvedUrl,
    chapters: story.chapters,
    savedAt: new Date().toISOString(),
  };

  tx.objectStore(STORIES_STORE).put(savedStory);
  await promisify(tx.objectStore(STORIES_STORE).get(savedStory.id));
  db.close();
  return savedStory;
}

export async function saveOfflineChapter(storyId: string, sourceUrl: string, chapter: Chapter) {
  const db = await openDb();
  const tx = db.transaction(CHAPTERS_STORE, "readwrite");
  const savedChapter: OfflineChapter & { id: string } = {
    ...chapter,
    id: chapterId(storyId, chapter.chapterNumber),
    storyId,
    sourceUrl,
    savedAt: new Date().toISOString(),
  };

  tx.objectStore(CHAPTERS_STORE).put(savedChapter);
  await promisify(tx.objectStore(CHAPTERS_STORE).get(savedChapter.id));
  db.close();
  return savedChapter;
}

export async function getOfflineStories() {
  const db = await openDb();
  const stories = await promisify(db.transaction(STORIES_STORE).objectStore(STORIES_STORE).getAll());
  db.close();
  return stories as OfflineStory[];
}

export async function getOfflineChapter(storyId: string, chapterNumber: number) {
  const db = await openDb();
  const chapter = await promisify(
    db.transaction(CHAPTERS_STORE).objectStore(CHAPTERS_STORE).get(chapterId(storyId, chapterNumber)),
  );
  db.close();
  return chapter as (OfflineChapter & { id: string }) | undefined;
}

export async function deleteOfflineStory(storyId: string) {
  const db = await openDb();
  const tx = db.transaction([STORIES_STORE, CHAPTERS_STORE], "readwrite");
  tx.objectStore(STORIES_STORE).delete(storyId);

  const chapterIndex = tx.objectStore(CHAPTERS_STORE).index("storyId");
  const chapters = await promisify(chapterIndex.getAllKeys(storyId));

  for (const key of chapters) {
    tx.objectStore(CHAPTERS_STORE).delete(key);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}
