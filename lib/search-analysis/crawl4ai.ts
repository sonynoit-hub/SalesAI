import type { CrawledPage } from "@/lib/search-analysis/types";
import type { SearxngResult } from "@/lib/search-analysis/search";

type Crawl4AiMarkdown =
  | string
  | {
      markdown?: string;
      raw_markdown?: string;
      fit_markdown?: string;
      markdown_with_citations?: string;
      references_markdown?: string;
    };

type Crawl4AiResult = {
  url?: string;
  title?: string;
  success?: boolean;
  error_message?: string;
  markdown?: Crawl4AiMarkdown;
  cleaned_html?: string;
};

type Crawl4AiResponse = {
  success?: boolean;
  results?: Crawl4AiResult[];
};

export type CrawlCandidatePagesResult = {
  pages: CrawledPage[];
  diagnostics: {
    attempted: number;
    succeeded: number;
    failed: number;
    filtered: number;
    error?: string;
  };
};

const DEFAULT_CRAWL_LIMIT = 8;
const CONTENT_LIMIT = 4_000;

export async function crawlCandidatePages(
  searchResults: SearxngResult[],
  options?: {
    limit?: number;
  },
) {
  const result = await crawlCandidatePagesWithDiagnostics(searchResults, options);
  return result.pages;
}

export async function crawlCandidatePagesWithDiagnostics(
  searchResults: SearxngResult[],
  options?: {
    limit?: number;
  },
): Promise<CrawlCandidatePagesResult> {
  const baseUrl = process.env.CRAWL4AI_URL;
  const apiToken = process.env.CRAWL4AI_API_TOKEN;

  if (!baseUrl) {
    return emptyCrawlResult("CRAWL4AI_URL is not configured.");
  }

  const urls = searchResults
    .map((result) => result.url)
    .filter((url): url is string => Boolean(url))
    .slice(0, normalizeCrawlLimit(options?.limit));

  if (urls.length === 0) {
    return emptyCrawlResult("No candidate URLs were available to crawl.");
  }

  try {
    const response = await fetch(new URL("/crawl", baseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
      },
      body: JSON.stringify({
        urls,
        browser_config: {
          headless: true,
        },
        crawler_config: {
          word_count_threshold: 20,
          page_timeout: readTimeout("CRAWL4AI_PAGE_TIMEOUT_MS", 30_000),
          excluded_tags: ["script", "style", "nav", "footer"],
        },
      }),
      signal: AbortSignal.timeout(readTimeout("CRAWL4AI_TIMEOUT_MS", 60_000)),
    });

    if (!response.ok) {
      return emptyCrawlResult(`Crawl4AI returned HTTP ${response.status}.`, urls.length);
    }

    const data = (await response.json()) as Crawl4AiResponse;
    const crawledPages = (data.results ?? []).map(toCrawledPage);
    const pages = crawledPages.filter(hasUsefulContent);

    return {
      pages,
      diagnostics: {
        attempted: urls.length,
        succeeded: pages.length,
        failed: crawledPages.filter((page) => !page.success).length,
        filtered: crawledPages.filter((page) => page.success).length - pages.length,
      },
    };
  } catch {
    return emptyCrawlResult("Crawl4AI request failed or timed out.", urls.length);
  }
}

function toCrawledPage(result: Crawl4AiResult): CrawledPage {
  return {
    url: result.url ?? "",
    title: result.title,
    content: normalizeContent(readMarkdown(result.markdown) ?? result.cleaned_html ?? ""),
    success: result.success ?? false,
    error: result.error_message,
  };
}

function readMarkdown(markdown: Crawl4AiMarkdown | undefined) {
  if (typeof markdown === "string") {
    return markdown;
  }

  return firstUsefulText([
    markdown?.markdown,
    markdown?.fit_markdown,
    markdown?.raw_markdown,
    markdown?.markdown_with_citations,
    markdown?.references_markdown,
  ]);
}

function normalizeContent(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, CONTENT_LIMIT);
}

function hasUsefulContent(page: CrawledPage) {
  return page.success && page.url && page.content.length >= 80;
}

function normalizeCrawlLimit(value: number | undefined) {
  return Math.max(1, Math.min(60, value ?? DEFAULT_CRAWL_LIMIT));
}

function readTimeout(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function firstUsefulText(values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0) ?? "";
}

function emptyCrawlResult(
  error: string,
  attempted = 0,
): CrawlCandidatePagesResult {
  return {
    pages: [],
    diagnostics: {
      attempted,
      succeeded: 0,
      failed: 0,
      filtered: 0,
      error,
    },
  };
}
