import type {
  CrawledPage,
  OpportunitySearchPlan,
  ResultEvidence,
  SearchIntent,
} from "@/lib/search-analysis/types";
import {
  DEFAULT_TARGET_COMPANY_COUNT,
  MAX_TARGET_COMPANY_COUNT,
} from "@/lib/search-analysis/constants";

export type SearxngResult = {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  aboutUrl?: string;
  evidence?: ResultEvidence;
};

type SearxngResponse = {
  results?: SearxngResult[];
  unresponsive_engines?: unknown[];
};

export type SearchPipelineResult = {
  results: SearxngResult[];
  candidateNames: string[];
  officialLookupQueries: string[];
  diagnostics: {
    rawResults: number;
    officialCandidates: number;
  };
};

export type SearchRefinementResult = {
  results: SearxngResult[];
  diagnostics: {
    passedEvidence: number;
    removedByEvidence: number;
  };
};

const SEARCH_PAGES_PER_QUERY = 5;

export function buildSearchQueries({
  industry,
  location,
  searchPlan,
}: {
  industry: string;
  location: string;
  searchPlan: OpportunitySearchPlan;
}) {
  return buildIntentSearchQueries(searchPlan.searchIntent, {
    fallbackIndustry: industry,
    fallbackLocation: location,
    keywordScript: buildKeywordScriptQuery(searchPlan),
  });
}

export async function searchSearxng(query: string, page = 1) {
  const baseUrl = process.env.SEARXNG_URL ?? "http://127.0.0.1:8080";
  const preferredResults = await searchSearxngOnce({
    baseUrl,
    query,
    page,
    enabledEngines: ["google"],
  }).catch(() => []);

  const fallbackResults = await searchSearxngOnce({
    baseUrl,
    query,
    page,
  });

  return dedupeSearchResults([...preferredResults, ...fallbackResults]);
}

async function searchSearxngOnce({
  baseUrl,
  query,
  page,
  enabledEngines,
}: {
  baseUrl: string;
  query: string;
  page: number;
  enabledEngines?: string[];
}) {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", hasJapaneseText(query) ? "ja" : "auto");
  if (page > 1) {
    url.searchParams.set("pageno", String(page));
  }
  if (enabledEngines?.length) {
    url.searchParams.set("enabled_engines", enabledEngines.join(","));
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(readTimeout("SEARXNG_TIMEOUT_MS", 12_000)),
  });

  if (!response.ok) {
    throw new Error(`SearXNG search failed with ${response.status}`);
  }

  const data = (await response.json()) as SearxngResponse;

  return data.results ?? [];
}

export async function runSearchQueries(
  queries: string[],
  request?: {
    location?: string;
    opportunityDescription?: string;
    searchPlan?: OpportunitySearchPlan;
  },
) {
  const pipeline = await runSearchPipeline(queries, request);
  return pipeline.results;
}

export async function runSearchPipeline(
  queries: string[],
  request?: {
    location?: string;
    opportunityDescription?: string;
    resultLimit?: number;
    searchPlan?: OpportunitySearchPlan;
  },
): Promise<SearchPipelineResult> {
  const settled = await collectSearchResults(queries, searchPageCount(request?.resultLimit));
  const failed = settled.filter((result) => result.status === "rejected");
  const results = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (results.length === 0 && failed.length === settled.length) {
    const firstFailure = failed[0];
    throw new Error(
      firstFailure?.status === "rejected" && firstFailure.reason instanceof Error
        ? firstFailure.reason.message
        : "Search failed before any company results were returned.",
    );
  }

  const seen = new Set<string>();
  const targetsJapan = isJapanLocation(request?.location ?? "");
  const locationProfile = getLocationSearchProfile(request?.location ?? "");

  const firstPass = selectOfficialCompanyResults(results, {
    locationProfile,
    request,
    seen,
    targetsJapan,
  });

  const seedNames = extractSeedCompanyNames(results).slice(
    0,
    normalizeResultLimit(request?.resultLimit) * 2,
  );
  const seedQueries = buildOfficialLookupQueries(seedNames, request).slice(
    0,
    normalizeResultLimit(request?.resultLimit) * 5,
  );
  const seedSettled = await Promise.allSettled(
    seedQueries.map((query) => searchSearxng(query)),
  );
  const seedResults = seedSettled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  const officialResults = selectOfficialCompanyResults(seedResults, {
      locationProfile,
      request,
      seen,
      targetsJapan,
    });

  return {
    results: [...firstPass, ...officialResults].slice(
      0,
      candidateLimit(request?.resultLimit),
    ),
    candidateNames: seedNames,
    diagnostics: {
      rawResults: results.length + seedResults.length,
      officialCandidates: firstPass.length + officialResults.length,
    },
    officialLookupQueries: seedQueries,
  };
}

