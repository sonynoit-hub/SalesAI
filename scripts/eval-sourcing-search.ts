/**
 * Offline eval for Japan memory-sourcing query expansion + supplier evidence rubric.
 *
 *   npm run eval:search
 *   npm run eval:search -- --live   (optional: hit SearXNG if available)
 */
import { generateSearchQueryStrategy } from "../lib/search-analysis/query-generator";
import {
  expandJapanMemorySourcingQueries,
  shouldUseJapanMemorySourcingPlaybook,
} from "../lib/search-analysis/playbooks/japan-memory-sourcing";
import type { SearchAnalyzeRequest } from "../lib/search-analysis/schemas";
import { scoreSupplierEvidence } from "../lib/search-analysis/supplier-evidence";

const LIVE = process.argv.includes("--live");

if (!process.env.AI_PROVIDER) {
  process.env.AI_PROVIDER = "disabled";
}

type Fixture = {
  id: string;
  request: SearchAnalyzeRequest;
  expectPlaybook: boolean;
  expectQueryIncludes: string[];
  expectQueryAvoids?: string[];
};

const fixtures: Fixture[] = [
  {
    id: "ddr4-buyer-japan",
    request: {
      referenceKeyword: "DDR4",
      opportunityDescription: "DDR4",
      industry: "テクノロジー",
      location: "日本",
      searchRole: "buyer",
      excludeKeywords: ["求人", "ニュース"],
      targetCompanyCount: 20,
      resultLimit: 20,
    },
    expectPlaybook: true,
    expectQueryIncludes: ["中古メモリ", "法人パソコン", "サーバ"],
    expectQueryAvoids: ["業務改善", "DX", "Excel"],
  },
  {
    id: "memory-auto-japan",
    request: {
      referenceKeyword: "中古メモリ",
      opportunityDescription: "中古メモリ",
      industry: "",
      location: "東京",
      searchRole: "auto",
      excludeKeywords: [],
      targetCompanyCount: 10,
      resultLimit: 10,
    },
    expectPlaybook: true,
    expectQueryIncludes: ["メモリ", "パーツ"],
  },
  {
    id: "trap-explainer",
    request: {
      referenceKeyword: "DDR4 とは",
      opportunityDescription: "DDR4 とは",
      industry: "",
      location: "日本",
      searchRole: "buyer",
      excludeKeywords: [],
      targetCompanyCount: 10,
      resultLimit: 10,
    },
    expectPlaybook: true,
    expectQueryIncludes: ["中古メモリ"],
    expectQueryAvoids: [],
  },
  {
    id: "non-memory-seller-style",
    request: {
      referenceKeyword: "ベトナム企業 IT 東京",
      opportunityDescription: "ベトナム企業 IT 東京",
      industry: "IT",
      location: "東京",
      searchRole: "seller",
      excludeKeywords: ["求人"],
      targetCompanyCount: 5,
      resultLimit: 5,
    },
    expectPlaybook: false,
    expectQueryIncludes: ["ベトナム"],
  },
];

const evidenceSamples = [
  {
    id: "parts-shop",
    text: "中古PCパーツ販売 メモリ 卸 在庫あり 通販",
    expectSupplier: true,
  },
  {
    id: "itad",
    text: "法人パソコン買取 データ消去 リユース 再販",
    expectSupplier: true,
  },
  {
    id: "news",
    text: "DDR4 とは 解説 ニュース ランキング 一覧",
    expectSupplier: false,
  },
];

async function main() {
  console.log(`==> eval sourcing search (${LIVE ? "live" : "offline"})`);

  let failed = 0;

  for (const fixture of fixtures) {
    const usesPlaybook = shouldUseJapanMemorySourcingPlaybook(fixture.request);
    const strategy = await generateSearchQueryStrategy(fixture.request);
    const joined = strategy.searchQueries.join("\n");

    const playbookOk = usesPlaybook === fixture.expectPlaybook;
    const includesOk = fixture.expectQueryIncludes.every((term) =>
      joined.includes(term),
    );
    const avoidsOk = (fixture.expectQueryAvoids ?? []).every(
      (term) => !joined.includes(term),
    );

    if (!playbookOk || !includesOk || !avoidsOk) {
      failed += 1;
      console.log(`FAIL ${fixture.id}`, {
        playbookOk,
        usesPlaybook,
        includesOk,
        avoidsOk,
        sampleQueries: strategy.searchQueries.slice(0, 5),
      });
    } else {
      console.log(`OK   ${fixture.id} queries=${strategy.searchQueries.length}`);
    }
  }

  for (const sample of evidenceSamples) {
    const score = scoreSupplierEvidence(sample.text);
    const ok = score.looksLikeSupplier === sample.expectSupplier;
    if (!ok) {
      failed += 1;
      console.log(`FAIL evidence:${sample.id}`, score);
    } else {
      console.log(
        `OK   evidence:${sample.id} score=${score.score} sku=${score.mentionsProductSku}`,
      );
    }
  }

  const expanded = expandJapanMemorySourcingQueries({
    location: "日本",
    limit: 8,
  });
  console.log("playbook sample queries:");
  for (const query of expanded) console.log(`  - ${query}`);

  if (LIVE) {
    try {
      const { searchSearxng } = await import("../lib/search-analysis/search");
      const probe = await searchSearxng(expanded[0] ?? "中古メモリ 販売 日本", 1);
      console.log(`live searxng hits=${probe.length} for first playbook query`);
    } catch (error) {
      console.log(
        "live searxng skipped/failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll offline sourcing-search checks passed.");
}

void main();
