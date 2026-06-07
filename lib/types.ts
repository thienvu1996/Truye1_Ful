export type SourceName = "truyenfull" | "metruyenchuvn";

export type StoryMetadata = {
  title: string;
  author: string;
  description: string;
  coverImage?: string;
  status?: string;
  genres?: string[];
  tags?: string[];
  rating?: number;
  views?: number;
};

export type ChapterListItem = {
  chapterNumber: number;
  title: string;
  url?: string;
  id?: string;
};

export type Chapter = {
  chapterNumber: number;
  title: string;
  content: string;
  contentText: string;
  previousChapter?: {
    chapterNumber: number;
    url?: string;
  };
  nextChapter?: {
    chapterNumber: number;
    url?: string;
  };
};

export type StoryPayload = {
  source: SourceName;
  resolvedUrl: string;
  sourcePath: string;
  metadata: StoryMetadata;
  chapters: ChapterListItem[];
};
