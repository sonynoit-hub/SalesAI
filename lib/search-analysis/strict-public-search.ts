import * as cheerio from "cheerio";
import { prisma } from "@/lib/db/prisma";
import { SearchGoalStatus } from "@/lib/generated/prisma/client";
import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import { generateSearchQueryStrategy } from "@/lib/search-analysis/query-generator";
import {
  expandJapanMemorySourcingQueries,
  shouldUseJapanMemorySourcingPlaybook,
} from "@/lib/search-analysis/playbooks/japan-memory-sourcing";
import { scoreSupplierEvidence } from "@/lib/search-analysis/supplier-evidence";
import {
  applyDatabaseStatuses,
  getKnownCompanyDomainKeys,
  saveSearchRunToDatabase,
} from "@/lib/search-analysis/store";
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
const HOMEPAGE_VERIFY_TIMEOUT_MS = 3_500;
const CONTACT_PAGE_VERIFY_LIMIT = 8;
const HOMEPAGE_ENRICH_CONCURRENCY = 6;
const STRICT_SEARCH_ATTEMPTS = 3;

export async function runStrictPublicCompanySearchGoal(
  request: SearchAnalyzeRequest,
): Promise<SearchAnalyzeResponse> {
  const response = await runStrictPublicCompanySearch(request);
  const status =
    response.results.length >= request.resultLimit
      ? SearchGoalStatus.COMPLETED
      : response.results.length > 0
        ? SearchGoalStatus.PARTIAL
        : SearchGoalStatus.FAILED;

  try {
    const searchGoal = await prisma.searchGoal.create({
      data: {
        opportunityDescription: request.opportunityDescription,
        referenceKeyword: request.referenceKeyword,
        industry: request.industry,
        location: request.location,
        excludeKeywords: request.excludeKeywords,
        generatedAngles: response.meta.searchPlan.searchTerms,
        generatedQueries: response.meta.searchQueries,
        targetCompanyCount: request.resultLimit,
        foundCompanyCount: response.results.length,
        attemptCount: response.meta.attemptCount ?? STRICT_SEARCH_ATTEMPTS,
        status,
        diagnostics: {
          diagnostics: response.meta.diagnostics,
          candidateNames: response.meta.candidateNames,
          officialLookupQueries: response.meta.officialLookupQueries,
        },
      },
    });

    await saveSearchRunToDatabase({
      request,
      run: response,
      searchGoalId: searchGoal.id,
      queryUsed: response.meta.searchQueries.join("\n"),
    });

    return {
      ...response,
      meta: {
        ...response.meta,
        searchGoal: {
          id: searchGoal.id,
          status: searchGoal.status,
          referenceKeyword:
            searchGoal.referenceKeyword ?? searchGoal.opportunityDescription,
          generatedAngles: searchGoal.generatedAngles,
          generatedQueries: searchGoal.generatedQueries,
          targetCompanyCount: searchGoal.targetCompanyCount,
          foundCompanyCount: searchGoal.foundCompanyCount,
          attemptCount: searchGoal.attemptCount,
          maxAttempts: STRICT_SEARCH_ATTEMPTS,
        },
      },
    };
  } catch {
    return response;
  }
}

