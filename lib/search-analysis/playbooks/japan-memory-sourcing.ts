/**
 * Japan used-memory / ITAD sourcing playbook.
 * Product SKUs like DDR4 rarely appear on supplier sites; search channel language instead.
 */

export type SourcingChannel =
  | "itad_buyback"
  | "pc_reuse"
  | "parts_reseller"
  | "lease_return"
  | "server_teardown";

export type MemorySourcingPlaybook = {
  id: "japan-memory-sourcing";
  productHints: string[];
  channels: Array<{
    id: SourcingChannel;
    label: string;
    angles: string[];
    queries: string[];
  }>;
  excludeTerms: string[];
  sellSideEvidence: string[];
  noiseEvidence: string[];
};

export const JAPAN_MEMORY_SOURCING_PLAYBOOK: MemorySourcingPlaybook = {
  id: "japan-memory-sourcing",
  productHints: [
    "ddr4",
    "ddr3",
    "ddr5",
    "メモリ",
    "memory",
    "dimm",
    "sodimm",
    "ram",
    "pc4",
    "so-dimm",
    "udimm",
    "rdimm",
    "ecc",
  ],
  channels: [
    {
      id: "itad_buyback",
      label: "法人買取・IT資産リユース",
      angles: [
        "ITAD 会社",
        "法人パソコン 買取",
        "IT資産 リユース",
        "IT資産廃棄 データ消去",
        "使用済情報機器 買取",
      ],
      queries: [
        "法人パソコン 買取 データ消去",
        "IT資産処分 リユース 会社",
        "IT資産廃棄 中古PC 販売",
        "オフィスパソコン 大量買取",
        "使用済パソコン 買取 事業者",
      ],
    },
    {
      id: "pc_reuse",
      label: "PCリユース・データ消去",
      angles: [
        "PCリユース 会社",
        "中古PC 再販 法人",
        "リユースPC 販売 法人",
        "再生PC 販売 会社",
        "データ消去 パソコン 買取",
      ],
      queries: [
        "PCリユース 会社 データ消去",
        "中古PC 再販 法人 会社",
        "リユースPC 販売 法人",
        "再生PC 販売 会社",
        "パソコン データ消去 買取 会社",
        "情報機器 リユース 販売 会社",
      ],
    },
    {
      id: "parts_reseller",
      label: "中古パーツ・メモリ販売",
      angles: [
        "中古メモリ 販売",
        "PCパーツ 中古 卸",
        "メモリ在庫 販売 会社",
        "中古パソコン パーツ 販売",
      ],
      queries: [
        "中古メモリ PCパーツ 販売 会社",
        "中古メモリ 卸 サイト",
        "メモリ在庫 販売 会社",
        "PCパーツ DDR4 法人",
        "PCパーツ 中古 販売 公式",
        "中古パソコン パーツ 通販",
      ],
    },
    {
      id: "lease_return",
      label: "リースアップ・レンタル返却",
      angles: ["リースアップ パソコン 買取", "レンタルPC 返却 買取"],
      queries: [
        "リースアップ パソコン 買取",
        "レンタルパソコン 返却 買取",
        "リース終了 PC 処分",
      ],
    },
    {
      id: "server_teardown",
      label: "サーバ買取・部品",
      angles: ["中古サーバ メモリ", "サーバ 買取 部品", "サーバ部品 販売"],
      queries: [
        "中古サーバ メモリ 販売",
        "サーバ 買取 部品 販売",
        "サーバ部品 DDR4 販売",
        "中古サーバ 撤去 買取",
      ],
    },
  ],
  excludeTerms: [
    "求人",
    "採用",
    "ニュース",
    "記事",
    "ランキング",
    "一覧",
    "ディレクトリ",
    "とは",
    "解説",
    "産業用PC",
    "産業用パソコン",
    "組込みPC",
    "FAパソコン",
    "半導体商社",
    "代理店",
    "ヤマダ電機",
    "ビックカメラ",
    "ヨドバシ",
    "amazon",
    "楽天",
  ],
  sellSideEvidence: [
    "ITAD",
    "IT資産",
    "IT資産廃棄",
    "IT機器",
    "資産処分",
    "適正処分",
    "情報機器",
    "PCリユース",
    "リユースPC",
    "再生PC",
    "中古PC",
    "中古パソコン",
    "中古IT機器",
    "メモリ",
    "中古メモリ",
    "メモリ在庫",
    "PCパーツ",
    "パーツ販売",
    "中古パーツ",
    "部品販売",
    "部材",
    "卸",
    "在庫",
    "サーバ部品",
    "サーバー部品",
    "法人買取",
    "法人パソコン買取",
    "リユース",
    "データ消去",
    "パソコン廃棄",
    "パソコン処分",
    "使用済",
    "リースアップ",
    "パソコン買取",
    "PC買取",
    "買取販売",
    "中古品販売",
    "ECサイト運営",
    "OA機器",
    "オフィス機器",
    "撤去",
    "回収",
    "再資源化",
    "3R",
    "再販",
    "通販",
  ],
  noiseEvidence: [
    "求人",
    "採用情報",
    "ランキング",
    "比較サイト",
    "ニュースリリース",
    "とは",
    "解説",
    "Wikipedia",
    "量販",
    "家電量販",
    "産業用PC",
    "産業用パソコン",
    "組込みPC",
    "組み込みPC",
    "FAパソコン",
    "半導体商社",
    "代理店",
    "メーカー",
  ],
};

