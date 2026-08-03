import * as cheerio from "cheerio";
import type { Company } from "@/lib/generated/prisma/client";
import { formatIndustryJa } from "@/lib/industries";

export type CompanyForEnrichment = Pick<
  Company,
  | "id"
  | "name"
  | "websiteUrl"
  | "description"
  | "industry"
  | "location"
  | "primaryEmail"
  | "contactFormUrl"
>;

export type CompanyEnrichmentDraft = {
  description?: string;
  industry?: string;
  location?: string;
  primaryEmail?: string;
  contactFormUrl?: string;
  personEmails: string[];
  sources: string[];
  diagnostics: string[];
};

type FetchedPage = {
  url: string;
  html: string;
  success: boolean;
  error?: string;
};

const FETCH_TIMEOUT_MS = 12_000;
const GENERIC_EMAIL_PREFIXES = new Set([
  "admin",
  "contact",
  "hello",
  "info",
  "inquiry",
  "mail",
  "office",
  "sales",
  "support",
]);

export async function buildCompanyEnrichmentDraft(
  company: CompanyForEnrichment,
): Promise<CompanyEnrichmentDraft> {
  const urls = buildEnrichmentUrls(company.websiteUrl);
  const pages = await Promise.all(urls.map(fetchPublicPage));
  const usablePages = pages.filter((page) => page.success);
  const diagnostics = pages
    .filter((page) => !page.success)
    .map((page) => `${page.url}: ${page.error ?? "Fetch failed"}`);

  const pageSignals = usablePages.map(extractPageSignals);
  const combinedText = pageSignals
    .flatMap((signals) => [
      signals.description,
      signals.h1,
      ...signals.paragraphs,
    ])
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const emails = unique(pageSignals.flatMap((signals) => signals.emails));
  const contactLinks = unique(pageSignals.flatMap((signals) => signals.contactLinks));
  const contactFormUrl =
    pageSignals.find((signals) => signals.hasContactForm)?.url ?? contactLinks[0];
  const primaryEmail = emails.find(isGenericCompanyEmail) ?? emails[0];
  const personEmails = emails.filter((email) => !isGenericCompanyEmail(email));
  const description =
    pageSignals.find((signals) => signals.description)?.description ??
    firstUsefulSentence(combinedText);

  return {
    description,
    industry: inferIndustry(combinedText),
    location: inferLocation(combinedText),
    primaryEmail,
    contactFormUrl,
    personEmails,
    sources: usablePages.map((page) => page.url),
    diagnostics,
  };
}

export function buildCompanyEnrichmentUpdate({
  company,
  draft,
}: {
  company: CompanyForEnrichment;
  draft: CompanyEnrichmentDraft;
}) {
  return {
    description: company.description || draft.description || undefined,
    industry: company.industry || (draft.industry ? formatIndustryJa(draft.industry) : undefined),
    location: company.location || draft.location || undefined,
    primaryEmail: company.primaryEmail || draft.primaryEmail || undefined,
    contactFormUrl: company.contactFormUrl || draft.contactFormUrl || undefined,
  };
}

export function isGenericCompanyEmail(email: string) {
  const prefix = email.split("@")[0]?.toLowerCase().replace(/[.+_-].*$/, "");
  return Boolean(prefix && GENERIC_EMAIL_PREFIXES.has(prefix));
}

function buildEnrichmentUrls(websiteUrl: string) {
  try {
    const homepage = new URL(websiteUrl);
    const origin = homepage.origin;

    return unique([
      homepage.toString(),
      new URL("/contact", origin).toString(),
      new URL("/contact-us", origin).toString(),
      new URL("/inquiry", origin).toString(),
      new URL("/about", origin).toString(),
      new URL("/company", origin).toString(),
      new URL("/会社概要", origin).toString(),
      new URL("/お問い合わせ", origin).toString(),
    ]);
  } catch {
    return [websiteUrl];
  }
}

