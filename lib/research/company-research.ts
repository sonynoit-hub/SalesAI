import * as cheerio from "cheerio";
import type { Company } from "@/lib/generated/prisma/client";

type CompanyForResearch = Pick<
  Company,
  "id" | "name" | "websiteUrl" | "industry" | "location" | "description"
>;

type PublicResearchPage = {
  url: string;
  title: string | null;
  description: string | null;
  content: string;
  success: boolean;
  error?: string;
};

type CompanyResearchDraft = {
  summary: string;
  productsOrServices: string[];
  targetCustomers: string[];
  painPoints: string[];
  salesOpportunities: string[];
  technologies: string[];
  recentSignals: string[];
  researchSources: string[];
  rawContent: {
    method: "public_website_fetch";
    pages: PublicResearchPage[];
  };
};

const FETCH_TIMEOUT_MS = 12_000;
const CONTENT_LIMIT = 5_000;

export async function buildCompanyResearchDraft(
  company: CompanyForResearch,
): Promise<CompanyResearchDraft> {
  const pages = await fetchCompanyPages(company.websiteUrl);
  const usablePages = pages.filter((page) => page.success && page.content.length > 0);
  const combinedContent = usablePages.map((page) => page.content).join(" ");
  const sources = usablePages.map((page) => page.url);
  const industry = company.industry ?? inferIndustry(combinedContent);
  const productsOrServices = inferProductsOrServices({
    content: combinedContent,
    fallbackIndustry: industry,
  });
  const targetCustomers = inferTargetCustomers(combinedContent);
  const painPoints = inferPainPoints(combinedContent);
  const salesOpportunities = inferSalesOpportunities({
    content: combinedContent,
    industry,
  });
  const technologies = inferTechnologies(combinedContent);
  const recentSignals = inferRecentSignals(combinedContent);

  return {
    summary: buildSummary({
      company,
      content: combinedContent,
      industry,
      pages: usablePages,
    }),
    productsOrServices,
    targetCustomers,
    painPoints,
    salesOpportunities,
    technologies,
    recentSignals,
    researchSources: sources.length > 0 ? sources : [company.websiteUrl].filter(Boolean),
    rawContent: {
      method: "public_website_fetch",
      pages,
    },
  };
}

async function fetchCompanyPages(websiteUrl: string | null) {
  if (!websiteUrl) {
    return [];
  }

  const urls = buildResearchUrls(websiteUrl);
  const pages = await Promise.all(urls.map(fetchPublicPage));
  const seen = new Set<string>();

  return pages.filter((page) => {
    if (seen.has(page.url)) return false;
    seen.add(page.url);
    return true;
  });
}

function buildResearchUrls(websiteUrl: string) {
  try {
    const homepage = new URL(websiteUrl);
    const origin = homepage.origin;

    return [
      homepage.toString(),
      new URL("/about", origin).toString(),
      new URL("/company", origin).toString(),
      new URL("/services", origin).toString(),
    ];
  } catch {
    return [websiteUrl];
  }
}

async function fetchPublicPage(url: string): Promise<PublicResearchPage> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "SalesAI local research bot; public website fetch",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        url,
        title: null,
        description: null,
        content: "",
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, svg, nav, footer, header, form").remove();

    const title = normalizeText($("title").first().text()) || null;
    const description =
      normalizeText($('meta[name="description"]').attr("content") ?? "") || null;
    const mainText = extractReadableText($).slice(0, CONTENT_LIMIT);

    return {
      url: response.url || url,
      title,
      description,
      content: mainText,
      success: mainText.length >= 80,
      ...(mainText.length >= 80 ? {} : { error: "Page content was too short." }),
    };
  } catch (error) {
    return {
      url,
      title: null,
      description: null,
      content: "",
      success: false,
      error: error instanceof Error ? error.message : "Page fetch failed.",
    };
  }
}

function buildSummary({
  company,
  content,
  industry,
  pages,
}: {
  company: CompanyForResearch;
  content: string;
  industry: string | null;
  pages: PublicResearchPage[];
}) {
  const pageDescription = pages.find((page) => page.description)?.description;
  const extractedSentence = firstUsefulSentence(content);
  const location = company.location ? ` in ${company.location}` : "";
  const profile = industry ? `${industry} company${location}` : `company${location}`;
  const evidence = pageDescription ?? extractedSentence ?? company.description;

  if (evidence) {
    return `${company.name} appears to be a ${profile}. ${evidence}`;
  }

  return `${company.name} appears to be a ${profile}. Public website content was limited, so validate the business fit before outreach.`;
}

function inferIndustry(content: string) {
  const matches = [
    ["manufacturing", "製造業"],
    ["software", "ソフトウェア"],
    ["cloud", "テクノロジー"],
    ["logistics", "物流"],
    ["construction", "建設業"],
    ["healthcare", "ヘルスケア"],
    ["retail", "小売"],
    ["finance", "金融サービス"],
  ] as const;

  return matches.find(([keyword]) => includesAny(content, [keyword]))?.[1] ?? null;
}

