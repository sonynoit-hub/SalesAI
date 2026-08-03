const INDUSTRY_JA: Record<string, string> = {
  manufacturing: "製造業",
  software: "ソフトウェア",
  technology: "テクノロジー",
  tech: "テクノロジー",
  it: "IT",
  logistics: "物流",
  construction: "建設業",
  healthcare: "ヘルスケア",
  health: "ヘルスケア",
  retail: "小売",
  "financial services": "金融サービス",
  finance: "金融",
  consulting: "コンサルティング",
  education: "教育",
  realestate: "不動産業",
  "real estate": "不動産業",
  hospitality: "宿泊・観光",
  automotive: "自動車",
  energy: "エネルギー",
  agriculture: "農業",
  media: "メディア",
  telecom: "通信",
  telecommunications: "通信",
};

/**
 * Normalize stored/enrichment industry labels to Japanese for UI and CRM fields.
 * Already-Japanese values are returned unchanged.
 */
export function formatIndustryJa(value: string | null | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";

  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(raw)) {
    return raw;
  }

  const key = raw.toLowerCase();
  if (INDUSTRY_JA[key]) {
    return INDUSTRY_JA[key];
  }

  for (const [en, ja] of Object.entries(INDUSTRY_JA)) {
    if (key.includes(en)) {
      return ja;
    }
  }

  return raw;
}
