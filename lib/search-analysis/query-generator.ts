import { z } from "zod";
import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import type { OpportunitySearchPlan } from "@/lib/search-analysis/types";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

export type SearchQueryStrategy = {
  targetCompanyProfile: string;
  searchAngles: string[];
  searchQueries: string[];
  excludeTerms: string[];
  searchPlan: OpportunitySearchPlan;
};

const queryStrategySchema = z.object({
  targetCompanyProfile: z.string().trim().min(1).max(500),
  searchAngles: z.array(z.string().trim().min(1).max(240)).min(5).max(15),
  searchQueries: z.array(z.string().trim().min(1).max(300)).min(8).max(20),
  excludeTerms: z.array(z.string().trim().min(1).max(80)).max(12),
});

export async function generateSearchQueryStrategy(
  request: SearchAnalyzeRequest,
): Promise<SearchQueryStrategy> {
  if (process.env.AI_PROVIDER === "disabled") {
    return normalizeStrategy(request, buildFallbackStrategy(request));
  }

  try {
    return normalizeStrategy(request, await generateWithOllama(request));
  } catch {
    return normalizeStrategy(request, buildFallbackStrategy(request));
  }
}

async function generateWithOllama(request: SearchAnalyzeRequest) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
  const url = new URL("/api/chat", baseUrl);
  const prompt = [
    "You are a B2B lead-search strategist.",
    "The user gives a reference keyword and a target number of company candidates.",
    "Create diverse search angles and exact web search queries that can find different real prospect companies.",
    "Prospects must be company websites, company profile pages, or official corporate pages.",
    "Avoid directories, job boards, news articles, reports, marketplaces, and vendor articles.",
    "If the target is Japan or the keyword is Japanese, include Japanese queries and Japanese exclude keywords.",
    "Return only valid JSON. Do not include markdown.",
    "",
    `Reference keyword: ${request.referenceKeyword}`,
    `Target company candidates: ${request.targetCompanyCount}`,
    `Industry filter: ${request.industry || "optional"}`,
    `Location filter: ${request.location || "optional"}`,
    `Exclude keywords: ${request.excludeKeywords.join(", ") || "none"}`,
    "",
    "JSON shape:",
    JSON.stringify({
      targetCompanyProfile: "string",
      searchAngles: ["angle"],
      searchQueries: ["exact query"],
      excludeTerms: ["term"],
    }),
  ].join("\n");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
      options: {
        temperature: 0.25,
        num_predict: 900,
      },
    }),
    signal: AbortSignal.timeout(readTimeout("OLLAMA_QUERY_GENERATOR_TIMEOUT_MS", 10_000)),
  });

  if (!response.ok) {
    throw new Error(`Ollama query generation failed with ${response.status}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  return queryStrategySchema.parse(JSON.parse(extractJson(data.message?.content ?? "")));
}

function buildFallbackStrategy(request: SearchAnalyzeRequest) {
  const reference = request.referenceKeyword;
  const industry = request.industry;
  const location = request.location;
  const context = [reference, industry, location].filter(Boolean).join(" ");
  const targetsJapan = /japan|日本|東京|大阪|製造|会社|企業/i.test(context);
  const profile = [industry || "target", "companies", location].filter(Boolean).join(" ");
  const excludeTerms = uniqueTerms([
    ...request.excludeKeywords,
    ...(targetsJapan
      ? ["求人", "採用", "ニュース", "記事", "ディレクトリ"]
      : ["jobs", "careers", "news", "article", "directory", "marketplace"]),
  ]);
  const angles = targetsJapan
    ? [
        `${reference} 会社概要`,
        `${reference} 企業情報`,
        `${reference} 業務改善`,
        `${reference} DX`,
        `${reference} Excel`,
        `${reference} 生産管理`,
        `${reference} 品質管理`,
        `${reference} 問い合わせ`,
        `${reference} 公式サイト`,
      ]
    : [
        `${reference} company profile`,
        `${reference} official website`,
        `${reference} workflow pain`,
        `${reference} spreadsheet operations`,
        `${reference} process automation`,
        `${reference} quality management`,
        `${reference} operations management`,
        `${reference} customer inquiry workflow`,
        `${reference} about us`,
      ];
  const queries = angles.map((angle) =>
    [
      angle,
      industry,
      location,
      targetsJapan ? "会社概要 OR 企業情報" : "company OR about",
      ...excludeTerms.map((term) => `-${term}`),
    ]
      .filter(Boolean)
      .join(" "),
  );

  return {
    targetCompanyProfile: profile,
    searchAngles: angles,
    searchQueries: queries,
    excludeTerms,
  };
}

function normalizeStrategy(
  request: SearchAnalyzeRequest,
  strategy: z.infer<typeof queryStrategySchema>,
): SearchQueryStrategy {
  const excludeTerms = uniqueTerms([
    ...strategy.excludeTerms,
    ...request.excludeKeywords,
  ]).slice(0, 12);
  const searchQueries = uniqueTerms(strategy.searchQueries)
    .map((query) => appendExclusions(query, excludeTerms))
    .slice(0, 20);
  const searchAngles = uniqueTerms(strategy.searchAngles).slice(0, 15);
  const targetCompanyProfile =
    strategy.targetCompanyProfile ||
    [request.industry || "Target", "companies", request.location].filter(Boolean).join(" ");

  return {
    targetCompanyProfile,
    searchAngles,
    searchQueries,
    excludeTerms,
    searchPlan: {
      intentSummary: request.referenceKeyword,
      targetCompanyProfile,
      searchIntent: {
        companyIdentity: [request.referenceKeyword],
        operatingLocation: request.location ? [request.location] : [],
        industry: request.industry ? [request.industry] : [],
        requiredEvidence: ["official website", "company profile", "about page"],
        exclude: excludeTerms,
      },
      searchTerms: searchAngles.slice(0, 12),
      excludeTerms,
      signals: searchAngles.slice(0, 6),
    },
  };
}

function appendExclusions(query: string, excludeTerms: string[]) {
  const lowerQuery = query.toLowerCase();
  const missingExclusions = excludeTerms
    .filter((term) => !lowerQuery.includes(`-${term.toLowerCase()}`))
    .map((term) => `-${term}`);

  return [query, ...missingExclusions].join(" ").trim();
}

function uniqueTerms(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Ollama did not return JSON");
}

function readTimeout(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
