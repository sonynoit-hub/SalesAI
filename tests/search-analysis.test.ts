import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFallbackAnalysis } from "@/lib/search-analysis/analyze";
import { buildFallbackSearchPlan } from "@/lib/search-analysis/planner";
import {
  buildSearchQueries,
  refineSearchResultsWithEvidence,
} from "@/lib/search-analysis/search";
import { buildSalesCompanyBrief } from "@/lib/search-analysis/sales-brief";
import {
  chooseVerifiedCompanyName,
  chooseVerifiedOverview,
  extractHomepageVerification,
  verifyHomepageCandidates,
} from "@/lib/search-analysis/strict-public-search";
import {
  searchAnalyzeRequestSchema,
  type SearchAnalyzeRequest,
} from "@/lib/search-analysis/schemas";
import type { SearxngResult } from "@/lib/search-analysis/search";

const vietnamItTokyoRequest: SearchAnalyzeRequest = {
  referenceKeyword: "ベトナム企業 IT 東京",
  opportunityDescription: "ベトナム企業 IT 東京",
  industry: "IT",
  location: "東京",
  searchRole: "auto",
  excludeKeywords: ["求人", "採用", "ニュース"],
  targetCompanyCount: 5,
  resultLimit: 5,
};

describe("search planning fixtures", () => {
  it("defaults target company count to 20 when omitted", () => {
    const parsed = searchAnalyzeRequestSchema.parse({
      referenceKeyword: "automation",
      industry: "IT",
      location: "Tokyo",
    });

    assert.equal(parsed.targetCompanyCount, 20);
    assert.equal(parsed.resultLimit, 20);
  });

  it("builds Japanese queries with identity, location, industry, and official-page terms", () => {
    const searchPlan = buildFallbackSearchPlan(vietnamItTokyoRequest);
    const queries = buildSearchQueries({
      ...vietnamItTokyoRequest,
      searchPlan,
    });
    const joined = queries.join(" ");

    assert.match(joined, /ベトナム/);
    assert.match(joined, /東京|Tokyo/);
    assert.match(joined, /IT|システム開発|ソフトウェア/);
    assert.match(joined, /会社概要|公式サイト|company profile|official website/);
    assert.ok(
      queries.some((query) => query.includes("site:.jp") || query.includes("site:.co.jp")),
      "expected a Japan-domain query",
    );
    assert.ok(
      queries.every((query) => query.includes("-求人") && query.includes("-採用")),
      "expected Japanese job/recruiting exclusions",
    );
  });
});