const MEMORY_PRODUCT_RE =
  /ddr\s*[345]|メモリ|memory|dimm|sodimm|\bram\b|中古\s*pc\s*パーツ|pc\s*パーツ/i;

export function looksLikeMemoryProduct(text: string) {
  return MEMORY_PRODUCT_RE.test(text);
}

export function shouldUseJapanMemorySourcingPlaybook(input: {
  referenceKeyword: string;
  opportunityDescription?: string;
  location?: string;
  searchRole?: "buyer" | "seller" | "auto";
}) {
  const role = input.searchRole ?? "auto";
  if (role === "seller") return false;

  const blob = [
    input.referenceKeyword,
    input.opportunityDescription ?? "",
    input.location ?? "",
  ].join(" ");

  const memory = looksLikeMemoryProduct(blob);
  if (!memory) return false;

  if (role === "buyer") return true;

  // auto: apply for Japan-oriented memory searches
  return /日本|japan|東京|大阪|愛知|神奈川|福岡|北海道|\.jp/i.test(blob) || !input.location;
}

export function expandJapanMemorySourcingQueries(input: {
  location?: string;
  industry?: string;
  limit?: number;
}) {
  const location = input.location?.trim() || "日本";
  const industry = input.industry?.trim() || "";
  const limit = input.limit ?? 16;
  const domainBias = "site:.co.jp OR site:.jp";
  const queries: string[] = [];
  const maxChannelQueryCount = Math.max(
    ...JAPAN_MEMORY_SOURCING_PLAYBOOK.channels.map((channel) => channel.queries.length),
  );

  for (let index = 0; index < maxChannelQueryCount; index += 1) {
    for (const channel of JAPAN_MEMORY_SOURCING_PLAYBOOK.channels) {
      const query = channel.queries[index];

      if (!query) continue;

      queries.push(
        [query, location, industry, domainBias]
          .filter(Boolean)
          .join(" ")
          .trim(),
      );
    }
  }

  return uniqueStrings(queries).slice(0, limit);
}

export function japanMemorySourcingAngles() {
  return JAPAN_MEMORY_SOURCING_PLAYBOOK.channels.flatMap((channel) => channel.angles);
}

export function japanMemorySourcingExcludeTerms(extra: string[] = []) {
  return uniqueStrings([
    ...JAPAN_MEMORY_SOURCING_PLAYBOOK.excludeTerms,
    ...extra,
  ]);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}
