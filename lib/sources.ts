import { getScraperByURL } from "@duyquangnvx/story-scraper";

export const SOURCES = {
  truyenfull: {
    name: "truyenfull",
    label: "TruyenFull",
    domains: [
      "https://truyenfull.vision",
      "https://truyenfull.vn",
      "https://truyenfull.com",
    ],
  },
} as const;

export type SupportedSource = keyof typeof SOURCES;

const DEFAULT_TIMEOUT_MS = 12000;

export function normalizePath(input: string) {
  const value = input.trim();

  if (!value) {
    throw new Error("Missing URL or path");
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  }

  return value.startsWith("/") ? value : `/${value}`;
}

export function detectSource(input: string): SupportedSource {
  const value = input.trim();

  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return "truyenfull";
  }

  const hostname = new URL(value).hostname.replace(/^www\./, "");
  const found = Object.entries(SOURCES).find(([, source]) =>
    source.domains.some((domain) => new URL(domain).hostname.replace(/^www\./, "") === hostname),
  );

  if (!found) {
    throw new Error(`Unsupported source domain: ${hostname}`);
  }

  return found[0] as SupportedSource;
}

async function probeUrl(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      },
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveSourceUrl(input: string, sourceName?: SupportedSource) {
  const source = sourceName ?? detectSource(input);
  const sourcePath = normalizePath(input);

  for (const domain of SOURCES[source].domains) {
    const url = `${domain}${sourcePath}`;

    if (await probeUrl(url)) {
      return {
        source,
        sourcePath,
        url,
      };
    }
  }

  throw new Error(`No working ${SOURCES[source].label} domain found for ${sourcePath}`);
}

export function getScraper(url: string) {
  const scraper = getScraperByURL(url, {
    delay: 800,
    timeout: 30000,
    maxRetries: 2,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
  });

  if (!scraper) {
    throw new Error(`No scraper registered for URL: ${url}`);
  }

  return scraper;
}

export function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 90);
}