describe("evidence filtering fixtures", () => {
  it("uses homepage metadata to improve company name and overview", () => {
    const verification = extractHomepageVerification(
      `
        <html>
          <head>
            <title>Paracel Japan株式会社 | AIとオフショア開発</title>
            <meta name="description" content="Paracel Japan株式会社は、ベトナムの開発体制を活用してAI、システム開発、DX支援を提供するIT企業です。" />
          </head>
          <body>
            <h1>Paracel Japan株式会社</h1>
            <p>豊富なリソースで、次の競争領域へ踏み出すための推進力を提供します。</p>
          </body>
        </html>
      `,
      "https://paracel-japan.jp/",
    );

    assert.equal(
      chooseVerifiedCompanyName("Paracel", verification),
      "Paracel Japan株式会社",
    );
    assert.equal(
      chooseVerifiedOverview("short fallback", verification, vietnamItTokyoRequest),
      "Paracel Japan株式会社は、ベトナムの開発体制を活用してAI、システム開発、DX支援を提供するIT企業です。",
    );

    const gntVerification = extractHomepageVerification(
      `<html><head><meta property="og:site_name" content="GNT_Web" /></head></html>`,
      "https://www.gnt.co.jp/",
    );

    assert.equal(chooseVerifiedCompanyName("GNT", gntVerification), "GNT");
  });

  it("extracts public email and contact form signals from homepage markup", () => {
    const verification = extractHomepageVerification(
      `
        <html>
          <head>
            <title>Example Systems</title>
            <meta name="description" content="Example Systems provides IT consulting and software development." />
          </head>
          <body>
            <a href="mailto:info@example-systems.co.jp">Email</a>
            <a href="/contact/">お問い合わせ</a>
            <form action="/contact/confirm">
              <input name="company" />
              <input name="email" />
              <textarea name="message">お問い合わせ内容</textarea>
            </form>
          </body>
        </html>
      `,
      "https://example-systems.co.jp/",
    );

    assert.deepEqual(verification.emails, ["info@example-systems.co.jp"]);
    assert.deepEqual(verification.contactLinks, [
      "https://example-systems.co.jp/contact/",
    ]);
    assert.equal(verification.hasContactForm, true);
  });

  it("detects contact forms from field labels when the form has little visible text", () => {
    const verification = extractHomepageVerification(
      `
        <html>
          <head><title>Quiet Contact Form</title></head>
          <body>
            <a href="/inquiry">Contact us</a>
            <form id="lead-form">
              <input name="your-email" type="email" />
              <input name="company_name" />
              <textarea name="inquiry_content" placeholder="How can we help?" />
              <button type="submit">Send</button>
            </form>
          </body>
        </html>
      `,
      "https://quiet-form.example.jp/",
    );

    assert.deepEqual(verification.contactLinks, [
      "https://quiet-form.example.jp/inquiry",
    ]);
    assert.equal(verification.hasContactForm, true);
  });

  it("strict public search keeps only real company homepage candidates", () => {
    const results: SearxngResult[] = [
      {
        title: "Company Profile - VTI Japan",
        url: "https://vtijapan.co.jp/company-data",
        content:
          "VTI Japan is a Vietnam-connected IT company in Tokyo providing software development, DX, cloud, and AI services.",
        engine: "fixture",
      },
      {
        title: "Gmail for Work",
        url: "https://www.google.co.jp/gmail/about/for-work/",
        content: "Gmail business email from Google Workspace.",
        engine: "fixture",
      },
      {
        title: "Tin tức, tin nhanh 24h Việt Nam và thế giới",
        url: "https://vietnamnet.vn/",
        content: "Tin tức mới nhất, báo điện tử, media portal.",
        engine: "fixture",
      },
      {
        title: "Online Vietnamese lessons",
        url: "https://vietcafe-learning.com/",
        content: "Language school, learning course, Vietnamese lessons.",
        engine: "fixture",
      },
      {
        title: "Visit Vietnam",
        url: "https://vietnam.travel/",
        content: "Discover Vietnam through the official tourism website and travel guide.",
        engine: "fixture",
      },
      {
        title: "Tokyo Tech Lab Vietnam Joint Stock Company",
        url: "https://www.emis.com/php/company-profile/VN/tokyo-tech-lab.html",
        content:
          "Report with financial data, key executives contacts, ownership details and more.",
        engine: "fixture",
      },
      {
        title: "Tokyo Tech Lab Vietnam",
        url: "https://enosisoutsourcing.com/profile/tokyo-tech-lab-vietnam",
        content:
          "Outsourcing directory profile for Tokyo Tech Lab Vietnam with company data.",
        engine: "fixture",
      },
      {
        title: "TOKYO CONSULTING CO., LTD (VIETNAM)",
        url: "https://sgpgrid.com/company/tokyo-consulting-co-ltd-vietnam-ID0000",
        content:
          "Company directory profile with professional services and company information.",
        engine: "fixture",
      },
      {
        title: "日本 | ベトナムオフショア開発",
        url: "https://www.gnt.co.jp/",
        content: "GNTは2000年設立でベトナムオフショア開発のエキスパート集団です。ITサービスを提供する会社です。",
        engine: "fixture",
      },
    ];

    const verified = verifyHomepageCandidates(results, vietnamItTokyoRequest);

    assert.deepEqual(
      verified.map((result) => result.homepageUrl),
      ["https://vtijapan.co.jp/", "https://www.gnt.co.jp/"],
    );
    assert.equal(verified[0]?.originalUrl, "https://vtijapan.co.jp/company-data");
    assert.equal(verified[1]?.companyName, "GNT");
  });

  it("keeps official Vietnam-connected IT company pages and removes directories/articles", () => {
    const searchPlan = buildFallbackSearchPlan(vietnamItTokyoRequest);
    const results: SearxngResult[] = [
      {
        title: "会社概要 - 株式会社VTIジャパン",
        url: "https://vtijapan.co.jp/company-data",
        content:
          "株式会社VTIジャパンはベトナム発のIT企業です。東京を含む日本でソフトウェア開発、AI、DXを支援します。",
        engine: "fixture",
      },
      {
        title: "NAL JAPAN 会社概要",
        url: "https://nal.co.jp/company",
        content:
          "NAL JAPANは日本品質とベトナム開発力でシステム開発、DX、AI活用を支援する会社です。",
        engine: "fixture",
      },
      {
        title: "ベトナム IT企業 一覧",
        url: "https://example-directory.test/vietnam-it-list",
        content: "ベトナム IT企業の一覧、ランキング、ニュース記事です。",
        engine: "fixture",
      },
      {
        title: "ベトナム - Wikipedia",
        url: "https://ja.wikipedia.org/wiki/%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0",
        content: "ベトナムの概要を説明する百科事典ページです。",
        engine: "fixture",
      },
    ];

    const refinement = refineSearchResultsWithEvidence({
      results,
      crawledPages: [],
      request: {
        ...vietnamItTokyoRequest,
        searchPlan,
      },
    });

    const urls = refinement.results.map((result) => result.url);

    assert.ok(urls.includes("https://vtijapan.co.jp/"));
    assert.ok(urls.includes("https://nal.co.jp/"));
    assert.ok(!urls.includes("https://example-directory.test/vietnam-it-list"));
    assert.ok(!urls.includes("https://ja.wikipedia.org/wiki/%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0"));
  });

  it("canonicalizes accepted company profile pages to homepages and rejects government portals", () => {
    const searchPlan = buildFallbackSearchPlan(vietnamItTokyoRequest);
    const results: SearxngResult[] = [
      {
        title: "Viet Nam Government Portal",
        url: "https://vietnam.gov.vn/",
        content:
          "Viet Nam provides aid and government announcements from the national portal.",
        engine: "fixture",
      },
      {
        title: "Company Profile - Example Vietnam IT Co., Ltd.",
        url: "https://example-vietnam-it.com.vn/company/profile",
        content:
          "Example Vietnam IT Co., Ltd. is a Vietnam software development company serving customers in Tokyo and Japan.",
        engine: "fixture",
      },
      {
        title: "Vietnam IT Companies Directory",
        url: "https://directory.example.test/company/example-vietnam-it",
        content: "Directory listing, suppliers, buyers, company list, marketplace.",
        engine: "fixture",
      },
    ];

    const refinement = refineSearchResultsWithEvidence({
      results,
      crawledPages: [],
      request: {
        ...vietnamItTokyoRequest,
        searchPlan,
      },
    });

    assert.deepEqual(
      refinement.results.map((result) => result.url),
      ["https://example-vietnam-it.com.vn/"],
    );
    assert.equal(
      refinement.results[0]?.aboutUrl,
      "https://example-vietnam-it.com.vn/company/profile",
    );
  });

  it("keeps a larger verified pool than the requested final count", () => {
    const request = {
      ...vietnamItTokyoRequest,
      resultLimit: 3,
    };
    const searchPlan = buildFallbackSearchPlan(request);
    const officialResults: SearxngResult[] = Array.from({ length: 7 }, (_, index) => ({
      title: `会社概要 - Vietnam IT Company ${index + 1}`,
      url: `https://vietnam-it-${index + 1}.co.jp/company`,
      content:
        "ベトナム関連のIT企業として日本でソフトウェア開発、システム開発、AI、DXを支援します。東京の顧客にも対応します。",
      engine: "fixture",
    }));
    const removedResults: SearxngResult[] = [
      {
        title: "ベトナム IT企業 求人",
        url: "https://jobs.example.test/vietnam-it",
        content: "求人、採用、ニュース記事です。",
        engine: "fixture",
      },
      {
        title: "ベトナム IT企業 一覧",
        url: "https://directory.example.test/list",
        content: "一覧、ランキング、ディレクトリ記事です。",
        engine: "fixture",
      },
    ];

    const refinement = refineSearchResultsWithEvidence({
      results: [...officialResults, ...removedResults],
      crawledPages: [],
      request: {
        ...request,
        searchPlan,
      },
    });

    assert.ok(
      refinement.results.length > request.resultLimit,
      "expected verified pool to stay larger than final requested count",
    );
    assert.ok(refinement.results.length >= 7);
  });
});

