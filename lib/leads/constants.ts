export const LEAD_STATUS_OPTIONS = [
  "NEW",
  "RESEARCHED",
  "QUALIFIED",
  "CONTACTED",
  "REPLIED",
  "FOLLOW_UP",
  "MEETING",
  "WON",
  "LOST",
] as const;

export const LEAD_PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH"] as const;

export type LeadStatusOption = (typeof LEAD_STATUS_OPTIONS)[number];
export type LeadPriorityOption = (typeof LEAD_PRIORITY_OPTIONS)[number];

export const LEAD_TAG_EMAIL_CONTACTED = "contact:email";
export const LEAD_TAG_PHONE_CONTACTED = "contact:phone";
export const LEAD_TAG_EMAIL_REPLIED = "reply:email";

export function mergeLeadTags(existing: string[] | null | undefined, add: string[]) {
  return Array.from(new Set([...(existing ?? []), ...add]));
}

export function hasLeadTag(tags: string[] | null | undefined, tag: string) {
  return (tags ?? []).some((value) => value === tag || value.startsWith(`${tag}@`));
}

export function addOrReplaceLeadEventTag(
  existing: string[] | null | undefined,
  tag: string,
  at = new Date(),
) {
  const next = (existing ?? []).filter(
    (value) => value !== tag && !value.startsWith(`${tag}@`),
  );
  next.push(`${tag}@${at.toISOString()}`);
  return next;
}

export function getLeadTagTimestamp(tags: string[] | null | undefined, tag: string) {
  const matches = (tags ?? []).filter((value) =>
    value.startsWith(`${tag}@`),
  );
  if (matches.length === 0) return null;

  const latest = matches
    .map((value) => new Date(value.slice(tag.length + 1)))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return latest ?? null;
}

const ENGLISH_LOCATION_ALIASES: Record<string, string> = {
  osaka: "大阪府",
  tokyo: "東京都",
  "tokyo-to": "東京都",
  kyoto: "京都府",
  hokkaido: "北海道",
  aichi: "愛知県",
  kanagawa: "神奈川県",
  saitama: "埼玉県",
  chiba: "千葉県",
  hyogo: "兵庫県",
  fukuoka: "福岡県",
};

export function normalizeLocationLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const alias = ENGLISH_LOCATION_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  return trimmed;
}
