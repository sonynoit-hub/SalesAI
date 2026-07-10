import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import type {
  OpportunitySearchPlan,
  SearchIntent,
} from "@/lib/search-analysis/types";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

export async function buildOpportunitySearchPlan(
  request: SearchAnalyzeRequest,
): Promise<OpportunitySearchPlan> {
  try {
    return await analyzeInputWithOllama(request);
  } catch {
    return buildFallbackSearchPlan(request);
  }
}

async function analyzeInputWithOllama(request: SearchAnalyzeRequest) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
  const url = new URL("/api/chat", baseUrl);

  const prompt = [
    "You are a B2B sales search strategist.",
    "Analyze the user's opportunity description before web search.",
    "Return only valid JSON. Do not include markdown.",
    "If the location is Japan, use Japanese search terms.",
    "The target is prospect companies, not vendors, directories, reports, articles, or generic introduction pages.",
    "The searchTerms array is the exact keyword script that will be sent to web search.",
    "Always include the requested location, industry, company-page intent terms, and the user's opportunity keywords in searchTerms.",
    "Use excludeTerms only for terms that should be prefixed with '-' in the final search query.",
    "Also return searchIntent as structured filters. Separate company identity from operating location.",
    "Example: 'Vietnam company in IT industry in Tokyo' means companyIdentity=['Vietnamese','Vietnam-related'], operatingLocation=['Tokyo','Japan'], industry=['IT','software','system development'].",
    "",
    `Opportunity description: ${request.opportunityDescription}`,
    `Industry: ${request.industry}`,
    `Location: ${request.location}`,
    "",
    "JSON shape:",
    JSON.stringify({
      intentSummary: "string",
      targetCompanyProfile: "string",
      searchIntent: {
        companyIdentity: ["identity term"],
        operatingLocation: ["location term"],
        industry: ["industry term"],
        requiredEvidence: ["official website", "about page", "address"],
        exclude: ["jobs", "news", "directory"],
      },
      searchTerms: ["term 1", "term 2", "term 3", "term 4", "term 5"],
      excludeTerms: ["term 1", "term 2", "term 3"],
      signals: ["signal 1", "signal 2", "signal 3"],
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
        temperature: 0.1,
        num_predict: 320,
      },
    }),
    signal: AbortSignal.timeout(readTimeout("OLLAMA_PLANNER_TIMEOUT_MS", 6_000)),
  });

  if (!response.ok) {
    throw new Error(`Ollama search planning failed with ${response.status}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const parsed = JSON.parse(extractJson(data.message?.content ?? ""));

  return strengthenPlanForDirectSearch(request, normalizePlan({
    intentSummary: parsed.intentSummary,
    targetCompanyProfile: parsed.targetCompanyProfile,
    searchIntent: parsed.searchIntent,
    searchTerms: parsed.searchTerms,
    excludeTerms: parsed.excludeTerms,
    signals: parsed.signals,
  }));
}

export function buildFallbackSearchPlan(request: SearchAnalyzeRequest) {
  const targetsJapan = isJapanLocation(request.location);
  const searchIntent = buildFallbackSearchIntent(request);
  const inputTerms = extractInputTerms(request.opportunityDescription);
  const mappedTerms = targetsJapan
    ? mapJapaneseOpportunityTerms(request.opportunityDescription)
    : inputTerms;
  const searchTerms = Array.from(
    new Set([
      ...searchIntent.companyIdentity,
      ...searchIntent.operatingLocation,
      ...searchIntent.industry,
      ...searchIntent.requiredEvidence,
      ...mappedTerms,
      ...inputTerms,
    ]),
  )
    .filter(Boolean)
    .slice(0, 12);

  return strengthenPlanForDirectSearch(request, normalizePlan({
    intentSummary: targetsJapan
      ? `${request.opportunityDescription}に関連する営業機会`
      : `Sales opportunity related to ${request.opportunityDescription}`,
    targetCompanyProfile: targetsJapan
      ? `${localizeLocation(request.location)}の${localizeIndustry(request.industry)}企業`
      : `${request.industry} companies in ${request.location}`,
    searchIntent,
    searchTerms,
    excludeTerms: searchIntent.exclude,
    signals: searchTerms.slice(0, 5),
  }));
}

function normalizePlan(plan: Partial<OpportunitySearchPlan>): OpportunitySearchPlan {
  return {
    intentSummary: toText(plan.intentSummary, "Opportunity search"),
    targetCompanyProfile: toText(plan.targetCompanyProfile, "Target companies"),
    searchIntent: normalizeSearchIntent(plan.searchIntent),
    searchTerms: toList(plan.searchTerms).slice(0, 12),
    excludeTerms: toList(plan.excludeTerms).slice(0, 8),
    signals: toList(plan.signals).slice(0, 6),
  };
}

function strengthenPlanForDirectSearch(
  request: SearchAnalyzeRequest,
  plan: OpportunitySearchPlan,
) {
  const targetsJapan = isJapanLocation(request.location);
  const fallbackIntent = buildFallbackSearchIntent(request);
  const searchIntent = mergeSearchIntent(plan.searchIntent, fallbackIntent);
  const requiredTerms = targetsJapan
    ? [
        ...searchIntent.companyIdentity,
        ...searchIntent.operatingLocation,
        ...searchIntent.industry,
        ...searchIntent.requiredEvidence,
      ]
    : [
        ...searchIntent.companyIdentity,
        ...searchIntent.operatingLocation,
        ...searchIntent.industry,
        ...searchIntent.requiredEvidence,
      ];

  return {
    ...plan,
    searchIntent,
    searchTerms: uniqueTerms([...requiredTerms, ...plan.searchTerms]).slice(0, 12),
    excludeTerms: uniqueTerms([...plan.excludeTerms, ...searchIntent.exclude]).slice(0, 8),
  };
}

function buildFallbackSearchIntent(request: SearchAnalyzeRequest): SearchIntent {
  const targetsJapan = isJapanLocation(request.location);
  const description = request.opportunityDescription;

  return {
    companyIdentity: inferCompanyIdentity(description),
    operatingLocation: inferOperatingLocation(request.location, description),
    industry: inferIndustryTerms(request.industry, targetsJapan),
    requiredEvidence: targetsJapan
      ? ["会社概要", "公式サイト", "企業情報", "住所"]
      : ["company", "about us", "official website", "address"],
    exclude: targetsJapan
      ? ["求人", "採用", "ニュース", "記事", "レポート", "ディレクトリ"]
      : ["jobs", "news", "article", "report", "directory", "marketplace"],
  };
}

function normalizeSearchIntent(value: unknown): SearchIntent {
  if (!value || typeof value !== "object") {
    return {
      companyIdentity: [],
      operatingLocation: [],
      industry: [],
      requiredEvidence: [],
      exclude: [],
    };
  }

  const intent = value as Partial<SearchIntent>;

  return {
    companyIdentity: toList(intent.companyIdentity).slice(0, 8),
    operatingLocation: toList(intent.operatingLocation).slice(0, 8),
    industry: toList(intent.industry).slice(0, 8),
    requiredEvidence: toList(intent.requiredEvidence).slice(0, 8),
    exclude: toList(intent.exclude).slice(0, 8),
  };
}

function mergeSearchIntent(
  primary: SearchIntent,
  fallback: SearchIntent,
): SearchIntent {
  return {
    companyIdentity: uniqueTerms([
      ...fallback.companyIdentity,
      ...primary.companyIdentity,
    ]).slice(0, 8),
    operatingLocation: uniqueTerms([
      ...fallback.operatingLocation,
      ...primary.operatingLocation,
    ]).slice(0, 8),
    industry: uniqueTerms([...fallback.industry, ...primary.industry]).slice(0, 8),
    requiredEvidence: uniqueTerms([
      ...fallback.requiredEvidence,
      ...primary.requiredEvidence,
    ]).slice(0, 8),
    exclude: uniqueTerms([...fallback.exclude, ...primary.exclude]).slice(0, 8),
  };
}

function uniqueTerms(terms: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const term of terms) {
    const cleaned = term.trim();
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function toText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function extractInputTerms(value: string) {
  const stopwords = new Set([
    "and",
    "are",
    "for",
    "from",
    "have",
    "into",
    "on",
    "rely",
    "still",
    "that",
    "the",
    "with",
  ]);

  return value
    .split(/[\s,、。・/]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !stopwords.has(term.toLowerCase()))
    .slice(0, 6);
}

function inferCompanyIdentity(value: string) {
  const normalized = value.toLowerCase();
  const terms: string[] = [];

  if (/vietnam|viet nam|việt nam|ベトナム/i.test(value)) {
    terms.push(
      "ベトナム",
      "ベトナム系",
      "ベトナム企業",
      "Vietnam",
      "Vietnamese",
      "Vietnam-related",
    );
  }

  if (/日系|日本企業|japanese-owned|japan-owned/i.test(value)) {
    terms.push("日系", "日本企業", "Japanese");
  }

  if (/foreign-owned|foreign company|外資|外国/i.test(normalized)) {
    terms.push("外資系", "foreign-owned");
  }

  return uniqueTerms(terms);
}

function inferOperatingLocation(location: string, description: string) {
  const terms = [location];
  const combined = `${location} ${description}`;

  if (/tokyo|東京/i.test(combined)) {
    terms.push("東京", "Tokyo", "Japan");
  } else if (/japan|日本/i.test(combined)) {
    terms.push("日本", "Japan");
  }

  if (/osaka|大阪/i.test(combined)) {
    terms.push("大阪", "Osaka", "Japan");
  }

  if (/vietnam|viet nam|việt nam|ベトナム/i.test(location)) {
    terms.push("Vietnam", "ベトナム");
  }

  return uniqueTerms(terms);
}

function inferIndustryTerms(industry: string, targetsJapan: boolean) {
  const normalized = industry.toLowerCase();
  const terms = [targetsJapan ? localizeIndustry(industry) : industry];

  if (/\bit\b|software|system|システム|ソフト/i.test(normalized)) {
    terms.push(
      targetsJapan ? "IT企業" : "IT company",
      targetsJapan ? "システム開発" : "software",
      targetsJapan ? "ソフトウェア" : "system development",
    );
  }

  if (/manufactur|製造/i.test(normalized)) {
    terms.push(
      targetsJapan ? "製造業" : "manufacturing",
      targetsJapan ? "製造" : "manufacturer",
      targetsJapan ? "メーカー" : "factory",
    );
  }

  if (/logistics|物流/i.test(normalized)) {
    terms.push(targetsJapan ? "物流" : "logistics");
  }

  return uniqueTerms(terms);
}

function mapJapaneseOpportunityTerms(value: string) {
  const normalized = value.toLowerCase();
  const mappedTerms = [
    [/(manual|手作業|紙|paper)/i, ["手作業", "紙"]],
    [/(reporting|report|帳票|報告)/i, ["帳票", "報告書"]],
    [/(spreadsheet|excel|スプレッドシート|表計算)/i, ["Excel", "表計算"]],
    [/(inventory|stock|在庫)/i, ["在庫管理"]],
    [/(quality|qc|品質)/i, ["品質管理"]],
    [/(schedule|scheduling|production plan|生産計画|予定)/i, ["生産計画"]],
    [/(inspection|検査)/i, ["検査"]],
    [/(document|documentation|文書|書類)/i, ["文書管理"]],
    [/(workflow|業務フロー|ワークフロー)/i, ["業務フロー"]],
    [/(automation|自動化|効率化)/i, ["自動化", "効率化"]],
  ]
    .filter(([pattern]) => (pattern as RegExp).test(normalized))
    .flatMap(([, terms]) => terms as string[]);

  return Array.from(new Set(mappedTerms));
}

function localizeIndustry(industry: string) {
  const normalized = industry.toLowerCase();

  if (normalized.includes("manufactur")) return "製造業";
  if (normalized.includes("logistics")) return "物流";
  if (normalized.includes("construction")) return "建設業";
  if (normalized.includes("retail")) return "小売";

  return industry;
}

function localizeLocation(location: string) {
  return /japan/i.test(location) ? "日本" : location;
}

function isJapanLocation(location: string) {
  return /japan|日本|東京|大阪|名古屋|神奈川|埼玉|千葉|福岡|愛知|兵庫|京都/i.test(
    location,
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