async function fetchPublicPage(url: string): Promise<FetchedPage> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "SalesAI local enrichment bot; public website fetch",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        url,
        html: "",
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html")) {
      return {
        url,
        html: "",
        success: false,
        error: "Response was not HTML.",
      };
    }

    return {
      url: response.url || url,
      html: await response.text(),
      success: true,
    };
  } catch (error) {
    return {
      url,
      html: "",
      success: false,
      error: error instanceof Error ? error.message : "Page fetch failed.",
    };
  }
}

function extractPageSignals(page: FetchedPage) {
  const $ = cheerio.load(page.html);
  const description = cleanText(
    $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      "",
  );
  const h1 = cleanText($("h1").first().text());
  const paragraphs = $("p")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter((text) => text.length >= 40)
    .slice(0, 5);
  const rootText = $.root().text();
  const emails = extractEmails(`${rootText} ${page.html}`);
  const contactLinks = $("a")
    .toArray()
    .map((element) => $(element).attr("href") ?? "")
    .map((href) => normalizeHref(href, page.url))
    .filter((href): href is string => Boolean(href))
    .filter(isLikelyContactUrl)
    .slice(0, 8);
  const hasContactForm = $("form").toArray().some((element) => {
    const formDescriptor = [
      $(element).text(),
      $(element).attr("action"),
      $(element).attr("id"),
      $(element).attr("class"),
      $(element)
        .find("input, textarea, select, button")
        .toArray()
        .map((field) =>
          [
            $(field).attr("name"),
            $(field).attr("id"),
            $(field).attr("type"),
            $(field).attr("placeholder"),
            $(field).attr("aria-label"),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" "),
    ]
      .filter(Boolean)
      .join(" ");

    return isLikelyContactText(formDescriptor);
  });

  return {
    url: page.url,
    description,
    h1,
    paragraphs,
    emails,
    contactLinks,
    hasContactForm,
  };
}

function extractEmails(content: string) {
  const matches = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];

  return unique(
    matches
      .map((email) => email.toLowerCase())
      .map((email) => email.replace(/^mailto:/, ""))
      .filter((email) => !email.endsWith(".png"))
      .filter((email) => !email.endsWith(".jpg"))
      .filter((email) => !email.includes("@example."))
      .filter((email) => !email.includes("@sentry."))
      .filter((email) => !email.includes("@2x.")),
  );
}

function normalizeHref(href: string, baseUrl: string) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
    return null;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLikelyContactUrl(url: string) {
  return /contact|inquiry|support|office|otoiawase|お問い合わせ|問合|相談/i.test(url);
}

function isLikelyContactText(text: string) {
  return /contact|inquiry|email|message|相談|お問い合わせ|問合|メール/i.test(text);
}

function inferIndustry(content: string) {
  const text = content.toLowerCase();
  const matches = [
    ["manufacturing", "製造業"],
    ["factory", "製造業"],
    ["software", "ソフトウェア"],
    ["system development", "ソフトウェア"],
    ["cloud", "テクノロジー"],
    ["ai", "テクノロジー"],
    ["logistics", "物流"],
    ["construction", "建設業"],
    ["healthcare", "ヘルスケア"],
    ["retail", "小売"],
    ["finance", "金融サービス"],
    ["システム開発", "ソフトウェア"],
    ["製造", "製造業"],
    ["物流", "物流"],
  ] as const;

  return matches.find(([keyword]) => text.includes(keyword))?.[1];
}

function inferLocation(content: string) {
  const matches = [
    "Tokyo",
    "Osaka",
    "Kyoto",
    "Nagoya",
    "Fukuoka",
    "Yokohama",
    "Saitama",
    "Chiba",
    "東京",
    "大阪",
    "京都",
    "名古屋",
    "福岡",
    "横浜",
    "埼玉",
    "千葉",
  ];

  return matches.find((location) => content.includes(location));
}

function firstUsefulSentence(content: string) {
  return cleanText(content)
    .split(/(?<=[.!?。！？])\s+/)
    .find((sentence) => sentence.length >= 60 && sentence.length <= 280);
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}