function inferProductsOrServices({
  content,
  fallbackIndustry,
}: {
  content: string;
  fallbackIndustry: string | null;
}) {
  const values = [
    includesAny(content, ["consulting", "advisory"]) ? "Consulting" : null,
    includesAny(content, ["software", "platform", "system"]) ? "Software or systems" : null,
    includesAny(content, ["manufacturing", "factory", "production"])
      ? "Manufacturing services"
      : null,
    includesAny(content, ["logistics", "delivery", "warehouse"])
      ? "Logistics or operations"
      : null,
    includesAny(content, ["support", "maintenance"]) ? "Support services" : null,
  ].filter((value): value is string => Boolean(value));

  return unique(values.length > 0 ? values : [fallbackIndustry ?? "Business services"]);
}

function inferTargetCustomers(content: string) {
  const values = [
    includesAny(content, ["enterprise", "corporate", "business"]) ? "Business customers" : null,
    includesAny(content, ["manufacturer", "factory", "industrial"])
      ? "Industrial customers"
      : null,
    includesAny(content, ["consumer", "retail", "customer"]) ? "End customers" : null,
    includesAny(content, ["government", "municipal", "public sector"])
      ? "Public sector customers"
      : null,
  ].filter((value): value is string => Boolean(value));

  return unique(values.length > 0 ? values : ["B2B customers"]);
}

function inferPainPoints(content: string) {
  const values = [
    includesAny(content, ["manual", "paper", "spreadsheet", "excel"])
      ? "Manual or spreadsheet-heavy workflows may be costly to maintain."
      : null,
    includesAny(content, ["quality", "inspection", "compliance"])
      ? "Quality and compliance processes may need reliable tracking."
      : null,
    includesAny(content, ["delivery", "logistics", "supply"])
      ? "Operational visibility across delivery or supply processes may matter."
      : null,
    includesAny(content, ["customer support", "inquiry", "contact"])
      ? "Customer inquiry handling may benefit from better workflow automation."
      : null,
  ].filter((value): value is string => Boolean(value));

  return unique(
    values.length > 0
      ? values
      : [
          "Operational processes should be checked for manual handoffs.",
          "Customer follow-up and internal task tracking may be inconsistent.",
        ],
  );
}

function inferSalesOpportunities({
  content,
  industry,
}: {
  content: string;
  industry: string | null;
}) {
  const values = [
    includesAny(content, ["manual", "paper", "spreadsheet", "excel"])
      ? "Propose replacing manual tracking with a lightweight workflow system."
      : null,
    includesAny(content, ["quality", "inspection", "compliance"])
      ? "Lead with quality, audit trail, and reporting improvements."
      : null,
    includesAny(content, ["customer", "support", "inquiry"])
      ? "Offer better customer inquiry and follow-up management."
      : null,
    industry
      ? `Frame the first conversation around practical IT improvements for ${industry.toLowerCase()}.`
      : null,
  ].filter((value): value is string => Boolean(value));

  return unique(
    values.length > 0
      ? values
      : [
          "Start with a short workflow review.",
          "Offer a small automation or cloud process improvement.",
        ],
  );
}

function inferTechnologies(content: string) {
  const values = [
    includesAny(content, ["salesforce"]) ? "Salesforce" : null,
    includesAny(content, ["microsoft", "office 365", "excel"]) ? "Microsoft stack" : null,
    includesAny(content, ["aws", "amazon web services"]) ? "AWS" : null,
    includesAny(content, ["google workspace", "gmail"]) ? "Google Workspace" : null,
    includesAny(content, ["wordpress"]) ? "WordPress" : null,
  ].filter((value): value is string => Boolean(value));

  return unique(values);
}

function inferRecentSignals(content: string) {
  const currentYear = new Date().getFullYear();
  const signals = [
    includesAny(content, ["news", "press release", "announcement"])
      ? "Website includes news or announcement content."
      : null,
    includesAny(content, [String(currentYear), String(currentYear - 1)])
      ? "Website includes recent dated content."
      : null,
    includesAny(content, ["recruit", "hiring", "career"])
      ? "Hiring or careers content may signal active operations."
      : null,
  ].filter((value): value is string => Boolean(value));

  return unique(signals);
}

function firstUsefulSentence(content: string) {
  return content
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length >= 50 && sentence.length <= 260);
}

function includesAny(content: string, terms: string[]) {
  const normalized = content.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractReadableText($: cheerio.CheerioAPI) {
  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const parts = root
    .find("h1, h2, h3, p, li, dt, dd")
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter((value) => value.length > 0);

  return normalizeText(parts.length > 0 ? parts.join(". ") : root.text());
}

function unique(values: string[]) {
  return Array.from(new Set(values)).slice(0, 6);
}