export async function runStrictPublicCompanySearch(
  request: SearchAnalyzeRequest,
): Promise<SearchAnalyzeResponse> {
  const startedAt = Date.now();
  const queryStrategy = await generateSearchQueryStrategy(request);
  const searchPlan = mergeSearchPlans(
    queryStrategy.searchPlan,
    buildStrictSearchPlan(request),
  );
  const searchQueries = buildHybridSearchQueries(request, queryStrategy.searchQueries);
  const knownDomainKeys = await getKnownCompanyDomainKeys();
  const resultByCompanyKey = new Map<string, OpportunityResult>();
  let rawResultsTotal = 0;
  let officialCandidatesTotal = 0;
  let crawlAttemptedTotal = 0;
  let crawledPagesTotal = 0;
  let crawlFailedTotal = 0;
  const crawlFilteredTotal = 0;
  let passedEvidenceTotal = 0;
  let removedByEvidenceTotal = 0;
  let skippedKnownDomainsTotal = 0;
  let sawSearchFailure = false;
  let attemptsCompleted = 0;

  for (let attempt = 1; attempt <= STRICT_SEARCH_ATTEMPTS; attempt += 1) {
    if (resultByCompanyKey.size >= request.resultLimit) {
      break;
    }

    attemptsCompleted = attempt;

    const attemptQueries = selectAttemptQueries(
      searchQueries,
      attempt,
      STRICT_SEARCH_ATTEMPTS,
    );
    const settled = await searchQueriesInBatches(
      attemptQueries,
      STRICT_SEARCH_BATCH_SIZE,
      strictSearchPageCount(request.resultLimit),
    );
    const failed = settled.filter((result) => result.status === "rejected");
    const attemptResults = settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );

    rawResultsTotal += attemptResults.length;
    sawSearchFailure =
      sawSearchFailure || (attemptResults.length === 0 && failed.length === settled.length);

    const verified = verifyHomepageCandidates(attemptResults, request).slice(
      0,
      verifiedCandidateLimit(request.resultLimit),
    );
    officialCandidatesTotal += verified.length;
    const enrichment = await enrichHomepageCandidates(verified, request);
    crawlAttemptedTotal += verified.length;
    crawledPagesTotal += enrichment.verifiedCount;
    crawlFailedTotal += enrichment.failedCount;
    passedEvidenceTotal += enrichment.candidates.length;
    removedByEvidenceTotal += Math.max(0, verified.length - enrichment.candidates.length);

    const enriched = enrichment.candidates;
    for (const candidate of enriched) {
      const result = toOpportunityResult(candidate, request, resultByCompanyKey.size);
      const key = result.websiteUrl ? normalizeHostKey(result.websiteUrl) : "";

      if (!key || resultByCompanyKey.has(key)) {
        continue;
      }

      if (knownDomainKeys.has(key)) {
        skippedKnownDomainsTotal += 1;
        continue;
      }

      resultByCompanyKey.set(key, result);
    }
  }

  if (resultByCompanyKey.size === 0 && sawSearchFailure) {
    throw new Error(
      "Public web search is unavailable. Start SearXNG on 127.0.0.1:8080 and try again.",
    );
  }

  const results = await applyDatabaseStatuses(
    prioritizeStrictResults(Array.from(resultByCompanyKey.values())).slice(
      0,
      request.resultLimit,
    ),
  );

  return {
    strategy: {
      objective: searchPlan.intentSummary,
      signals: uniqueStrings([
        ...searchPlan.signals,
        ...searchPlan.searchTerms,
      ]).slice(0, 8),
      sources: [
        "Ollama query expansion",
        "SearXNG public web search",
        "Strict homepage verification",
      ],
      confidence: results.length > 0 ? "Medium" : "Low",
    },
    results,
    meta: {
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      diagnostics: {
        requested: request.resultLimit,
        rawResults: rawResultsTotal,
        officialCandidates: officialCandidatesTotal,
        crawlAttempted: crawlAttemptedTotal,
        crawledPages: crawledPagesTotal,
        crawlFailed: crawlFailedTotal,
        crawlFiltered: crawlFilteredTotal,
        passedEvidence: passedEvidenceTotal,
        removedByEvidence: removedByEvidenceTotal,
        skippedKnownDomains: skippedKnownDomainsTotal,
        finalShown: results.length,
      },
      searchQueries,
      searchPlan,
      candidateNames: results.map((candidate) => candidate.companyName),
      officialLookupQueries: searchQueries,
      crawledPages: crawledPagesTotal,
      resultLimit: request.resultLimit,
      usedFallbackAnalysis: false,
      attemptCount: attemptsCompleted,
      maxAttempts: STRICT_SEARCH_ATTEMPTS,
    },
  };
}

function buildHybridSearchQueries(
  request: SearchAnalyzeRequest,
  ollamaQueries: string[],
) {
  return uniqueStrings([
    ...ollamaQueries,
    ...buildStrictSearchQueries(request),
  ]).slice(0, strictQueryLimit(request.resultLimit));
}

function strictQueryLimit(resultLimit: number) {
  return Math.min(120, Math.max(resultLimit * 3, 30));
}

function strictSearchPageCount(resultLimit: number) {
  if (resultLimit <= 20) return 1;
  if (resultLimit <= 60) return 2;
  return 3;
}

function verifiedCandidateLimit(resultLimit: number) {
  return Math.min(220, Math.max(resultLimit * 3, 45));
}

