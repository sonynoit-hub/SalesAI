import { analyzeWithOllama, buildFallbackAnalysis } from "@/lib/search-analysis/analyze";
import { crawlCandidatePagesWithDiagnostics } from "@/lib/search-analysis/crawl4ai";
import { buildOpportunitySearchPlan } from "@/lib/search-analysis/planner";
import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import {
  buildSearchQueries,
  refineSearchResultsWithEvidence,
  runSearchPipeline,
} from "@/lib/search-analysis/search";
import {
  briefDescription,
  buildSalesCompanyBrief,
} from "@/lib/search-analysis/sales-brief";
import { applyDatabaseStatuses } from "@/lib/search-analysis/store";
import type { SearxngResult } from "@/lib/search-analysis/search";
import type {
  CrawledPage,
  OpportunitySearchPlan,
  OpportunityResult,
  SearchAnalyzeResponse,
} from "@/lib/search-analysis/types";

export async function runLeadSearchAnalysis(
  request: SearchAnalyzeRequest,
  options?: {
    searchPlan?: OpportunitySearchPlan;
    searchQueries?: string[];
  },
): Promise<SearchAnalyzeResponse> {
  const startedAt = Date.now();
  const searchPlan = options?.searchPlan ?? await buildOpportunitySearchPlan(request);
  const resultLimit = request.resultLimit;
  const searchQueries =
    options?.searchQueries ??
    buildSearchQueries({
      ...request,
      searchPlan,
    });
  const searchPipeline = await runSearchPipeline(searchQueries, {
    ...request,
    searchPlan,
  });
  const candidateResults = searchPipeline.results;
  const crawlResult = await crawlCandidatePagesWithDiagnostics(candidateResults, {
    limit: Math.min(5, Math.max(3, resultLimit)),
  });
  const crawledPages = crawlResult.pages;
  const refinement = refineSearchResultsWithEvidence({
    crawledPages,
    request: {
      ...request,
      searchPlan,
    },
    results: candidateResults,
  });
  const searchResults = refinement.results;

  let usedFallbackAnalysis = searchResults.length === 0;
  let analysis: Pick<SearchAnalyzeResponse, "strategy" | "results">;

  if (searchResults.length === 0) {
    analysis = buildFallbackAnalysis({
      request,
      searchResults,
      crawledPages,
    });
  } else {
    const fallbackAnalysis = buildFallbackAnalysis({
      request,
      searchResults,
      crawledPages,
    });

    try {
      const ollamaAnalysis = await analyzeWithOllama({
        request,
        searchResults,
        crawledPages,
      });

      const usedUrls = new Set<string>();
      const results = ollamaAnalysis.results.slice(0, resultLimit).flatMap((result, index) => {
        const candidateIndex = Number(result.candidateId.replace("candidate-", "")) - 1;
        const searchResult =
          Number.isInteger(candidateIndex) && candidateIndex >= 0
            ? searchResults[candidateIndex]
            : searchResults[index];
        const crawledPage = crawledPages.find((page) => page.url === searchResult?.url);

        if (!searchResult?.url) {
          return [];
        }

        usedUrls.add(searchResult.url);
        const salesBrief = buildSalesCompanyBrief({
          companyName: result.companyName,
          crawledPage,
          result: searchResult,
          request,
        });

        return [{
          id: `live-${index + 1}`,
          companyName: result.companyName,
          websiteUrl: searchResult.url,
          aboutUrl:
            searchResult.aboutUrl ??
            (searchResult.evidence?.urlType === "about" ||
            searchResult.evidence?.urlType === "company_profile"
              ? searchResult.url
              : undefined),
          description: briefDescription(salesBrief),
          salesBrief,
          source: searchResult?.engine ?? "searxng",
          location: result.location,
          employees: result.employees,
          industry: result.industry,
          aiOpportunity: result.aiOpportunity,
          whyThisMatches: result.whyThisMatches,
          evidence: searchResult.evidence,
        }];
      });
      const filledResults = fillVerifiedResults({
        crawledPages,
        request,
        resultLimit: resultPoolLimit(resultLimit),
        results,
        searchResults,
        usedUrls,
      });

      if (filledResults.length > 0) {
        analysis = {
          strategy: ollamaAnalysis.strategy,
          results: filledResults,
        };
      } else {
        usedFallbackAnalysis = true;
        analysis = fallbackAnalysis;
      }
    } catch {
      usedFallbackAnalysis = true;
      analysis = {
        ...fallbackAnalysis,
        results: fillVerifiedResults({
          crawledPages,
          request,
          resultLimit: resultPoolLimit(resultLimit),
          results: fallbackAnalysis.results,
          searchResults,
          usedUrls: new Set(fallbackAnalysis.results.map((result) => result.websiteUrl)),
        }),
      };
    }
  }

  const databaseAwareResults = await applyDatabaseStatuses(analysis.results);
  const finalResults = prioritizeDatabaseResults(databaseAwareResults).slice(0, resultLimit);

  return {
    ...analysis,
    results: finalResults,
    meta: {
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      diagnostics: {
        requested: resultLimit,
        rawResults: searchPipeline.diagnostics.rawResults,
        officialCandidates: searchPipeline.diagnostics.officialCandidates,
        crawlAttempted: crawlResult.diagnostics.attempted,
        crawledPages: crawledPages.length,
        crawlFailed: crawlResult.diagnostics.failed,
        crawlFiltered: crawlResult.diagnostics.filtered,
        crawlError: crawlResult.diagnostics.error,
        passedEvidence: refinement.diagnostics.passedEvidence,
        removedByEvidence: refinement.diagnostics.removedByEvidence,
        finalShown: finalResults.length,
      },
      searchQueries,
      searchPlan,
      candidateNames: searchPipeline.candidateNames,
      officialLookupQueries: searchPipeline.officialLookupQueries,
      crawledPages: crawledPages.length,
      resultLimit,
      usedFallbackAnalysis,
    },
  };
}