async function collectSearchResults(queries: string[], pageCount: number) {
  const settled: PromiseSettledResult<SearxngResult[]>[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const pageSettled = await Promise.allSettled(
      queries.map((query) => searchSearxng(query, page)),
    );
    settled.push(...pageSettled);
  }

  return settled;
}

export function refineSearchResultsWithEvidence({
  crawledPages,
  request,
  results,
}: {
  crawledPages: CrawledPage[];
  request?: {
    location?: string;
    opportunityDescription?: string;
    resultLimit?: number;
    searchPlan?: OpportunitySearchPlan;
  };
  results: SearxngResult[];
}): SearchRefinementResult {
  const targetsJapan = isJapanLocation(request?.location ?? "");
  const limit = refinedCandidateLimit(request?.resultLimit);

  const companyResults = results
    .filter((result) => result.url && result.title)
    .map((result) => toStrictCompanyHomepageResult(result))
    .filter((result): result is SearxngResult => Boolean(result))
    .map((result) => {
      const crawledPage = crawledPages.find((page) => page.url === result.url);
      const evidenceResult = crawledPage
        ? {
            ...result,
            title: `${result.title ?? ""} ${crawledPage.title ?? ""}`.trim(),
            content: `${result.content ?? ""} ${crawledPage.content}`.trim(),
          }
        : result;

      return {
        ...result,
        evidence: evaluateResultEvidence(evidenceResult, request, targetsJapan),
      };
    })
    .filter(createUniqueCompanyFilter());

  const refinedResults = companyResults.slice(0, limit);

  return {
    results: refinedResults,
    diagnostics: {
      passedEvidence: refinedResults.length,
      removedByEvidence: Math.max(0, results.length - companyResults.length),
    },
  };
}

