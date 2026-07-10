import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import type {
  AnalysisStrategy,
  CrawledPage,
  OpportunityResult,
} from "@/lib/search-analysis/types";
import { ollamaAnalysisSchema } from "@/lib/search-analysis/schemas";
import type { SearxngResult } from "@/lib/search-analysis/search";
import {
  briefDescription,
  buildSalesCompanyBrief,
} from "@/lib/search-analysis/sales-brief";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

export async function analyzeWithOllama({
  request,
  searchResults,
  crawledPages,
}: {
  request: SearchAnalyzeRequest;
  searchResults: SearxngResult[];
  crawledPages: CrawledPage[];
}) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
  const url = new URL("/api/chat", baseUrl);

  const prompt = [
    "You are a B2B IT sales opportunity analyst.",
    "Analyze public search results and crawled website content to identify specific prospect companies.",
    "The user sells to companies, so every result must be a real company prospect, not a directory, article, agency listing, search page, government page, generic introduction page, or marketplace page.",
    "Use only the provided candidate IDs. Do not invent companies, URLs, or sources.",
    "Only return candidates whose URL is an official homepage, about page, company profile page, corporate page, or company overview page.",
    "If the target location is Japan, return all human-readable JSON values in Japanese. Use the Japanese company name when available.",
    "Prefer official company websites, company profile pages, and corporate pages.",
    "Return only valid JSON. Do not include markdown.",
    "",
    `Opportunity description: ${request.opportunityDescription}`,
    `Industry: ${request.industry}`,
    `Location: ${request.location}`,
    "",
    "Search results:",
    JSON.stringify(
      searchResults.map((result, index) => ({
        candidateId: `candidate-${index + 1}`,
        title: result.title,
        url: result.url,
        content: result.content,
        engine: result.engine,
      })),
      null,
      2,
    ),
    "",
    "Crawled company website content:",
    JSON.stringify(
      crawledPages.map((page) => ({
        url: page.url,
        title: page.title,
        content: page.content,
      })),
      null,
      2,
    ),
    "",
    "JSON shape:",
    JSON.stringify({
      strategy: {
        objective: "string",
        signals: ["string"],
        sources: ["string"],
        confidence: "High | Medium | Low",
      },
      results: [
        {
          companyName: "string",
          candidateId: "candidate id from the search results",
          aiOpportunity: "string",
          whyThisMatches: ["string"],
          industry: "string",
          location: "string",
          employees: "string",
        },
      ],
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
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      options: {
        temperature: 0.2,
        num_predict: 900,
      },
    }),
    signal: AbortSignal.timeout(readTimeout("OLLAMA_ANALYSIS_TIMEOUT_MS", 25_000)),
  });

  if (!response.ok) {
    throw new Error(`Ollama analysis failed with ${response.status}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const json = extractJson(data.message?.content ?? "");
  return ollamaAnalysisSchema.parse(JSON.parse(json));
}

export function buildFallbackAnalysis({
  request,
  searchResults,
  crawledPages = [],
}: {
  request: SearchAnalyzeRequest;
  searchResults: SearxngResult[];
  crawledPages?: CrawledPage[];
}) {
  const normalized = request.opportunityDescription.toLowerCase();
  const targetsJapan = isJapanLocation(request.location);
  const mentionsManual =
    /manual|手作業|紙|reporting|report|帳票|報告/.test(normalized);
  const mentionsSpreadsheet =
    /spreadsheet|excel|スプレッドシート|表計算/.test(normalized);
  const opportunitySignals = buildOpportunitySignals(request.opportunityDescription);

  const strategy: AnalysisStrategy = {
    objective: targetsJapan
      ? `${request.location}の${request.industry}企業の中から、業務自動化の導入余地がありそうな具体的な見込み企業を探す。`
      : `Find ${request.industry.toLowerCase()} companies in ${request.location} that are likely to benefit from workflow automation.`,
    signals: targetsJapan
      ? [
          opportunitySignals[0] ?? (mentionsManual ? "手作業の帳票・報告業務" : "手作業業務の可能性"),
          opportunitySignals[1] ?? (mentionsSpreadsheet ? "Excel中心の業務運用" : "表計算ベースの業務プロセス"),
          "定期的な報告業務",
          "複数部門にまたがる業務",
          "古い問い合わせ・業務プロセス",
        ]
      : [
          mentionsManual ? "Manual documentation" : "Manual workflow signals",
          mentionsSpreadsheet ? "Excel-based operations" : "Spreadsheet-heavy process",
          "Repeated reporting",
          "Multiple departments",
          "Outdated inquiry process",
        ],
    sources: [
      crawledPages.length > 0
        ? targetsJapan
          ? "クロールした企業Webサイト"
          : "Crawled company websites"
        : targetsJapan
          ? "企業Webサイト"
          : "Company website",
      targetsJapan ? "公開企業情報" : "Public directories",
      targetsJapan ? "検索エンジン" : "Search engine",
    ],
    confidence: mentionsManual || mentionsSpreadsheet ? "High" : "Medium",
  };

  const results: OpportunityResult[] = searchResults
    .slice(0, request.resultLimit)
    .map((result, index) => {
      const page = crawledPages.find((item) => item.url === result.url);
      const companyName = resolveCompanyName(result, index);
      const salesBrief = buildSalesCompanyBrief({
        companyName,
        crawledPage: page,
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
        aiOpportunity: targetsJapan
          ? `${request.industry}向けの${opportunitySignals[0] ?? "業務自動化"}改善`
          : `${request.industry} workflow automation opportunity`,
        evidence: result.evidence,
        whyThisMatches: targetsJapan
          ? [
              page
                ? "企業Webサイトの内容から候補として抽出"
                : "営業機会の説明をもとに検索結果から抽出",
              opportunitySignals[0]
                ? `入力内容「${opportunitySignals[0]}」に関連`
                : mentionsManual
                  ? "手作業の報告業務ニーズと一致"
                  : "繰り返し業務が存在する可能性",
              opportunitySignals[1]
                ? `入力内容「${opportunitySignals[1]}」に関連`
                : mentionsSpreadsheet
                  ? "Excel中心の業務改善ニーズと一致"
                  : "業務プロセス自動化の確認余地あり",
            ]
          : [
              page
                ? "Matched through crawled company website content"
                : "Found through opportunity-expanded public search",
              mentionsManual
                ? "Matches manual reporting signal"
                : "May have repeated operational workflows",
              mentionsSpreadsheet
                ? "Matches spreadsheet-heavy operations signal"
                : "Potential fit for process automation review",
            ],
      };
    });

  return { strategy, results };
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

function resolveCompanyName(result: SearxngResult, index: number) {
  const title = result.title ?? "";
  const content = result.content ?? "";
  const titleCandidate = cleanTitle(title);
  const explicitCompany =
    extractCompanyName(titleCandidate) ??
    extractCompanyName(title) ??
    extractCompanyName(content);

  if (explicitCompany) {
    return explicitCompany;
  }

  if (titleCandidate && !isGenericPageTitle(titleCandidate)) {
    return titleCandidate;
  }

  return companyNameFromUrl(result.url ?? "") ?? `Company ${index + 1}`;
}

function extractCompanyName(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const japaneseMatch = normalized.match(
    /(?:株式会社|有限会社|合同会社)\s?[^\s｜|、。;；:：\-–—]{2,30}|[^\s｜|、。;；:：\-–—]{2,30}\s?(?:株式会社|有限会社|合同会社)/,
  );

  if (japaneseMatch) {
    return japaneseMatch[0]
      .replace(/^(商号|社名|会社名)\s*[:：]\s*/, "")
      .replace(/\s+/g, "")
      .trim();
  }

  const englishMatch = normalized.match(
    /[A-Z][A-Za-z0-9&.,'() -]{2,70}\s(?:Co\.?,?\s*Ltd\.?|Company Limited|Corporation|Corp\.?|JSC|Joint Stock Company|Ltd\.?|Inc\.?)/,
  );

  return englishMatch?.[0]
    .replace(/^(商号|社名|会社名)\s*[:：]\s*/, "")
    .replace(/^(About Us|Company Profile|Corporate Profile)\s*/i, "")
    .trim();
}

function readTimeout(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function cleanTitle(title: string) {
  const parts = title
    .split(/\s*[|｜\-–—:：]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  const companyPart =
    parts.find((part) => /株式会社|有限会社|合同会社/.test(part)) ??
    parts.find((part) => !isGenericPageTitle(part)) ??
    title;

  return companyPart
    .replace(/\s*(official site|home|homepage|公式サイト).*$/i, "")
    .trim();
}

function isGenericPageTitle(value: string) {
  const trimmed = value.trim();

  return (
    /^(会社概要|企業情報|会社情報|ご挨拶|営業所|工場|about|about us|company|company profile|corporate|corporate profile|profile|overview)$/i.test(
      trimmed,
    ) ||
    /^top\s.+\s(manufacturer|supplier|factory)/i.test(trimmed) ||
    (/本社|第\d工場|工場|営業所|事業所/.test(trimmed) && trimmed.length < 24)
  );
}

function companyNameFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    const name = hostname
      .replace(/\.co\.jp$/i, "")
      .replace(/\.ne\.jp$/i, "")
      .replace(/\.or\.jp$/i, "")
      .replace(/\.jp$/i, "")
      .replace(/\.com$/i, "");

    return name || undefined;
  } catch {
    return undefined;
  }
}

function isJapanLocation(location: string) {
  return /japan|日本|東京|大阪|名古屋|神奈川|埼玉|千葉|福岡|愛知|兵庫|京都/i.test(
    location,
  );
}

function buildOpportunitySignals(value: string) {
  const normalized = value.toLowerCase();
  const signals = [
    [/(manual|手作業|紙)/i, "手作業プロセス"],
    [/(reporting|report|帳票|報告)/i, "帳票・報告業務"],
    [/(spreadsheet|excel|スプレッドシート|表計算)/i, "Excel・表計算運用"],
    [/(inventory|stock|在庫)/i, "在庫管理"],
    [/(quality|qc|品質)/i, "品質管理"],
    [/(schedule|scheduling|production plan|生産計画|予定)/i, "生産計画"],
    [/(inspection|検査)/i, "検査業務"],
    [/(document|documentation|文書|書類)/i, "文書管理"],
    [/(workflow|業務フロー|ワークフロー)/i, "業務フロー"],
    [/(automation|自動化|効率化)/i, "自動化・効率化"],
  ]
    .filter(([pattern]) => (pattern as RegExp).test(normalized))
    .map(([, label]) => label as string);

  return Array.from(new Set(signals));
}
