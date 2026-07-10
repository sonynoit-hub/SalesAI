import * as cheerio from "cheerio";
import { MAX_TARGET_COMPANY_COUNT } from "@/lib/search-analysis/constants";
import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import { applyDatabaseStatuses } from "@/lib/search-analysis/store";
import { searchSearxng, type SearxngResult } from "@/lib/search-analysis/search";
import type {
  OpportunityResult,
  OpportunitySearchPlan,
  ResultEvidence,
  SalesCompanyBrief,
  SearchAnalyzeResponse,
} from "@/lib/search-analysis/types";

type VerifiedHomepage = {
  companyName: string;
  homepageUrl: string;
  overview: string;
  source: string;
  originalUrl: string;
  evidence: ResultEvidence;
  publicEmail?: string;
  contactFormUrl?: string;
  outreachChannelConfidence?: "High" | "Medium" | "Low";
};

type HomepageVerification = {
  url: string;
  title: string;
  siteName: string;
  description: string;
  h1: string;
  paragraphs: string[];
  emails: string[];
  contactLinks: string[];
  hasContactForm: boolean;
};

type OutreachChannel = Pick<
  VerifiedHomepage,
  "publicEmail" | "contactFormUrl" | "outreachChannelConfidence"
>;

const BLOCKED_HOST_PARTS = [
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
  "school",
  "wiki",
];

const BLOCKED_HOST_PATTERNS = [
  /(^|\.)amazon\./,
  /(^|\.)baseconnect\./,
  /(^|\.)bing\./,
  /(^|\.)clutch\./,
  /(^|\.)doda\./,
  /(^|\.)emis\./,
  /(^|\.)enosisoutsourcing\./,
  /(^|\.)facebook\./,
  /(^|\.)google\./,
  /(^|\.)indeed\./,
  /(^|\.)instagram\./,
  /(^|\.)jetro\./,
  /(^|\.)linkedin\./,
  /(^|\.)meti\./,
  /(^|\.)mynavi\./,
  /(^|\.)prtimes\./,
  /(^|\.)salesnow\./,
  /(^|\.)sgpgrid\./,
  /(^|\.)tiktok\./,
  /(^|\.)vietnamnet\./,
  /(^|\.)vietnam\.travel$/,
  /(^|\.)wikipedia\./,
  /(^|\.)x\./,
  /(^|\.)youtube\./,
  /(^|\.)zhihu\./,
];

const BLOCKED_HOST_SUFFIXES = [
  ".edu",
  ".go.jp",
  ".gov",
  ".gov.vn",
  ".lg.jp",
  ".mil",
];

const STRICT_SEARCH_BATCH_SIZE = 2;
const STRICT_LOOKUP_BATCH_SIZE = 4;
const HOMEPAGE_VERIFY_TIMEOUT_MS = 3_500;
const CONTACT_PAGE_VERIFY_LIMIT = 8;
const HOMEPAGE_ENRICH_CONCURRENCY = 6;

export async function runStrictPublicCompanySearch(
  request: SearchAnalyzeRequest,
): Promise<SearchAnalyzeResponse> {
  const startedAt = Date.now();
  const searchPlan = buildStrictSearchPlan(request);
  const searchQueries = buildStrictSearchQueries(request);
  const settled = await searchQueriesInBatches(searchQueries, STRICT_SEARCH_BATCH_SIZE);
  const failed = settled.filter((result) => result.status === "rejected");
  const firstPassResults = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const seedNames = extractCompanySeedNames(firstPassResults).slice(
    0,
    Math.min(MAX_TARGET_COMPANY_COUNT * 2, Math.max(12, request.resultLimit * 2)),
  );
  const officialLookupQueries = buildOfficialLookupQueries(seedNames).slice(
    0,
    officialLookupQueryLimit(request.resultLimit),
  );
  const lookupSettled = await searchQueriesInBatches(
    officialLookupQueries,
    STRICT_LOOKUP_BATCH_SIZE,
  );
  const lookupResults = lookupSettled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const rawResults = [...firstPassResults, ...lookupResults];

  if (rawResults.length === 0 && failed.length === settled.length) {
    throw new Error(
      "Public web search is unavailable. Start SearXNG on 127.0.0.1:8080 and try again.",
    );
  }
  const verified = verifyHomepageCandidates(rawResults, request).slice(
    0,
    request.resultLimit,
  );
  const enrichment = await enrichHomepageCandidates(verified, request);
  const enriched = enrichment.candidates;
  const results = await applyDatabaseStatuses(
    enriched.map((candidate, index) => toOpportunityResult(candidate, request, index)),
  );

  return {
    strategy: {
      objective: `Find real company homepages for ${request.referenceKeyword}.`,
      signals: [
        "Official company homepage",
        "Company/about wording",
        "Non-directory public web result",
      ],
      sources: ["SearXNG public web search"],
      confidence: results.length > 0 ? "Medium" : "Low",
    },
    results,
    meta: {
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      diagnostics: {
        requested: request.resultLimit,
        rawResults: rawResults.length,
        officialCandidates: verified.length,
        crawlAttempted: verified.length,
        crawledPages: enrichment.verifiedCount,
        crawlFailed: enrichment.failedCount,
        crawlFiltered: 0,
        passedEvidence: enriched.length,
        removedByEvidence: Math.max(0, rawResults.length - enriched.length),
        finalShown: results.length,
      },
      searchQueries,
      searchPlan,
      candidateNames: enriched.map((candidate) => candidate.companyName),
      officialLookupQueries,
      crawledPages: enrichment.verifiedCount,
      resultLimit: request.resultLimit,
      usedFallbackAnalysis: false,
    },
  };
}

