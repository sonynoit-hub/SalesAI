const STATUSES_AFTER_CONTACTED = new Set([
  "REPLIED",
  "FOLLOW_UP",
  "MEETING",
  "WON",
  "LOST",
  "ARCHIVED",
]);

const ADVANCED_PIPELINE_STATUSES = new Set([
  "FOLLOW_UP",
  "MEETING",
  "WON",
  "LOST",
  "ARCHIVED",
]);

export type LeadContactFlags = {
  hasEmailContact: boolean;
  hasPhoneContact: boolean;
  hasEmailReply: boolean;
};

export type QualifyMarkKind = "unconfirmed" | "qualified" | "passed";

const QUALIFY_PIPELINE_STATUSES = new Set([
  "NEW",
  "QUALIFIED",
  "RESEARCHED",
]);

export function resolveLeadStatusAfterContact(current: string): string {
  const normalized = current.toUpperCase();
  if (STATUSES_AFTER_CONTACTED.has(normalized)) {
    return normalized;
  }
  // Keep Confirm-column marks intact; outreach progress comes from contact events.
  if (QUALIFY_PIPELINE_STATUSES.has(normalized)) {
    return normalized;
  }
  return "CONTACTED";
}

/**
 * Outreach-only status for the right column badge.
 * Driven by メール/架電/返信 (plus advanced pipeline stages).
 */
export function resolveLeadProgressStatus(
  status: string,
  activity: LeadContactFlags,
): string {
  const normalized = status.toUpperCase();

  if (ADVANCED_PIPELINE_STATUSES.has(normalized)) {
    return normalized;
  }

  if (activity.hasEmailReply) {
    return "REPLIED";
  }

  if (activity.hasEmailContact || activity.hasPhoneContact) {
    return "CONTACTED";
  }

  return "NOT_CONTACTED";
}

/**
 * Middle-column mark:
 * - unconfirmed (NEW): not reviewed yet
 * - qualified (QUALIFIED+): 見込み
 * - passed (RESEARCHED / LOST): confirmed but not a fit — keep record, no delete
 */
export function resolveQualifyMark(status: string): QualifyMarkKind {
  const normalized = status.toUpperCase();
  if (normalized === "NEW") return "unconfirmed";
  if (
    normalized === "RESEARCHED" ||
    normalized === "LOST" ||
    normalized === "ARCHIVED"
  ) {
    return "passed";
  }
  return "qualified";
}

export function qualifyMarkLabel(kind: QualifyMarkKind): string {
  if (kind === "qualified") return "見込み";
  if (kind === "passed") return "見送り";
  return "未確認";
}

/** Next status when cycling Confirm: 未確認 → 見込み → 見送り → 未確認. */
export function nextQualifiedMarkStatus(
  status: string,
): "NEW" | "QUALIFIED" | "RESEARCHED" {
  const kind = resolveQualifyMark(status);
  if (kind === "unconfirmed") return "QUALIFIED";
  if (kind === "qualified") return "RESEARCHED";
  return "NEW";
}

export type QualifyFilterGroup =
  | "all"
  | "unconfirmed"
  | "qualified"
  | "passed";

export function leadMatchesQualifyFilter(
  status: string,
  filter: QualifyFilterGroup,
) {
  if (filter === "all") return true;
  return resolveQualifyMark(status) === filter;
}

export function latestLeadProgressAt(
  activity: {
    emailContactedAt?: Date | null;
    phoneContactedAt?: Date | null;
    emailRepliedAt?: Date | null;
  },
  fallback: Date,
): Date {
  const times = [
    activity.emailRepliedAt,
    activity.emailContactedAt,
    activity.phoneContactedAt,
    fallback,
  ]
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  return new Date(Math.max(...times));
}

export function leadProgressEventLabel(
  activity: {
    emailContactedAt?: Date | null;
    phoneContactedAt?: Date | null;
    emailRepliedAt?: Date | null;
  },
  at: Date,
): string | null {
  const atMs = at.getTime();
  if (activity.emailRepliedAt?.getTime() === atMs) return "返信";
  if (activity.emailContactedAt?.getTime() === atMs) return "メール";
  if (activity.phoneContactedAt?.getTime() === atMs) return "架電";
  return null;
}

const LEAD_STATUS_LABELS_JA: Record<string, string> = {
  NEW: "新規",
  RESEARCHED: "見送り",
  QUALIFIED: "見込みあり",
  CONTACTED: "連絡済み",
  REPLIED: "返信あり",
  FOLLOW_UP: "フォロー中",
  MEETING: "商談中",
  WON: "受注",
  LOST: "失注",
  ARCHIVED: "削除済み",
  NOT_CONTACTED: "未連絡",
};

export function leadStatusLabelJa(value: string) {
  return LEAD_STATUS_LABELS_JA[value.toUpperCase()] ?? value.toLowerCase();
}

export function priorityLabelJa(value: string) {
  const labels: Record<string, string> = {
    LOW: "低",
    MEDIUM: "中",
    HIGH: "高",
  };
  return labels[value.toUpperCase()] ?? value.toLowerCase();
}

export type LeadStatusFilterGroup =
  | "all"
  | "not_yet"
  | "contacted"
  | "replied"
  | "closed";

const FILTER_GROUP_STATUSES: Record<
  Exclude<LeadStatusFilterGroup, "all">,
  string[]
> = {
  not_yet: ["NOT_CONTACTED", "NEW", "RESEARCHED", "QUALIFIED"],
  contacted: ["CONTACTED", "FOLLOW_UP"],
  replied: ["REPLIED"],
  closed: ["MEETING", "WON", "LOST", "ARCHIVED"],
};

export function leadMatchesStatusFilter(
  status: string,
  filter: LeadStatusFilterGroup,
) {
  if (filter === "all") return true;
  const normalized = status.toUpperCase();
  return FILTER_GROUP_STATUSES[filter].includes(normalized);
}

export function leadMatchesProgressFilter(
  status: string,
  activity: LeadContactFlags,
  filter: LeadStatusFilterGroup,
) {
  return leadMatchesStatusFilter(
    resolveLeadProgressStatus(status, activity),
    filter,
  );
}