describe("sales brief fixtures", () => {
  it("summarizes useful company evidence without navigation-heavy crawl text", () => {
    const result: SearxngResult = {
      title: "会社概要 - 株式会社VTIジャパン",
      url: "https://vtijapan.co.jp/company-data",
      content:
        "株式会社VTIジャパンは、VTIグループの日本法人として、AI・DX・ソフトウェア開発領域において、お客様のビジネス課題解決を支援しています。",
      engine: "fixture",
      evidence: {
        passed: ["Company profile URL", "Identity: ベトナム", "Industry: IT"],
        missing: [],
        urlType: "company_profile",
        matchedIdentity: ["ベトナム"],
        matchedLocation: ["Japan", "Japan domain"],
        matchedIndustry: ["IT", "ソフトウェア"],
        matchedOfficial: ["会社概要"],
      },
    };

    const brief = buildSalesCompanyBrief({
      companyName: "株式会社VTI",
      result,
      request: vietnamItTokyoRequest,
      crawledPage: {
        url: result.url ?? "",
        success: true,
        content:
          "会社情報 会社について 会社概要 社長メッセージ ニュース 拠点情報 サービス お問い合わせ 資料請求。アプリケーション開発、クラウド、AI/Gen AIを提供。",
      },
    });

    assert.match(brief.businessSummary, /VTI|AI|DX|ソフトウェア/);
    assert.doesNotMatch(brief.businessSummary, /会社情報 会社について 会社概要 社長メッセージ/);
    assert.match(brief.salesAngle, /切り口に提案/);
    assert.equal(brief.confidence, "High");
  });

  it("fallback analysis always returns structured sales briefs", () => {
    const analysis = buildFallbackAnalysis({
      request: vietnamItTokyoRequest,
      crawledPages: [],
      searchResults: [
        {
          title: "NAL JAPAN 会社概要",
          url: "https://nal.co.jp/company",
          content:
            "NAL JAPANは日本品質とベトナム開発力でシステム開発、オフショア開発、DX、AI活用を支援します。",
          engine: "fixture",
        },
      ],
    });

    assert.equal(analysis.results.length, 1);
    assert.ok(analysis.results[0]?.salesBrief.businessSummary);
    assert.ok(analysis.results[0]?.salesBrief.salesAngle);
    assert.ok(analysis.results[0]?.salesBrief.contactNextStep);
  });
});
