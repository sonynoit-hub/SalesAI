import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandJapanMemorySourcingQueries,
  looksLikeMemoryProduct,
  shouldUseJapanMemorySourcingPlaybook,
} from "@/lib/search-analysis/playbooks/japan-memory-sourcing";
import { generateSearchQueryStrategy } from "@/lib/search-analysis/query-generator";
import { scoreSupplierEvidence } from "@/lib/search-analysis/supplier-evidence";
import { verifyHomepageCandidates } from "@/lib/search-analysis/strict-public-search";
import type { SearxngResult } from "@/lib/search-analysis/search";

describe("japan memory sourcing playbook", () => {
  it("detects memory product language including DDR4", () => {
    assert.equal(looksLikeMemoryProduct("DDR4"), true);
    assert.equal(looksLikeMemoryProduct("中古メモリ"), true);
    assert.equal(looksLikeMemoryProduct("ベトナム IT"), false);
  });

  it("enables playbook for buyer DDR4 in Japan", () => {
    assert.equal(
      shouldUseJapanMemorySourcingPlaybook({
        referenceKeyword: "DDR4",
        location: "日本",
        searchRole: "buyer",
      }),
      true,
    );
    assert.equal(
      shouldUseJapanMemorySourcingPlaybook({
        referenceKeyword: "DDR4",
        location: "日本",
        searchRole: "seller",
      }),
      false,
    );
  });

  it("expands channel queries without requiring DDR4 in every query", () => {
    const queries = expandJapanMemorySourcingQueries({
      location: "日本",
      limit: 12,
    });
    const joined = queries.join(" ");
    assert.match(joined, /中古メモリ/);
    assert.match(joined, /法人パソコン|IT資産|サーバ/);
    assert.doesNotMatch(joined, /産業用PC|産業用パソコン|組込みPC|FAパソコン/);
    assert.ok(queries.every((query) => !/^DDR4\b/i.test(query)));
  });

  it("builds buyer fallback strategy from DDR4 keyword", async () => {
    process.env.AI_PROVIDER = "disabled";
    const strategy = await generateSearchQueryStrategy({
      referenceKeyword: "DDR4",
      opportunityDescription: "DDR4",
      industry: "テクノロジー",
      location: "日本",
      searchRole: "buyer",
      excludeKeywords: ["求人"],
      targetCompanyCount: 20,
      resultLimit: 20,
    });
    const joined = strategy.searchQueries.join(" ");
    assert.match(joined, /中古メモリ|PCパーツ|法人パソコン|サーバ/);
    assert.doesNotMatch(joined, /業務改善/);
    assert.match(strategy.targetCompanyProfile, /メモリ|パーツ|リユース/);
  });

  it("prioritizes ITAD and PC reuse channels before generic product keywords", () => {
    const queries = expandJapanMemorySourcingQueries({
      location: "日本",
      limit: 8,
    });
    const firstQueries = queries.slice(0, 4).join(" ");

    assert.match(firstQueries, /IT資産|法人パソコン|使用済パソコン/);
    assert.match(queries.join(" "), /PCリユース|データ消去|中古メモリ|PCパーツ/);
  });
});

describe("supplier evidence rubric", () => {
  it("scores sell-side pages higher than explainer pages", () => {
    const supplier = scoreSupplierEvidence(
      "中古PCパーツ販売 メモリ 卸 在庫 通販",
    );
    const noise = scoreSupplierEvidence("DDR4 とは 解説 ニュース ランキング");
    assert.equal(supplier.looksLikeSupplier, true);
    assert.equal(noise.looksLikeSupplier, false);
    assert.ok(supplier.score > noise.score);
  });

  it("recognizes ITAD and PC reuse companies as strong supplier fits", () => {
    const evidence = scoreSupplierEvidence(
      "ITAD IT資産リユース 法人パソコン買取 データ消去 中古PC 再販",
    );

    assert.equal(evidence.looksLikeSupplier, true);
    assert.ok(evidence.score >= 8);
    assert.ok(evidence.matchedSellSide.includes("IT資産"));
    assert.ok(evidence.matchedSellSide.includes("データ消去"));
  });

  it("rejects pages that only contain DDR4 inside unrelated product categories", () => {
    const embeddedPc = scoreSupplierEvidence(
      "産業用PC 組込みPC FAパソコン DDR4メモリ搭載 製品情報",
    );
    const agentPage = scoreSupplierEvidence(
      "半導体商社 DRAMモジュール メーカー 代理店 DDR4 サプライヤー紹介",
    );

    assert.equal(embeddedPc.mentionsProductSku, true);
    assert.equal(embeddedPc.looksLikeSupplier, false);
    assert.equal(agentPage.mentionsProductSku, true);
    assert.equal(agentPage.looksLikeSupplier, false);
  });

  it("strict sourcing verification keeps ITAD suppliers and removes retailers", () => {
    const request = {
      referenceKeyword: "DDR4",
      opportunityDescription: "DDR4",
      industry: "テクノロジー",
      location: "日本",
      searchRole: "buyer" as const,
      excludeKeywords: ["求人"],
      targetCompanyCount: 10,
      resultLimit: 10,
    };
    const results: SearxngResult[] = [
      {
        title: "会社概要 - 株式会社リユーステック",
        url: "https://reuse-tech.example.jp/company",
        content:
          "株式会社リユーステックはIT資産リユース、法人パソコン買取、データ消去、中古PC再販、PCパーツ販売を行う会社です。",
        engine: "fixture",
      },
      {
        title: "DDR4 メモリ ランキング",
        url: "https://www.amazon.co.jp/ddr4-ranking",
        content: "DDR4メモリのランキング、比較、通販ページです。",
        engine: "fixture",
      },
      {
        title: "会社概要 - 株式会社一般システム",
        url: "https://general-system.example.jp/company",
        content:
          "株式会社一般システムはクラウド、AI、ソフトウェア開発を提供する会社です。",
        engine: "fixture",
      },
      {
        title: "産業用PC DDR4搭載モデル",
        url: "https://embedded-pc.example.jp/products/ddr4",
        content:
          "産業用PCと組込みPCの製品情報です。DDR4メモリ搭載モデルを販売しています。",
        engine: "fixture",
      },
    ];

    const verified = verifyHomepageCandidates(results, request);

    assert.deepEqual(
      verified.map((candidate) => candidate.homepageUrl),
      ["https://reuse-tech.example.jp/"],
    );
    assert.ok((verified[0]?.evidence.supplierFitScore ?? 0) > 0);
    assert.match(verified[0]?.evidence.passed.join(" ") ?? "", /Supplier fit/);
  });
});