function prioritizeDatabaseResults(results: OpportunityResult[]) {
  const order = {
    new: 0,
    seen: 1,
    saved: 2,
  };

  return [...results].sort(
    (a, b) =>
      order[a.databaseStatus?.state ?? "new"] -
      order[b.databaseStatus?.state ?? "new"],
  );
}

function resultPoolLimit(resultLimit: number) {
  return Math.max(resultLimit, resultLimit * 3);
}

function fillVerifiedResults({
  crawledPages,
  request,
  resultLimit,
  results,
  searchResults,
  usedUrls,
}: {
  crawledPages: CrawledPage[];
  request: SearchAnalyzeRequest;
  resultLimit: number;
  results: OpportunityResult[];
  searchResults: SearxngResult[];
  usedUrls: Set<string>;
}) {
  return [
    ...results,
    ...searchResults
      .filter((result) => result.url && !usedUrls.has(result.url))
      .map((result, index) =>
        buildVerifiedOpportunityResult({
          crawledPages,
          index: results.length + index,
          result,
          request,
        }),
      ),
  ].slice(0, resultLimit);
}

function buildVerifiedOpportunityResult({
  crawledPages,
  index,
  request,
  result,
}: {
  crawledPages: CrawledPage[];
  index: number;
  request: {
    industry: string;
    location: string;
    opportunityDescription: string;
  };
  result: SearxngResult;
}): OpportunityResult {
  const crawledPage = crawledPages.find((page) => page.url === result.url);
  const companyName = resolveResultCompanyName(result, index);
  const salesBrief = buildSalesCompanyBrief({
    companyName,
    crawledPage,
    result,
    request,
  });

  return {
    id: `live-${index + 1}`,
    companyName,
    websiteUrl: result.url ?? "",
    aboutUrl:
      result.aboutUrl ??
      (result.evidence?.urlType === "about" ||
      result.evidence?.urlType === "company_profile"
        ? result.url
        : undefined),
    description: briefDescription(salesBrief),
    salesBrief,
    source: result.engine ?? "searxng",
    location: request.location,
    employees: "Unknown",
    industry: request.industry,
    aiOpportunity: salesBrief.salesAngle,
    whyThisMatches:
      result.evidence?.passed.length
        ? result.evidence.passed
        : ["Verified company website matched the search intent."],
    evidence: result.evidence,
  };
}

function resolveResultCompanyName(result: SearxngResult, index: number) {
  const title = result.title ?? "";
  const titlePart = title
    .replace(/\b(about us|company profile|corporate profile|official website|home)\b/gi, "")
    .replace(/会社概要|企業情報|公式サイト/g, "")
    .split(/\s*[|｜\-–—:：]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .find(Boolean);

  if (titlePart) return titlePart;

  try {
    return new URL(result.url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return `Company ${index + 1}`;
  }
}