function selectOfficialCompanyResults(
  results: SearxngResult[],
  {
    locationProfile,
    request,
    seen,
    targetsJapan,
  }: {
    locationProfile: LocationSearchProfile | null;
    request?: {
      location?: string;
      opportunityDescription?: string;
      resultLimit?: number;
      searchPlan?: OpportunitySearchPlan;
    };
    seen: Set<string>;
    targetsJapan: boolean;
  },
) {
  return results
    .filter((result) => result.url && result.title)
    .map((result) => toStrictCompanyHomepageResult(result))
    .filter((result): result is SearxngResult => Boolean(result))
    .filter((result) => !locationProfile || isLocationRelevantResult(result, locationProfile))
    .map((result) => ({
      ...result,
      evidence: evaluateResultEvidence(result, request, targetsJapan),
    }))
    .filter((result) => {
      const key = normalizeCompanyKey(result.url ?? "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, candidateLimit(request?.resultLimit));
}

function normalizeResultLimit(value: number | undefined) {
  return Math.max(1, Math.min(MAX_TARGET_COMPANY_COUNT, value ?? DEFAULT_TARGET_COMPANY_COUNT));
}

function candidateLimit(value: number | undefined) {
  return Math.max(15, normalizeResultLimit(value) * 8);
}

function refinedCandidateLimit(value: number | undefined) {
  return Math.max(15, normalizeResultLimit(value) * 3);
}

function searchPageCount(value: number | undefined) {
  if (normalizeResultLimit(value) <= 5) return 1;
  if (normalizeResultLimit(value) <= 15) return 2;
  if (normalizeResultLimit(value) <= 30) return 3;
  if (normalizeResultLimit(value) <= 60) return 4;
  return SEARCH_PAGES_PER_QUERY;
}

function dedupeSearchResults(results: SearxngResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = normalizeCompanyKey(result.url ?? "") || `${result.title ?? ""}|${result.content ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createUniqueCompanyFilter() {
  const seenKeys = new Set<string>();
  const seenNames = new Set<string>();

  return (result: SearxngResult) => {
    const key = normalizeCompanyKey(result.url ?? "");
    const name = normalizeResultCompanyName(result);

    if (!key || seenKeys.has(key) || (name && seenNames.has(name))) {
      return false;
    }

    seenKeys.add(key);
    if (name) seenNames.add(name);
    return true;
  };
}

function normalizeResultCompanyName(result: SearxngResult) {
  const title = result.title ?? "";
  const hostname = safeUrl(result.url ?? "")?.hostname.replace(/^www\./, "") ?? "";
  const firstTitlePart = title
    .replace(/\b(about us|company profile|corporate profile|official website|home)\b/gi, "")
    .replace(/会社概要|企業情報|公式サイト/g, "")
    .split(/\s*[|｜\-–—:：]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .find(Boolean);

  return normalizeCompanyNameKey(firstTitlePart || hostname);
}

function normalizeCompanyNameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|inc\.?|corp\.?|corporation|co\.?,?\s*ltd\.?|company limited|株式会社|ホールディングス|holdings/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "")
    .trim();
}

function isUsefulCompanyCandidate(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    const pathname = url.pathname.toLowerCase();
    const blockedHosts = [
      "amazon.co.jp",
      "apollo.io",
      "baseconnect.in",
      "biz.ne.jp",
      "blogspot.com",
      "bloomberg.com",
      "businesswire.com",
      "cbinsights.com",
      "clutch.co",
      "company-list.jp",
      "companieshouse.vn",
      "compalyze.co.jp",
      "craft.co",
      "doda.jp",
      "en-gage.net",
      "indeed.com",
      "indeed.jp",
      "j-goodtech.smrj.go.jp",
      "jgoodtech.smrj.go.jp",
      "japan.ahk.de",
      "job.mynavi.jp",
      "jp.indeed.com",
      "google.com",
      "info-clipper.com",
      "instagram.com",
      "ipros.com",
      "mynavi.jp",
      "nikkeibp.co.jp",
      "note.com",
      "prtimes.jp",
      "reddit.com",
      "rikunabi.com",
      "salesnow.jp",
      "softwareoutsourcing.com",
      "startup-db.com",
      "zaico.co.jp",
      "wantedly.com",
      "wikipedia.org",
      "tiktok.com",
      "youtube.com",
      "facebook.com",
      "manufacturing.com.vn",
      "linkedin.com",
      "x.com",
      "twitter.com",
      "jbic.go.jp",
      "jetro.go.jp",
      "meti.go.jp",
      "vietfactory.com",
      "vietnammanufacturer.vn",
      "vietnammanufacturers.vn",
      "vietnam.travel",
      "volza.com",
      "enosisoutsourcing.com",
    ];

    if (isBlockedCompanyHost(hostname, blockedHosts)) {
      return false;
    }

    if (pathname.endsWith(".pdf")) {
      return false;
    }

    if (isLowIntentPath(pathname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function toStrictCompanyHomepageResult(result: SearxngResult): SearxngResult | null {
  if (!result.url || !isUsefulCompanyCandidate(result.url)) {
    return null;
  }

  if (isGenericNonCompanyResult(result)) {
    return null;
  }

  const url = safeUrl(result.url);

  if (!url || !["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  const path = decodePathname(url.pathname);
  const urlType = resolveUrlType(path);

  if (urlType === "other") {
    return null;
  }

  const homepageUrl = new URL("/", url.origin).toString();
  const originalUrl = url.toString();

  return {
    ...result,
    url: homepageUrl,
    aboutUrl: homepageUrl === originalUrl ? result.aboutUrl : originalUrl,
  };
}

function isBlockedCompanyHost(hostname: string, blockedHosts: string[]) {
  const blockedSuffixes = [
    ".edu",
    ".edu.vn",
    ".go.jp",
    ".gov",
    ".gov.vn",
    ".gouv.fr",
    ".lg.jp",
    ".mil",
    ".org",
  ];
  const blockedHostTerms = [
    "blog",
    "career",
    "careers",
    "directory",
    "event",
    "events",
    "government",
    "jobs",
    "magazine",
    "marketplace",
    "media",
    "news",
    "portal",
    "press",
    "recruit",
    "wiki",
  ];

  return (
    blockedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ||
    blockedSuffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix)) ||
    blockedHostTerms.some((term) => hostname.split(".").includes(term))
  );
}

function isLowIntentPath(pathname: string) {
  const decodedPathname = decodePathname(pathname);

  return [
    "/news/",
    "/blog/",
    "/blogs/",
    "_blog/",
    "/column/",
    "/columns/",
    "/contents/",
    "/content/",
    "/case/",
    "/cases/",
    "/campaign/",
    "/interview/",
    "/lp/",
    "/marketing/",
    "/seminar/",
    "/event/",
    "/article/",
    "/articles/",
    "/recruit/",
    "/recruitment/",
    "/jobs/",
    "/job/",
    "/career/",
    "/careers/",
  ].some((part) => decodedPathname.includes(part));
}

function isGenericNonCompanyResult(result: SearxngResult) {
  const title = result.title ?? "";
  const content = result.content ?? "";
  const hostname = safeUrl(result.url ?? "")?.hostname.replace(/^www\./, "") ?? "";
  const text = `${title} ${content} ${hostname}`;

  return /とは|解説|まとめ|ランキング|一覧|比較|ニュース|セミナー|ブログ|コラム|求人|採用|調査レポート|政府|行政|省庁|ポータル|方法|活用する方法|人材|派遣|アウトソーシング|directory|government|marketplace|platform|portal|public sector|suppliers?|buyers?|sourcing team|industrial ecosystem|market intelligence|b2b events|connect manufacturers|danh bạ|triển lãm|thương mại|whitepaper|ebook|guide|introduction|article|blog|press release|wikipedia/i.test(
    text,
  );
}

function extractSeedCompanyNames(results: SearxngResult[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const result of results) {
    const titleName = extractTitleCompanyName(result.title ?? "");

    if (titleName && !seen.has(titleName.toLowerCase())) {
      seen.add(titleName.toLowerCase());
      names.push(titleName);
    }

    const text = `${result.title ?? ""} ${result.content ?? ""}`;
    const matches = text.matchAll(
      /[A-Z][A-Za-z0-9&.'() -]{2,80}\s(?:Co\.?\s*,?\s*Ltd\.?|Company Limited|Corporation|Corp\.?|JSC|Joint Stock Company|Ltd\.?|Inc\.?)/g,
    );

    for (const match of matches) {
      const name = match[0]
        .replace(/^[^A-Z]+/, "")
        .replace(/\s+/g, " ")
        .trim();
      const key = name.toLowerCase();

      if (name.length >= 6 && !seen.has(key) && !isGenericSeedName(name)) {
        seen.add(key);
        names.push(name);
      }
    }
  }

  return names;
}

function extractTitleCompanyName(title: string) {
  const cleaned = title
    .replace(/\b(about us|company profile|corporate profile|official website|home)\b/gi, "")
    .replace(/会社概要|企業情報|公式サイト/g, "")
    .split(/\s*[|｜\-–—:：]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .find((part) => !isGenericSeedName(part) && /[A-Za-z0-9]/.test(part));

  if (!cleaned || cleaned.length < 4 || cleaned.length > 80) {
    return "";
  }

  return cleaned;
}

function buildOfficialLookupQueries(
  candidateNames: string[],
  request?: {
    location?: string;
  },
) {
  const location = request?.location?.trim() ?? "";
  const targetsJapaneseUser = true;

  return candidateNames.flatMap((name) => {
    const quotedName = `"${name}"`;
    const base = location ? `${quotedName} ${location}` : quotedName;
    const queries = [
      `${base} official website`,
      `${base} company profile`,
      `${base} about us`,
    ];

    if (targetsJapaneseUser) {
      queries.push(`${base} 公式サイト`);
      queries.push(`${base} 会社概要`);
    }

    return queries;
  });
}

function isGenericSeedName(name: string) {
  return /instagram|tiktok|google|youtube|facebook|clutch\.co|emails?\s*&\s*contacts?|supplier|sourcing|manufacturer directory|business direct|top\s+\d*|top manufacturing|list of|click for|prestigious|multi$|manufacturing companies|companies in|directory|marketplace/i.test(
    name,
  );
}

type LocationSearchProfile = {
  hostSuffixes: string[];
  textTerms: RegExp;
};

function getLocationSearchProfile(location: string): LocationSearchProfile | null {
  if (/vietnam|viet nam|việt nam|hanoi|ha noi|hà nội|ho chi minh|hồ chí minh|hcmc/i.test(location)) {
    return {
      hostSuffixes: [".vn", ".com.vn"],
      textTerms:
        /vietnam|viet nam|việt nam|hanoi|ha noi|hà nội|ho chi minh|hồ chí minh|hcmc|binh duong|bình dương|dong nai|đồng nai|bac ninh|bắc ninh|hai phong|hải phòng/i,
    };
  }

  return null;
}

function buildIntentSearchQueries(
  intent: SearchIntent,
  {
    fallbackIndustry,
    fallbackLocation,
    keywordScript,
  }: {
    fallbackIndustry: string;
    fallbackLocation: string;
    keywordScript: string;
  },
) {
  const identityTerms = intent.companyIdentity;
  const locationTerms = intent.operatingLocation.length
    ? intent.operatingLocation
    : [fallbackLocation];
  const industryTerms = intent.industry.length ? intent.industry : [fallbackIndustry];
  const excludeQuery = intent.exclude
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `-${term}`)
    .join(" ");

  const identityJa = chooseTerms(identityTerms, "ja", 2).join(" ");
  const identityEn = chooseTerms(identityTerms, "en", 2).join(" ");
  const locationJa = chooseTerms(locationTerms, "ja", 2).join(" ");
  const locationEn = chooseTerms(locationTerms, "en", 2).join(" ");
  const industryJa = chooseTerms(industryTerms, "ja", 2).join(" ");
  const industryEn = chooseTerms(industryTerms, "en", 2).join(" ");
  const targetJapan = locationTerms.some(isJapanLocation);

  return uniqueQueries([
    `${identityJa || identityEn} ${industryJa || industryEn} ${locationJa || locationEn} 会社概要 ${excludeQuery}`,
    `${identityJa || identityEn} ${industryJa || industryEn} ${locationJa || locationEn} 公式サイト ${excludeQuery}`,
    `${identityEn || identityJa} ${industryEn || industryJa} ${locationEn || locationJa} official website ${excludeQuery}`,
    `${identityEn || identityJa} ${industryEn || industryJa} ${locationEn || locationJa} company profile ${excludeQuery}`,
    targetJapan
      ? `site:.jp ${identityJa || identityEn} ${industryJa || industryEn} ${locationJa || locationEn} 会社概要 ${excludeQuery}`
      : "",
    targetJapan
      ? `site:.co.jp ${identityJa || identityEn} ${industryJa || industryEn} ${locationJa || locationEn} 企業情報 ${excludeQuery}`
      : "",
    keywordScript,
  ]).slice(0, 8);
}

function buildKeywordScriptQuery(searchPlan: OpportunitySearchPlan) {
  const positiveTerms = searchPlan.searchTerms.map((term) => term.trim()).filter(Boolean);
  const negativeTerms = searchPlan.excludeTerms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `-${term}`);

  return [...positiveTerms, ...negativeTerms].join(" ");
}

function evaluateResultEvidence(
  result: SearxngResult,
  request: {
    location?: string;
    opportunityDescription?: string;
    searchPlan?: OpportunitySearchPlan;
  } | undefined,
  targetsJapan: boolean,
): ResultEvidence {
  const url = safeUrl(result.url ?? "");
  const hostname = url?.hostname.replace(/^www\./, "") ?? "";
  const path = decodePathname(url?.pathname ?? "");
  const originalText = `${result.title ?? ""} ${result.content ?? ""} ${hostname}`;
  const text = originalText.toLowerCase();
  const intent = request?.searchPlan?.searchIntent;
  const identityTerms = intent?.companyIdentity ?? [];
  const locationTerms = intent?.operatingLocation ?? [request?.location ?? ""];
  const industryTerms = intent?.industry ?? [];
  const matchedIdentity = matchTerms(originalText, identityTerms);
  const matchedLocation = matchTerms(originalText, locationTerms);
  const matchedIndustry = matchTerms(originalText, industryTerms);
  const matchedOfficial = matchTerms(originalText, [
    "official",
    "homepage",
    "about us",
    "company profile",
    "corporate profile",
    "会社概要",
    "公式サイト",
    "企業情報",
    "住所",
  ]);
  const urlType = resolveUrlType(path);
  const passed: string[] = [];
  const missing: string[] = [];

  if (urlType !== "other") {
    passed.push(urlType === "homepage" ? "Official homepage URL" : "Company profile URL");
  } else {
    missing.push("Official homepage/about URL");
  }

  if (hostname.endsWith(".co.jp") || hostname.endsWith(".jp")) {
    if (targetsJapan) {
      passed.push("Japan company domain");
      if (locationTerms.some((term) => /japan|日本/i.test(term))) {
        matchedLocation.push("Japan domain");
      }
    }
  }

  if (matchedOfficial.length > 0) {
    passed.push("Official/company page wording");
  } else {
    missing.push("Official/company page wording");
  }

  if (identityTerms.length === 0 || matchedIdentity.length > 0) {
    if (matchedIdentity.length > 0) {
      passed.push(`Identity: ${matchedIdentity.join(", ")}`);
    }
  } else {
    missing.push(`Identity: ${identityTerms.slice(0, 3).join(", ")}`);
  }

  if (locationTerms.length === 0 || matchedLocation.length > 0) {
    if (matchedLocation.length > 0) {
      passed.push(`Location: ${matchedLocation.join(", ")}`);
    }
  } else {
    missing.push(`Location: ${locationTerms.slice(0, 3).join(", ")}`);
  }

  if (industryTerms.length === 0 || matchedIndustry.length > 0) {
    if (matchedIndustry.length > 0) {
      passed.push(`Industry: ${matchedIndustry.join(", ")}`);
    }
  } else {
    missing.push(`Industry: ${industryTerms.slice(0, 3).join(", ")}`);
  }

  if (/directory|ranking|list|news|blog|recruit|job|marketplace|platform|supplier|buyers|求人|採用|記事|一覧/i.test(text)) {
    missing.push("Avoided page type signal present");
  }

  return {
    passed: uniqueLabels(passed).slice(0, 6),
    missing: uniqueLabels(missing).slice(0, 6),
    urlType,
    matchedIdentity,
    matchedLocation,
    matchedIndustry,
    matchedOfficial,
  };
}

function chooseTerms(terms: string[], language: "ja" | "en", limit: number) {
  const preferred = terms.filter((term) =>
    language === "ja" ? hasJapaneseText(term) : !hasJapaneseText(term),
  );
  const fallback = terms.filter((term) => !preferred.includes(term));

  return [...preferred, ...fallback].filter(Boolean).slice(0, limit);
}

function matchTerms(value: string, terms: string[]) {
  const normalizedValue = normalizeText(value);

  return uniqueLabels(
    terms.filter((term) => {
      const normalizedTerm = normalizeText(term);
      return normalizedTerm.length >= 2 && normalizedValue.includes(normalizedTerm);
    }),
  );
}

function resolveUrlType(pathname: string): ResultEvidence["urlType"] {
  if (isRootPath(pathname)) return "homepage";
  if (/会社概要|企業概要|会社案内|about|about-us|overview|outline/.test(pathname)) {
    return "about";
  }
  if (/company|corporate|corp|profile|info|information|企業情報|事業内容/.test(pathname)) {
    return "company_profile";
  }

  return "other";
}

function uniqueQueries(queries: string[]) {
  const seen = new Set<string>();

  return queries
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((query) => {
      const key = query.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function uniqueLabels(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isLocationRelevantResult(
  result: SearxngResult,
  locationProfile: LocationSearchProfile,
) {
  const url = safeUrl(result.url ?? "");
  if (!url) return false;

  const hostname = url.hostname.replace(/^www\./, "");
  const text = `${result.title ?? ""} ${result.content ?? ""} ${hostname}`;

  return (
    locationProfile.hostSuffixes.some((suffix) => hostname.endsWith(suffix)) ||
    matchesLocationText(text, locationProfile)
  );
}

function matchesLocationText(value: string, locationProfile: LocationSearchProfile) {
  return locationProfile.textTerms.test(value);
}

function isJapanLocation(location: string) {
  return /japan|日本|東京|大阪|名古屋|神奈川|埼玉|千葉|福岡|愛知|兵庫|京都/i.test(
    location,
  );
}

function hasJapaneseText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function normalizeCompanyKey(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^(en|jp|ja|global|corp|corporate)\./, "");
    const parts = hostname.split(".");

    if (parts.length >= 3 && parts.at(-2) === "co" && parts.at(-1) === "jp") {
      return `${parts.at(-3)}.co.jp`;
    }

    if (parts.length >= 3 && parts.at(-2) === "com" && parts.at(-1) === "vn") {
      return `${parts.at(-3)}.com.vn`;
    }

    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }

    return hostname;
  } catch {
    return "";
  }
}

function isRootPath(pathname: string) {
  const normalized = decodePathname(pathname).replace(/\/+$/, "");
  return normalized === "";
}

function decodePathname(pathname: string) {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

function readTimeout(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
