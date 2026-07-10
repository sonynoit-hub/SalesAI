import type {
  CrawledPage,
  SalesCompanyBrief,
} from "@/lib/search-analysis/types";
import type { SearxngResult } from "@/lib/search-analysis/search";

export function buildSalesCompanyBrief({
  companyName,
  crawledPage,
  result,
  request,
}: {
  companyName: string;
  crawledPage?: CrawledPage;
  result: SearxngResult;
  request: {
    industry: string;
    location: string;
    opportunityDescription: string;
  };
}): SalesCompanyBrief {
  const evidenceText = cleanSalesEvidenceText(
    [
      result.content,
      result.title,
      crawledPage?.content,
      result.url,
      result.evidence?.passed.join("。"),
    ].filter(Boolean).join("。"),
  );
  const businessSummary = buildBusinessSummary({
    companyName,
    evidenceText,
    request,
  });
  const likelyNeed = buildLikelyNeed(request.opportunityDescription, request.industry);

  return {
    businessSummary,
    locationEvidence:
      result.evidence?.matchedLocation.length
        ? `所在地・対象地域: ${result.evidence.matchedLocation.join(", ")}`
        : `${request.location}に関連する企業候補として検索・検証`,
    industryEvidence:
      result.evidence?.matchedIndustry.length
        ? `業種シグナル: ${result.evidence.matchedIndustry.join(", ")}`
        : `${request.industry}領域の公開情報から抽出`,
    identityEvidence:
      result.evidence?.matchedIdentity.length
        ? `企業属性: ${result.evidence.matchedIdentity.join(", ")}`
        : undefined,
    likelyNeed,
    salesAngle: buildSalesAngle({ likelyNeed, request }),
    contactNextStep: buildContactNextStep(result),
    confidence: resolveEvidenceConfidence({ crawledPage, result }),
  };
}

export function briefDescription(brief: SalesCompanyBrief) {
  return brief.businessSummary;
}

function cleanSalesEvidenceText(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>~]/g, " ")
    .replace(/\b(skip to content|navigation|menu|footer|header)\b/gi, " ")
    .replace(/コンテンツに移動|ナビゲーションに移動|メニュー|フッター|ヘッダー|お問い合わせ|資料請求/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_600);
}

function resolveEvidenceConfidence({
  crawledPage,
  result,
}: {
  crawledPage?: CrawledPage;
  result: SearxngResult;
}): SalesCompanyBrief["confidence"] {
  const matchedSignals = [
    ...(result.evidence?.matchedIdentity ?? []),
    ...(result.evidence?.matchedLocation ?? []),
    ...(result.evidence?.matchedIndustry ?? []),
    ...(result.evidence?.matchedOfficial ?? []),
  ].length;
  const hasPageContent = Boolean(crawledPage?.content || result.content);

  if (hasPageContent && matchedSignals >= 2) {
    return "High";
  }

  if (hasPageContent || matchedSignals > 0) {
    return "Medium";
  }

  return "Low";
}

function buildBusinessSummary({
  companyName,
  evidenceText,
  request,
}: {
  companyName: string;
  evidenceText: string;
  request: {
    industry: string;
    location: string;
  };
}) {
  const serviceSentence = splitUsefulSentences(evidenceText).find((sentence) =>
    /開発|システム|ソフトウェア|DX|AI|クラウド|IT|コンサル|オフショア|受託|提供|支援|service|software|development|consult/i.test(
      sentence,
    ),
  );

  if (serviceSentence) {
    return tightenSentence(serviceSentence, 150);
  }

  return `${companyName}は${request.location}・${request.industry}領域に関連する公式企業サイト候補です。公開情報を確認し、商談対象として精査できます。`;
}

function buildLikelyNeed(opportunityDescription: string, industry: string) {
  const text = opportunityDescription.toLowerCase();

  if (/excel|spreadsheet|表計算|スプレッドシート/i.test(text)) {
    return "Excel・表計算中心の業務を整理し、自動化できる余地があります。";
  }

  if (/manual|手作業|紙/i.test(text)) {
    return "手作業や紙ベースの業務を減らす提案余地があります。";
  }

  if (/report|帳票|報告/i.test(text)) {
    return "定期報告・帳票作成の効率化ニーズを確認する価値があります。";
  }

  if (/ai|人工知能|生成ai/i.test(text)) {
    return "AI活用による開発・業務プロセス改善を提案できる可能性があります。";
  }

  return `${industry}業務の効率化・自動化ニーズをヒアリングする価値があります。`;
}

function buildSalesAngle({
  likelyNeed,
  request,
}: {
  likelyNeed: string;
  request: {
    opportunityDescription: string;
  };
}) {
  const input = request.opportunityDescription.trim();

  const need = likelyNeed
    .replace(/をヒアリングする価値があります。?$/, "を確認")
    .replace(/できる余地があります。?$/, "できる領域")
    .replace(/ニーズをヒアリングする価値があります。?$/, "ニーズ")
    .replace(/ニーズを確認する価値があります。?$/, "ニーズ")
    .replace(/ニーズを確認$/, "ニーズ")
    .replace(/提案余地があります。?$/, "提案余地")
    .replace(/。$/, "");

  return `初回接点では「${input}」に近い課題があるかを確認し、${need}を切り口に提案します。`;
}

function buildContactNextStep(result: SearxngResult) {
  const urlType = result.evidence?.urlType;

  if (urlType === "about" || urlType === "company_profile") {
    return "会社概要ページで所在地・事業内容を確認し、問い合わせページまたは代表窓口を探します。";
  }

  return "公式サイトの会社概要・問い合わせページを確認し、担当部署向けの短い初回メールを作成します。";
}

function splitUsefulSentences(value: string) {
  return value
    .split(/[。.!?！？]\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24)
    .filter((sentence) => !isNoisySalesSentence(sentence))
    .slice(0, 20);
}

function isNoisySalesSentence(value: string) {
  const menuWordCount = [
    "会社情報",
    "会社について",
    "会社概要",
    "社長メッセージ",
    "ニュース",
    "拠点情報",
    "サービス",
    "お問い合わせ",
    "資料請求",
    "プライバシー",
    "採用",
  ].filter((word) => value.includes(word)).length;

  return (
    menuWordCount >= 4 ||
    /cookie|privacy|copyright|all rights reserved|ログイン|採用|求人/i.test(value)
  );
}

function tightenSentence(value: string, limit: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned;
}
