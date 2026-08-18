import { JAPAN_MEMORY_SOURCING_PLAYBOOK } from "@/lib/search-analysis/playbooks/japan-memory-sourcing";

export type SupplierEvidenceScore = {
  score: number;
  matchedSellSide: string[];
  matchedNoise: string[];
  looksLikeSupplier: boolean;
  mentionsProductSku: boolean;
};

const CONFIRMED_CHANNEL_TERMS = [
  "ITAD",
  "IT資産",
  "IT資産廃棄",
  "IT機器",
  "情報機器",
  "資産処分",
  "適正処分",
  "パソコン廃棄",
  "パソコン処分",
  "データ消去",
  "法人買取",
  "法人パソコン買取",
  "パソコン買取",
  "PC買取",
  "PCリユース",
  "リユースPC",
  "再生PC",
  "中古PC",
  "中古パソコン",
  "中古IT機器",
  "リースアップ",
  "使用済",
  "撤去",
  "回収",
];

const PARTS_RESALE_TERMS = [
  "中古メモリ",
  "メモリ在庫",
  "PCパーツ",
  "パーツ販売",
  "中古パーツ",
  "部品販売",
  "サーバ部品",
  "サーバー部品",
  "中古品販売",
  "買取販売",
];

const TRANSACTION_TERMS = [
  "販売",
  "買取",
  "卸",
  "在庫",
  "通販",
  "見積",
  "問い合わせ",
  "お問い合わせ",
  "ECサイト",
  "再販",
];

const HARD_REJECT_TERMS = [
  "産業用PC",
  "産業用パソコン",
  "組込みPC",
  "組み込みPC",
  "FAパソコン",
  "半導体商社",
  "代理店",
  "メーカー",
];

/**
 * Score page/snippet text for "could sell us used memory / IT parts" fit.
 * DDR4 itself is optional; sell-side channel language matters more.
 */
export function scoreSupplierEvidence(
  text: string,
  options?: { productHints?: string[] },
): SupplierEvidenceScore {
  const haystack = text || "";
  const normalizedHaystack = haystack.toLowerCase();
  const sellSide = JAPAN_MEMORY_SOURCING_PLAYBOOK.sellSideEvidence.filter((term) =>
    normalizedHaystack.includes(term.toLowerCase()),
  );
  const noise = JAPAN_MEMORY_SOURCING_PLAYBOOK.noiseEvidence.filter((term) =>
    normalizedHaystack.includes(term.toLowerCase()),
  );
  const productHints =
    options?.productHints ?? JAPAN_MEMORY_SOURCING_PLAYBOOK.productHints;
  const mentionsProductSku = productHints.some((hint) =>
    new RegExp(hint.replace(/\s+/g, "\\s*"), "i").test(haystack),
  );
  const matchedConfirmedChannels = CONFIRMED_CHANNEL_TERMS.filter((term) =>
    normalizedHaystack.includes(term.toLowerCase()),
  );
  const matchedPartsResale = PARTS_RESALE_TERMS.filter((term) =>
    normalizedHaystack.includes(term.toLowerCase()),
  );
  const matchedTransaction = TRANSACTION_TERMS.filter((term) =>
    normalizedHaystack.includes(term.toLowerCase()),
  );
  const matchedHardReject = HARD_REJECT_TERMS.filter((term) =>
    normalizedHaystack.includes(term.toLowerCase()),
  );
  const hasConfirmedChannel = matchedConfirmedChannels.length > 0;
  const hasPartsResalePath =
    matchedPartsResale.length > 0 && matchedTransaction.length > 0;
  const hardRejectOnly =
    matchedHardReject.length > 0 && !hasConfirmedChannel && !hasPartsResalePath;

  let score =
    sellSide.length * 2 +
    matchedConfirmedChannels.length * 3 +
    matchedPartsResale.length * 3 +
    matchedTransaction.length -
    noise.length * 2 -
    matchedHardReject.length * 5;
  if (mentionsProductSku) score += 1;
  if (sellSide.length >= 2) score += 2;
  if (hasConfirmedChannel && hasPartsResalePath) score += 4;

  return {
    score,
    matchedSellSide: sellSide,
    matchedNoise: noise,
    looksLikeSupplier:
      (hasConfirmedChannel || hasPartsResalePath) &&
      !hardRejectOnly &&
      noise.length <= sellSide.length + matchedConfirmedChannels.length,
    mentionsProductSku,
  };
}
