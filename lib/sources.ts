import { TruyenFullScraper, getScraperByURL } from "@duyquangnvx/story-scraper";
import { MeTruyenChuVnScraper } from "@/lib/custom-scrapers/metruyenchuvn";
import { getSourceConfig, saveSourceConfig } from "@/lib/source-config-store";

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
  metruyenchuvn: {
    name: "metruyenchuvn",
    label: "MeTruyenChuVN",
    domains: ["https://metruyenchuvn.com"],
  },
} as const;

export type SupportedSource = keyof typeof SOURCES;

const DEFAULT_TIMEOUT_MS = 12000;
const DOMAIN_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";

type SourceHealth = {
  activeDomain?: string;
  lastCheckedAt?: string;
  redirectedFrom?: string;
};

const sourceHealth: Record<SupportedSource, SourceHealth> = {
  truyenfull: {},
  metruyenchuvn: {},
};

async function hydrateSourceHealth(source: SupportedSource) {
  try {
    const config = await getSourceConfig(source);

    if (!config) return;

    sourceHealth[source] = {
      activeDomain: config.activeDomain,
      lastCheckedAt: config.lastCheckedAt,
      redirectedFrom: config.redirectedFrom,
    };
  } catch {
    // Mongo is optional for local/dev runs; resolver keeps working with memory cache.
  }
}

async function persistSourceHealth(source: SupportedSource) {
  try {
    await saveSourceConfig(source, {
      ...sourceHealth[source],
      domains: [...SOURCES[source].domains],
    });
  } catch {
    // Keep scrape flow alive even if config persistence is temporarily unavailable.
  }
}

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
        "user-agent": USER_AGENT,
      },
    });

    return {
      ok: response.ok,
      finalUrl: response.url,
    };
  } catch {
    return {
      ok: false,
      finalUrl: url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function uniqueDomains(source: SupportedSource) {
  const activeDomain = sourceHealth[source].activeDomain;
  const domains = activeDomain
    ? [activeDomain, ...SOURCES[source].domains]
    : [...SOURCES[source].domains];

  return [...new Set(domains)];
}

function isCheckFresh(source: SupportedSource) {
  const checkedAt = sourceHealth[source].lastCheckedAt;

  if (!checkedAt) return false;

  return Date.now() - new Date(checkedAt).getTime() < DOMAIN_CHECK_INTERVAL_MS;
}

function getOrigin(url: string) {
  const parsed = new URL(url);
  return parsed.origin;
}

function canTrustRedirect(source: SupportedSource, originalDomain: string, finalUrl: string) {
  const originalHost = new URL(originalDomain).hostname.replace(/^www\./, "");
  const finalHost = new URL(finalUrl).hostname.replace(/^www\./, "");

  if (originalHost === finalHost) return true;

  if (source === "truyenfull" || source === "metruyenchuvn") {
    return SOURCES[source].domains.some((domain) => {
      const configuredHost = new URL(domain).hostname.replace(/^www\./, "");
      const root = configuredHost.split(".").slice(-2).join(".");
      return finalHost === configuredHost || finalHost.endsWith(`.${root}`) || finalHost.includes(root.split(".")[0]);
    });
  }

  return false;
}

export async function checkSourceDomain(source: SupportedSource = "truyenfull") {
  await hydrateSourceHealth(source);

  for (const domain of uniqueDomains(source)) {
    const healthUrl = `${domain}/`;
    const result = await probeUrl(healthUrl);

    if (!result.ok || !canTrustRedirect(source, domain, result.finalUrl)) {
      continue;
    }

    const finalOrigin = getOrigin(result.finalUrl);
    sourceHealth[source] = {
      activeDomain: finalOrigin,
      lastCheckedAt: new Date().toISOString(),
      redirectedFrom: finalOrigin === domain ? undefined : domain,
    };
    await persistSourceHealth(source);

    return {
      source,
      ...sourceHealth[source],
      domains: SOURCES[source].domains,
    };
  }

  sourceHealth[source] = {
    ...sourceHealth[source],
    lastCheckedAt: new Date().toISOString(),
  };
  await persistSourceHealth(source);

  throw new Error(`No working ${SOURCES[source].label} domain found`);
}

export async function getSourceHealth(source: SupportedSource = "truyenfull") {
  await hydrateSourceHealth(source);

  if (!isCheckFresh(source)) {
    return checkSourceDomain(source);
  }

  return {
    source,
    ...sourceHealth[source],
    domains: SOURCES[source].domains,
  };
}

export async function resolveSourceUrl(input: string, sourceName?: SupportedSource) {
  const source = sourceName ?? detectSource(input);
  const sourcePath = normalizePath(input);

  await hydrateSourceHealth(source);

  if (!isCheckFresh(source)) {
    await checkSourceDomain(source);
  }

  for (const domain of uniqueDomains(source)) {
    const url = `${domain}${sourcePath}`;
    const result = await probeUrl(url);

    if (result.ok && canTrustRedirect(source, domain, result.finalUrl)) {
      const finalOrigin = getOrigin(result.finalUrl);
      sourceHealth[source] = {
        activeDomain: finalOrigin,
        lastCheckedAt: new Date().toISOString(),
        redirectedFrom: finalOrigin === domain ? undefined : domain,
      };
      await persistSourceHealth(source);

      return {
        source,
        sourcePath,
        url: result.finalUrl,
      };
    }
  }

  throw new Error(`No working ${SOURCES[source].label} domain found for ${sourcePath}`);
}

export function getScraper(url: string) {
  const options = {
    delay: 800,
    timeout: 30000,
    maxRetries: 2,
    userAgent: USER_AGENT,
  };
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const scraper = hostname.includes("truyenfull")
    ? new TruyenFullScraper(options)
    : hostname.includes("metruyenchuvn")
      ? new MeTruyenChuVnScraper()
    : getScraperByURL(url, options);

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