function mergeSearchPlans(
  primary: OpportunitySearchPlan,
  fallback: OpportunitySearchPlan,
): OpportunitySearchPlan {
  return {
    intentSummary: primary.intentSummary || fallback.intentSummary,
    targetCompanyProfile: primary.targetCompanyProfile || fallback.targetCompanyProfile,
    searchIntent: {
      companyIdentity: uniqueStrings([
        ...fallback.searchIntent.companyIdentity,
        ...primary.searchIntent.companyIdentity,
      ]).slice(0, 8),
      operatingLocation: uniqueStrings([
        ...fallback.searchIntent.operatingLocation,
        ...primary.searchIntent.operatingLocation,
      ]).slice(0, 8),
      industry: uniqueStrings([
        ...fallback.searchIntent.industry,
        ...primary.searchIntent.industry,
      ]).slice(0, 8),
      requiredEvidence: uniqueStrings([
        ...fallback.searchIntent.requiredEvidence,
        ...primary.searchIntent.requiredEvidence,
      ]).slice(0, 8),
      exclude: uniqueStrings([
        ...fallback.searchIntent.exclude,
        ...primary.searchIntent.exclude,
      ]).slice(0, 8),
    },
    searchTerms: uniqueStrings([
      ...fallback.searchTerms,
      ...primary.searchTerms,
    ]).slice(0, 12),
    excludeTerms: uniqueStrings([
      ...fallback.excludeTerms,
      ...primary.excludeTerms,
    ]).slice(0, 12),
    signals: uniqueStrings([...fallback.signals, ...primary.signals]).slice(0, 8),
  };
}

function selectAttemptQueries(
  queries: string[],
  attempt: number,
  maxAttempts: number,
) {
  const groupSize = Math.max(4, Math.ceil(queries.length / maxAttempts));
  const start = (attempt - 1) * groupSize;
  const selected = queries.slice(start, start + groupSize);

  return selected.length > 0 ? selected : queries.slice(0, groupSize);
}