async function enrichHomepageCandidates(
  candidates: VerifiedHomepage[],
  request: SearchAnalyzeRequest,
) {
  const enriched = await mapWithConcurrency(candidates, HOMEPAGE_ENRICH_CONCURRENCY, async (
    candidate,
  ) => {
    try {
      return await enrichHomepageCandidate(candidate, request);
    } catch {
      return candidate;
    }
  });
  const verifiedCount = enriched.filter((candidate) =>
    candidate.evidence.passed.includes("Homepage metadata verified"),
  ).length;

  return {
    candidates: enriched,
    verifiedCount,
    failedCount: candidates.length - verifiedCount,
  };
}

async function enrichHomepageCandidate(
  candidate: VerifiedHomepage,
  request: SearchAnalyzeRequest,
) {
  const urls = Array.from(
    new Set([candidate.originalUrl, candidate.homepageUrl].filter(Boolean)),
  ).filter((url) => isSafePublicFetchUrl(url));
  const initialSettled = await Promise.allSettled(urls.map(fetchHomepageVerification));
  const initialVerifications = initialSettled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  const contactPageUrls = buildContactPageUrls(
    candidate.homepageUrl,
    initialVerifications,
  );
  const contactSettled = await Promise.allSettled(
    contactPageUrls.map(fetchHomepageVerification),
  );
  const contactVerifications = contactSettled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  const verifications = [...initialVerifications, ...contactVerifications];
  const verification = pickBestHomepageVerification(verifications);
  const outreachChannel = resolveOutreachChannel(verifications);

  if (!verification) {
    return {
      ...candidate,
      ...outreachChannel,
    };
  }

  const companyName = chooseVerifiedCompanyName(candidate.companyName, verification);
  const overview = chooseVerifiedOverview(candidate.overview, verification, request);

  return {
    ...candidate,
    companyName,
    overview,
    ...outreachChannel,
    evidence: {
      ...candidate.evidence,
      passed: Array.from(
        new Set([...candidate.evidence.passed, "Homepage metadata verified"]),
      ),
    },
  };
}

async function fetchHomepageVerification(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "SalesAI homepage verifier/1.0",
    },
    signal: AbortSignal.timeout(HOMEPAGE_VERIFY_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType && !/html|text/i.test(contentType)) {
    return null;
  }

  const html = (await response.text()).slice(0, 200_000);
  const verification = extractHomepageVerification(html, url);

  if (
    !verification.title &&
    !verification.siteName &&
    !verification.description &&
    verification.paragraphs.length === 0 &&
    verification.emails.length === 0 &&
    verification.contactLinks.length === 0 &&
    !verification.hasContactForm
  ) {
    return null;
  }

  return verification;
}

export function extractHomepageVerification(
  html: string,
  url: string,
): HomepageVerification {
  const $ = cheerio.load(html);
  const title = cleanupMetadataText(
    $("title").first().text() ||
      $("meta[property='og:title']").attr("content") ||
      "",
  );
  const siteName = cleanupMetadataText(
    $("meta[property='og:site_name']").attr("content") ||
      $("meta[name='application-name']").attr("content") ||
      "",
  );
  const description = cleanupMetadataText(
    $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      "",
  );
  const h1 = cleanupMetadataText(
    $("h1")
      .toArray()
      .map((element) => $(element).text())
      .find((value) => isUsefulHomepageText(value)) ?? "",
  );
  const paragraphs = $("p")
    .toArray()
    .map((element) => cleanupMetadataText($(element).text()))
    .filter(isUsefulHomepageText)
    .slice(0, 4);
  const emails = extractPublicEmails($.root().text(), html);
  const contactLinks = $("a")
    .toArray()
    .map((element) => $(element).attr("href") ?? "")
    .map((href) => normalizeContactHref(href, url))
    .filter((href): href is string => Boolean(href))
    .filter(isLikelyContactUrl)
    .slice(0, 12);
  const hasContactForm = $("form").toArray().some((element) => {
    const formText = cleanupMetadataText($(element).text());
    const action = $(element).attr("action") ?? "";
    const formAttributes = [
      $(element).attr("id"),
      $(element).attr("class"),
      $(element).attr("name"),
      $(element).attr("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");
    const fieldDescriptor = $(element)
      .find("input, textarea, select, button")
      .toArray()
      .map((field) =>
        [
          $(field).attr("name"),
          $(field).attr("id"),
          $(field).attr("class"),
          $(field).attr("type"),
          $(field).attr("placeholder"),
          $(field).attr("aria-label"),
          $(field).text(),
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join(" ");
    const inputs = $(element).find("input, textarea, select").length;
    const descriptor = `${formText} ${action} ${formAttributes} ${fieldDescriptor}`;
    const hasEmailField = /email|mail|メール|e-mail/i.test(fieldDescriptor);
    const hasMessageField =
      /message|content|body|inquiry|comment|お問い合わせ|問合|相談|内容|textarea/i.test(
        fieldDescriptor,
      ) || $(element).find("textarea").length > 0;

    return (
      inputs >= 2 &&
      (isLikelyContactText(descriptor) || (hasEmailField && hasMessageField))
    );
  });

  return {
    url,
    title,
    siteName,
    description,
    h1,
    paragraphs,
    emails,
    contactLinks,
    hasContactForm,
  };
}

async function searchQueriesInBatches(queries: string[], batchSize: number) {
  const settled: PromiseSettledResult<SearxngResult[]>[] = [];

  for (let index = 0; index < queries.length; index += batchSize) {
    const batch = queries.slice(index, index + batchSize);
    const batchSettled = await Promise.allSettled(
      batch.map((query) => searchSearxng(query)),
    );
    settled.push(...batchSettled);
  }

  return settled;
}

export function verifyHomepageCandidates(
  results: SearxngResult[],
  request: SearchAnalyzeRequest,
) {
  const seen = new Set<string>();
  const verified: VerifiedHomepage[] = [];

  for (const result of results) {
    const candidate = verifyHomepageCandidate(result, request);

    if (!candidate) continue;

    const key = normalizeHostKey(candidate.homepageUrl);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    verified.push(candidate);
  }

  return verified;
}

function verifyHomepageCandidate(
  result: SearxngResult,
  request: SearchAnalyzeRequest,
): VerifiedHomepage | null {
  const url = safeUrl(result.url ?? "");

  if (!url || !["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  const hostname = normalizeHostname(url.hostname);
  const path = decodePath(url.pathname);
  const text = normalizeText(`${result.title ?? ""} ${result.content ?? ""} ${hostname}`);

  if (isBlockedHost(hostname) || isBlockedPath(path) || isNonCompanyText(text)) {
    return null;
  }

  const urlType = resolveUrlType(path);
  if (urlType === "other") {
    return null;
  }

  if (!hasCompanySignals(text, request)) {
    return null;
  }

  const companyName = extractCompanyName(result, hostname);
  if (!companyName || isGenericName(companyName)) {
    return null;
  }

  const homepageUrl = new URL("/", url.origin).toString();
  const evidence = buildEvidence({
    hostname,
    request,
    text,
    urlType,
  });

  return {
    companyName,
    homepageUrl,
    overview: buildOverview(result, companyName, request),
    source: result.engine ?? "searxng",
    originalUrl: url.toString(),
    evidence,
  };
}

function buildStrictSearchPlan(request: SearchAnalyzeRequest): OpportunitySearchPlan {
  const terms = [
    request.referenceKeyword,
    request.industry,
    request.location,
  ].filter(Boolean);

  return {
    intentSummary: request.referenceKeyword,
    targetCompanyProfile: terms.join(" "),
    searchIntent: {
      companyIdentity: [request.referenceKeyword],
      operatingLocation: request.location ? [request.location] : [],
      industry: request.industry ? [request.industry] : [],
      requiredEvidence: ["official homepage", "company profile", "about page"],
      exclude: request.excludeKeywords,
    },
    searchTerms: terms,
    excludeTerms: request.excludeKeywords,
    signals: ["official homepage", "company profile", "about page"],
  };
}

function buildStrictSearchQueries(
  request: SearchAnalyzeRequest,
) {
  const base = [request.referenceKeyword, request.industry, request.location]
    .filter(Boolean)
    .join(" ");
  const exclude = [
    ...request.excludeKeywords,
    "news",
    "directory",
    "jobs",
    "careers",
    "article",
    "blog",
    "government",
    "portal",
    "school",
    "wikipedia",
  ];
  const excludeQuery = Array.from(new Set(exclude))
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `-${term}`)
    .join(" ");
  const companyTerms = hasJapaneseText(base)
    ? ["公式サイト", "会社概要", "企業情報"]
    : ["official website", "company profile", "about us"];
  const expandedQueries = buildDeterministicExpansionQueries(request, excludeQuery);

  return Array.from(
    new Set(
      [
        ...companyTerms.map((term) =>
          [base, term, excludeQuery].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        ),
        ...expandedQueries,
      ],
    ),
  );
}

function buildDeterministicExpansionQueries(
  request: SearchAnalyzeRequest,
  excludeQuery: string,
) {
  const text = `${request.referenceKeyword} ${request.industry} ${request.location}`;
  const targetsVietnamIt =
    /vietnam|viet nam|ベトナム/i.test(text) &&
    /it|software|system|システム|ソフトウェア|オフショア/i.test(text);

  if (!targetsVietnamIt) {
    return [];
  }

  return [
    `vietnam software development company japan official website ${excludeQuery}`,
    `vietnam offshore development company japan official website ${excludeQuery}`,
    `ベトナム オフショア開発 会社概要 日本 ${excludeQuery} -求人 -ニュース -一覧`,
    `ベトナム IT企業 会社概要 日本 ${excludeQuery} -求人 -ニュース -一覧`,
  ].map((query) => query.replace(/\s+/g, " ").trim());
}

function buildOfficialLookupQueries(candidateNames: string[]) {
  return candidateNames.flatMap((name) => [
    `"${name}" official website`,
    `"${name}" company profile`,
    `"${name}" about us`,
    `"${name}" 公式サイト`,
    `"${name}" 会社概要`,
  ]);
}

function officialLookupQueryLimit(resultLimit: number) {
  return Math.min(MAX_TARGET_COMPANY_COUNT * 3, Math.max(30, resultLimit * 3));
}

async function mapWithConcurrency<Input, Output>(
  values: Input[],
  concurrency: number,
  mapper: (value: Input, index: number) => Promise<Output>,
) {
  const results = new Array<Output>(values.length);

  for (let index = 0; index < values.length; index += concurrency) {
    const batch = values.slice(index, index + concurrency);
    const settled = await Promise.allSettled(
      batch.map((value, batchIndex) => mapper(value, index + batchIndex)),
    );

    settled.forEach((result, batchIndex) => {
      const targetIndex = index + batchIndex;
      if (result.status === "fulfilled") {
        results[targetIndex] = result.value;
      }
    });
  }

  return results.filter((value): value is Output => value !== undefined);
}

function extractCompanySeedNames(results: SearxngResult[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const result of results) {
    const text = `${result.title ?? ""}. ${result.content ?? ""}`;
    const matches = [
      ...text.matchAll(
        /\b([A-Z][A-Za-z0-9&.'() -]{2,70}(?:Co\.?\s*,?\s*Ltd\.?|Company Limited|Corporation|Corp\.?|JSC|Joint Stock Company|Ltd\.?|Inc\.?))\b/g,
      ),
      ...text.matchAll(
        /\b([A-Z][A-Za-z0-9&.'() -]{2,60})\s*,\s*(?:a|an)\s+(?:small|midsize|mid-sized|large)?\s*(?:software|it|web|mobile|digital|consulting|development|outsourcing)/gi,
      ),
    ];

    for (const match of matches) {
      const name = cleanupSeedName(match[1] ?? "");
      const key = name.toLowerCase();

      if (name && !seen.has(key) && !isGenericName(name)) {
        seen.add(key);
        names.push(name);
      }
    }
  }

  return names;
}

function cleanupSeedName(value: string) {
  return value
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");
}

function toOpportunityResult(
  candidate: VerifiedHomepage,
  request: SearchAnalyzeRequest,
  index: number,
): OpportunityResult {
  const salesBrief: SalesCompanyBrief = {
    businessSummary: candidate.overview,
    locationEvidence: request.location || "Public homepage candidate",
    industryEvidence: request.industry || "Public homepage candidate",
    likelyNeed: `${request.industry || "Business"} workflow fit should be reviewed after saving.`,
    salesAngle: `Review ${candidate.companyName} as a saved lead from public web search.`,
    contactNextStep: "Open the homepage and confirm the contact page before outreach.",
    confidence: "Medium",
  };

  return {
    id: `strict-${index + 1}`,
    companyName: candidate.companyName,
    websiteUrl: candidate.homepageUrl,
    aboutUrl:
      candidate.originalUrl === candidate.homepageUrl
        ? undefined
        : candidate.originalUrl,
    publicEmail: candidate.publicEmail,
    contactFormUrl: candidate.contactFormUrl,
    outreachChannelConfidence: candidate.outreachChannelConfidence,
    description: candidate.overview,
    salesBrief,
    source: candidate.source,
    location: request.location || "Unknown",
    employees: "Unknown",
    industry: request.industry || "Unknown",
    aiOpportunity: salesBrief.salesAngle,
    whyThisMatches: candidate.evidence.passed,
    evidence: candidate.evidence,
  };
}

function buildEvidence({
  hostname,
  request,
  text,
  urlType,
}: {
  hostname: string;
  request: SearchAnalyzeRequest;
  text: string;
  urlType: ResultEvidence["urlType"];
}): ResultEvidence {
  const matchedLocation = matchTextTerms(text, [request.location]);
  const matchedIndustry = matchTextTerms(text, [request.industry]);
  const matchedOfficial = matchTextTerms(text, [
    "official",
    "homepage",
    "about",
    "company",
    "corporate",
    "service",
    "solution",
    "会社",
    "会社概要",
    "企業情報",
    "事業",
    "サービス",
    "công ty",
  ]);

  return {
    passed: [
      "Verified company homepage candidate",
      `Homepage domain: ${hostname}`,
      urlType === "homepage" ? "Root homepage URL" : "Company profile/about page found",
    ],
    missing: [],
    urlType,
    matchedIdentity: [],
    matchedLocation,
    matchedIndustry,
    matchedOfficial,
  };
}

function buildOverview(
  result: SearxngResult,
  companyName: string,
  request: SearchAnalyzeRequest,
) {
  const sentence = splitSentences(`${result.content ?? ""} ${result.title ?? ""}`)
    .find((value) => !isNonCompanyText(normalizeText(value)) && value.length >= 24);

  if (sentence) {
    return sentence.length > 180 ? `${sentence.slice(0, 179)}...` : sentence;
  }

  return `${companyName} is a public company homepage candidate for ${[
    request.industry,
    request.location,
  ].filter(Boolean).join(" ")}.`;
}

function pickBestHomepageVerification(verifications: HomepageVerification[]) {
  return verifications
    .filter((verification) =>
      Boolean(
        verification.title ||
          verification.siteName ||
          verification.description ||
          verification.h1 ||
          verification.paragraphs.length,
      ),
    )
    .sort((left, right) => verificationScore(right) - verificationScore(left))[0];
}

function buildContactPageUrls(
  homepageUrl: string,
  verifications: HomepageVerification[],
) {
  const homepage = safeUrl(homepageUrl);

  if (!homepage) {
    return [];
  }

  const discoveredLinks = verifications.flatMap(
    (verification) => verification.contactLinks,
  );
  const commonPaths = [
    "/contact",
    "/contact/",
    "/contact-us",
    "/contact-us/",
    "/contacts",
    "/contacts/",
    "/inquiry",
    "/inquiry/",
    "/inquiries",
    "/inquiries/",
    "/contactform",
    "/contact-form",
    "/contact.html",
    "/contact-us.html",
    "/お問い合わせ",
    "/問い合わせ",
    "/お問合せ",
    "/資料請求",
  ];
  const localePrefixes = ["", "/ja", "/jp", "/en", "/vi"];
  const localizedCommonPaths = localePrefixes.flatMap((prefix) =>
    commonPaths.map((path) => `${prefix}${path}`),
  );

  return Array.from(
    new Set([
      ...discoveredLinks,
      ...localizedCommonPaths.map((path) => new URL(path, homepage.origin).toString()),
    ]),
  )
    .filter((url) => isSafePublicFetchUrl(url))
    .slice(0, CONTACT_PAGE_VERIFY_LIMIT);
}

function resolveOutreachChannel(verifications: HomepageVerification[]): OutreachChannel {
  const publicEmail = firstPublicEmail(verifications);
  const formPage = verifications.find((verification) => verification.hasContactForm);
  const contactFormUrl =
    formPage?.url ??
    verifications.flatMap((verification) => verification.contactLinks)[0];
  const outreachChannelConfidence: OutreachChannel["outreachChannelConfidence"] =
    publicEmail && contactFormUrl
      ? "High"
      : publicEmail || contactFormUrl
        ? "Medium"
        : "Low";

  return {
    publicEmail,
    contactFormUrl,
    outreachChannelConfidence,
  };
}

function firstPublicEmail(verifications: HomepageVerification[]) {
  const emails = verifications.flatMap((verification) => verification.emails);

  return prioritizePublicEmails(emails)[0];
}

function prioritizePublicEmails(emails: string[]) {
  const seen = new Set<string>();
  const unique = emails
    .map((email) => email.toLowerCase())
    .filter((email) => !isBlockedEmail(email))
    .filter((email) => {
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });

  return unique.sort((left, right) => emailScore(right) - emailScore(left));
}

function emailScore(email: string) {
  const local = email.split("@")[0] ?? "";

  if (/^(info|contact|sales|inquiry|toiawase|support|hello|business)$/.test(local)) {
    return 3;
  }
  if (/^(webmaster|office|admin)$/.test(local)) {
    return 1;
  }

  return 2;
}

function extractPublicEmails(text: string, html: string) {
  const normalizedHtml = html
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*|\s+at\s+/gi, "@")
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*|\s+dot\s+/gi, ".");
  const source = `${text} ${normalizedHtml}`;

  return Array.from(
    source.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    (match) => cleanupEmail(match[0] ?? ""),
  ).filter(Boolean);
}

function cleanupEmail(value: string) {
  return value
    .replace(/^mailto:/i, "")
    .replace(/[?].*$/, "")
    .replace(/^[<("'“”‘’]+|[>),."'“”‘’;:]+$/g, "")
    .trim()
    .toLowerCase();
}

function isBlockedEmail(email: string) {
  return (
    !email ||
    email.length > 120 ||
    /\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email) ||
    /example\.com|example\.jp|domain\.com|yourdomain|sentry\.io/i.test(email) ||
    /^(noreply|no-reply|donotreply|do-not-reply|privacy|abuse|postmaster)@/i.test(email)
  );
}

function normalizeContactHref(href: string, baseUrl: string) {
  const trimmed = href.trim();

  if (!trimmed || trimmed.startsWith("#") || /^javascript:/i.test(trimmed)) {
    return null;
  }

  if (/^mailto:/i.test(trimmed)) {
    return null;
  }

  let resolved = "";

  try {
    resolved = new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }

  const url = safeUrl(resolved);

  return url ? url.toString() : null;
}

function isLikelyContactUrl(value: string) {
  const url = safeUrl(value);
  const text = url ? decodePath(`${url.pathname} ${url.search}`) : value.toLowerCase();

  return isLikelyContactText(text) && !isBlockedPath(text);
}

function isLikelyContactText(value: string) {
  return /contact|inquiry|inquiries|contact-us|contactform|request|estimate|相談|問合|問い合わせ|お問い合わせ|お問合せ|資料請求|フォーム|窓口/i.test(
    value,
  );
}

function verificationScore(verification: HomepageVerification) {
  return [
    verification.siteName ? 3 : 0,
    verification.title ? 2 : 0,
    verification.description ? 2 : 0,
    verification.h1 ? 1 : 0,
    verification.paragraphs.length,
  ].reduce((total, value) => total + value, 0);
}

export function chooseVerifiedCompanyName(
  currentName: string,
  verification: HomepageVerification,
) {
  const candidates = [
    verification.siteName,
    extractCompanyNameFromTitle(verification.title),
    extractCompanyNameFromTitle(verification.h1),
    extractCompanyNameFromContent(verification.description),
  ]
    .map(cleanupCompanyName)
    .filter((value) => value && !isGenericName(value));

  for (const candidate of candidates) {
    if (isBetterCompanyName(candidate, currentName)) {
      return candidate;
    }
  }

  return currentName;
}

export function chooseVerifiedOverview(
  currentOverview: string,
  verification: HomepageVerification,
  request: SearchAnalyzeRequest,
) {
  const candidates = [
    verification.description,
    ...verification.paragraphs,
  ]
    .map(cleanupMetadataText)
    .filter((value) => isUsefulHomepageText(value))
    .filter((value) => hasCompanySignals(normalizeText(value), request));

  const overview = candidates[0];

  if (!overview || overview.length < 30) {
    return currentOverview;
  }

  return overview.length > 260 ? `${overview.slice(0, 259)}...` : overview;
}

function extractCompanyNameFromTitle(value: string) {
  return value
    .replace(/\b(official website|official site|homepage|home|about us|company profile|corporate profile)\b/gi, "")
    .replace(/公式サイト|会社概要|企業情報|ホームページ|トップページ/g, "")
    .split(/\s*[|｜\-–—:：]\s*/)
    .map(cleanupCompanyName)
    .filter(Boolean)
    .find((part) => part.length >= 2 && !isGenericName(part)) ?? "";
}

function isBetterCompanyName(candidate: string, currentName: string) {
  const current = cleanupCompanyName(currentName);
  const normalizedCandidate = normalizeNameForCompare(candidate);
  const normalizedCurrent = normalizeNameForCompare(current);

  if (!candidate || candidate === current) {
    return false;
  }

  if (isGenericName(current)) {
    return true;
  }

  if (
    normalizedCandidate.includes(normalizedCurrent) &&
    candidate.length > current.length
  ) {
    return true;
  }

  if (hasCorporateNameSignal(candidate) && !hasCorporateNameSignal(current)) {
    return true;
  }

  return current.length <= 4 && candidate.length > current.length;
}

function hasCorporateNameSignal(value: string) {
  return /company|corporation|corp\.?|co\.?\s*ltd\.?|ltd\.?|inc\.?|jsc|joint stock|株式会社|有限会社|合同会社/i.test(
    value,
  );
}

function normalizeNameForCompare(value: string) {
  return value.toLowerCase().replace(/[\s._\-–—|｜:：,，。・]/g, "");
}

function cleanupCompanyName(value: string) {
  return value
    .replace(/[_-]?web$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’«»]+|[\s"'“”‘’«».,;:：|｜-]+$/g, "")
    .trim();
}

function cleanupMetadataText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isUsefulHomepageText(value: string) {
  const cleaned = cleanupMetadataText(value);

  return (
    cleaned.length >= 24 &&
    cleaned.length <= 600 &&
    !isNonCompanyText(normalizeText(cleaned)) &&
    !/^(menu|navigation|copyright|all rights reserved|privacy policy|利用規約|個人情報|お問い合わせ)$/i.test(
      cleaned,
    )
  );
}

function extractCompanyName(result: SearxngResult, hostname: string) {
  const title = result.title ?? "";
  const contentName = extractCompanyNameFromContent(result.content ?? "");

  if (contentName && !isGenericName(contentName)) {
    return contentName;
  }

  const cleaned = extractCompanyNameFromTitle(title);

  return cleaned || hostnameToName(hostname);
}

function extractCompanyNameFromContent(content: string) {
  const patterns = [
    /\b([A-Z][A-Za-z0-9&.' -]{1,50})は(?:19|20)\d{2}年設立/,
    /\b([A-Z][A-Za-z0-9&.' -]{1,50})は(?:ベトナム|日本|東京|大阪|IT|DX|AI|システム|ソフトウェア|オフショア)/,
    /\b([A-Z][A-Za-z0-9&.' -]{2,70})\s+is\s+(?:a|an)\s+(?:global\s+)?(?:it|software|technology|consulting|development|outsourcing)/i,
    /\b([A-Z][A-Za-z0-9&.' -]{2,70}(?:Co\.?\s*,?\s*Ltd\.?|Company Limited|Corporation|Corp\.?|JSC|Joint Stock Company|Ltd\.?|Inc\.?))\b/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    const name = cleanupSeedName(match?.[1] ?? "");

    if (name) {
      return name;
    }
  }

  return "";
}

function hostnameToName(hostname: string) {
  const parts = hostname.split(".");
  const base =
    parts.length >= 3 && ["co", "com", "ne", "or"].includes(parts.at(-2) ?? "")
      ? parts.at(-3)
      : parts.at(-2) ?? parts[0];

  return (base ?? hostname)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hasCompanySignals(text: string, request: SearchAnalyzeRequest) {
  const corporateSignal =
    /company|corporation|corp\.?|co\.?\s*ltd\.?|ltd\.?|inc\.?|jsc|joint stock|株式会社|有限会社|合同会社|会社概要|企業情報|事業内容|お問い合わせ|công ty|trách nhiệm hữu hạn|cổ phần/i.test(text);
  const serviceSignal =
    /software|development|consulting|solutions?|system|cloud|dx|ai|開発|システム|ソフトウェア|クラウド|サービス/i.test(text);
  const industrySignal = request.industry
    ? matchesSearchTerm(text, request.industry)
    : true;
  const locationSignal = request.location
    ? matchesSearchTerm(text, request.location)
    : true;

  return corporateSignal || (serviceSignal && (industrySignal || locationSignal));
}

function isBlockedHost(hostname: string) {
  const parts = hostname.split(".");

  return (
    BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname)) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    BLOCKED_HOST_PARTS.some((part) => parts.includes(part))
  );
}

function isBlockedPath(path: string) {
  return /\/(news|blog|blogs|article|articles|career|careers|job|jobs|recruit|press|event|events|school|course|courses|learn|learning|wiki)(\/|$)/i.test(
    path,
  );
}

function isNonCompanyText(text: string) {
  return /directory|ranking|list of|top \d+|marketplace|suppliers?|buyers?|news|article|blog|press release|government|portal|official gazette|school|course|learning|language lesson|tourism|travel guide|financial data|ownership details|key executives|wikipedia|求人|採用|ニュース|記事|一覧|ランキング|学校|講座|コース|レッスン|政府|ポータル|観光|旅行|tin tức|bao moi|học tiếng|khóa học|báo điện tử/i.test(
    text,
  );
}

function isGenericName(value: string) {
  const normalized = value.trim().toLowerCase();
  const exactGenericNames = new Set([
    "japan",
    "vietnam",
    "viet nam",
    "ベトナム",
    "日本",
    "会社",
    "企業",
    "開発",
  ]);

  if (exactGenericNames.has(normalized)) {
    return true;
  }

  return /gmail|google|wikipedia|youtube|facebook|linkedin|news|portal|directory|government|school|learning|course|company search|home|homepage|who we are|about us|visit|travel|tourism|ホーム|開発|tin tức|trusted tarot|知乎/i.test(
    value,
  );
}

function matchesSearchTerm(text: string, term: string) {
  const normalizedTerm = term.trim().toLowerCase();

  if (!normalizedTerm) {
    return true;
  }

  if (normalizedTerm === "it") {
    return /\bit\b|information technology|software|システム|ソフトウェア|情報技術/i.test(
      text,
    );
  }

  return text.includes(normalizedTerm);
}

function resolveUrlType(path: string): ResultEvidence["urlType"] {
  if (path === "" || path === "/") return "homepage";
  if (/^\/(en|ja|jp|vi|vn)\/?$/.test(path)) return "homepage";
  if (/\/(about|about-us|company|corporate|profile|overview|outline|info|information)([-_/]|$)/i.test(path)) {
    return "company_profile";
  }
  if (/会社概要|企業情報|会社案内|事業内容/.test(path)) {
    return "company_profile";
  }

  return "other";
}

function normalizeHostKey(value: string) {
  const url = safeUrl(value);
  return url ? normalizeHostname(url.hostname) : "";
}

function normalizeHostname(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^(www|m|en|jp|ja|global|corp|corporate)\./, "")
    .replace(/\.$/, "");
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSafePublicFetchUrl(value: string) {
  const url = safeUrl(value);

  if (!url || !["http:", "https:"].includes(url.protocol)) {
    return false;
  }

  const hostname = normalizeHostname(url.hostname);

  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname.endsWith(".local")
  ) {
    return false;
  }

  return true;
}

function decodePath(value: string) {
  try {
    return decodeURIComponent(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchTextTerms(text: string, terms: string[]) {
  return Array.from(
    new Set(
      terms
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
        .filter((term) => text.includes(term.toLowerCase())),
    ),
  );
}

function splitSentences(value: string) {
  return value
    .replace(/\s+/g, " ")
    .split(/[。.!?！？]\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasJapaneseText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}