function prioritizeStrictResults(results: OpportunityResult[]) {
  const order = {
    new: 0,
    seen: 1,
    saved: 2,
  } as const;
  const contactOrder = {
    High: 0,
    Medium: 1,
    Low: 2,
  } as const;

  return [...results].sort(
    (left, right) => {
      const leftFit = left.evidence?.supplierFitScore ?? 0;
      const rightFit = right.evidence?.supplierFitScore ?? 0;

      if (leftFit !== rightFit) {
        return rightFit - leftFit;
      }

      const leftContact = contactOrder[left.outreachChannelConfidence ?? "Low"];
      const rightContact = contactOrder[right.outreachChannelConfidence ?? "Low"];

      if (leftContact !== rightContact) {
        return leftContact - rightContact;
      }

      return (
        order[left.databaseStatus?.state ?? "new"] -
        order[right.databaseStatus?.state ?? "new"]
      );
    },
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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

async function searchQueriesInBatches(
  queries: string[],
  batchSize: number,
  pageCount: number,
) {
  const settled: PromiseSettledResult<SearxngResult[]>[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    for (let index = 0; index < queries.length; index += batchSize) {
      const batch = queries.slice(index, index + batchSize);
      const batchSettled = await Promise.allSettled(
        batch.map((query) => searchSearxng(query, page)),
      );
      settled.push(...batchSettled);
    }
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

  const sourcing = shouldUseJapanMemorySourcingPlaybook(request);
  const supplierEvidence = scoreSupplierEvidence(text);

  if (sourcing && !supplierEvidence.looksLikeSupplier) {
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
    supplierEvidenceText: text,
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
  const sourcing = shouldUseJapanMemorySourcingPlaybook(request);
  const terms = [
    request.referenceKeyword,
    request.industry,
    request.location,
  ].filter(Boolean);

  return {
    intentSummary: sourcing
      ? `${request.referenceKeyword}（日本のITAD・PCリユース・中古パーツ供給者探索）`
      : request.referenceKeyword,
    targetCompanyProfile: sourcing
      ? "日本のITAD・PCリユース・中古PCパーツ供給企業"
      : terms.join(" "),
    searchIntent: {
      companyIdentity: sourcing
        ? ["ITAD", "PCリユース", "中古パーツ", "中古メモリ", request.referenceKeyword]
        : [request.referenceKeyword],
      operatingLocation: request.location ? [request.location] : [],
      industry: request.industry ? [request.industry] : [],
      requiredEvidence: sourcing
        ? ["法人買取", "データ消去", "リユース", "中古パーツ", "部品販売"]
        : ["official homepage", "company profile", "about page"],
      exclude: sourcing
        ? [
            ...request.excludeKeywords,
            "求人",
            "採用",
            "ニュース",
            "記事",
            "ランキング",
            "比較サイト",
            "家電量販",
            "ヤマダ",
            "ヨドバシ",
            "Amazon",
            "楽天",
          ]
        : request.excludeKeywords,
    },
    searchTerms: sourcing
      ? ["ITAD", "PCリユース", "法人PC買取", "データ消去", "中古パーツ", "中古メモリ"]
      : terms,
    excludeTerms: sourcing
      ? [
          ...request.excludeKeywords,
          "求人",
          "採用",
          "ニュース",
          "記事",
          "ランキング",
          "比較サイト",
          "家電量販",
          "Amazon",
          "楽天",
        ]
      : request.excludeKeywords,
    signals: sourcing
      ? ["ITAD", "PCリユース", "法人買取", "中古パーツ", "データ消去"]
      : ["official homepage", "company profile", "about page"],
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

  if (targetsVietnamIt) {
    return [
      `vietnam software development company japan official website ${excludeQuery}`,
      `vietnam offshore development company japan official website ${excludeQuery}`,
      `ベトナム オフショア開発 会社概要 日本 ${excludeQuery} -求人 -ニュース -一覧`,
      `ベトナム IT企業 会社概要 日本 ${excludeQuery} -求人 -ニュース -一覧`,
    ].map((query) => query.replace(/\s+/g, " ").trim());
  }

  if (
    shouldUseJapanMemorySourcingPlaybook({
      referenceKeyword: request.referenceKeyword,
      opportunityDescription: request.opportunityDescription,
      location: request.location,
      searchRole: request.searchRole,
    })
  ) {
    return expandJapanMemorySourcingQueries({
      location: request.location || "日本",
      industry: request.industry,
      limit: 10,
    }).map((query) =>
      `${query} ${excludeQuery}`.replace(/\s+/g, " ").trim(),
    );
  }

  return [];
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

function toOpportunityResult(
  candidate: VerifiedHomepage,
  request: SearchAnalyzeRequest,
  index: number,
): OpportunityResult {
  const sourcing = shouldUseJapanMemorySourcingPlaybook(request);
  const salesBrief: SalesCompanyBrief = {
    businessSummary: candidate.overview,
    locationEvidence: request.location || "Public homepage candidate",
    industryEvidence: request.industry || "Public homepage candidate",
    identityEvidence: candidate.evidence.matchedSupplierSignals?.length
      ? `供給シグナル: ${candidate.evidence.matchedSupplierSignals.join(", ")}`
      : undefined,
    likelyNeed: sourcing
      ? "中古メモリ・PCパーツの在庫や法人PC買取品からの供給可否を確認する価値があります。"
      : `${request.industry || "Business"} workflow fit should be reviewed after saving.`,
    salesAngle: sourcing
      ? `${candidate.companyName}に、中古メモリ・PCパーツの在庫、リースアップ品、サーバ部品の取扱い有無を確認します。`
      : `Review ${candidate.companyName} as a saved lead from public web search.`,
    contactNextStep: sourcing
      ? "問い合わせ窓口から、DDR系メモリや中古PC/サーバ部品の在庫確認メールを送れるか確認します。"
      : "Open the homepage and confirm the contact page before outreach.",
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
    whyThisMatches: sourcing
      ? [
          ...candidate.evidence.passed,
          ...(candidate.evidence.matchedSupplierSignals?.length
            ? [`Supplier signals: ${candidate.evidence.matchedSupplierSignals.join(", ")}`]
            : []),
        ]
      : candidate.evidence.passed,
    evidence: candidate.evidence,
  };
}

function buildEvidence({
  hostname,
  request,
  supplierEvidenceText,
  text,
  urlType,
}: {
  hostname: string;
  request: SearchAnalyzeRequest;
  supplierEvidenceText: string;
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
  const sourcing = shouldUseJapanMemorySourcingPlaybook(request);
  const supplierEvidence = sourcing
    ? scoreSupplierEvidence(supplierEvidenceText)
    : undefined;

  return {
    passed: [
      "Verified company homepage candidate",
      `Homepage domain: ${hostname}`,
      urlType === "homepage" ? "Root homepage URL" : "Company profile/about page found",
      ...(supplierEvidence?.matchedSellSide.length
        ? [`Supplier fit: ${supplierEvidence.matchedSellSide.join(", ")}`]
        : []),
    ],
    missing: supplierEvidence && !supplierEvidence.looksLikeSupplier
      ? ["ITAD / PC reuse / used parts supplier signal"]
      : [],
    urlType,
    matchedIdentity: [],
    matchedLocation,
    matchedIndustry,
    matchedOfficial,
    supplierFitScore: supplierEvidence?.score,
    matchedSupplierSignals: supplierEvidence?.matchedSellSide,
    matchedNoiseSignals: supplierEvidence?.matchedNoise,
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
    const name = cleanupCompanyName(match?.[1] ?? "");

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
  if (shouldUseJapanMemorySourcingPlaybook(request)) {
    const supplierEvidence = scoreSupplierEvidence(text);
    if (supplierEvidence.looksLikeSupplier) {
      return true;
    }
  }

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
