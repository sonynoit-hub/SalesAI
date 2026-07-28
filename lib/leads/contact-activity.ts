import {
  getLeadTagTimestamp,
  hasLeadTag,
  LEAD_TAG_EMAIL_CONTACTED,
  LEAD_TAG_EMAIL_REPLIED,
  LEAD_TAG_PHONE_CONTACTED,
} from "@/lib/leads/constants";
import type { LeadContactEvents } from "@/lib/leads/contact-events";

export type LeadContactActivity = {
  hasEmailContact: boolean;
  hasPhoneContact: boolean;
  hasEmailReply: boolean;
  emailContactedAt: Date | null;
  phoneContactedAt: Date | null;
  emailRepliedAt: Date | null;
};

export function deriveLeadContactActivity({
  tags,
  events,
}: {
  tags: string[] | null | undefined;
  events?: LeadContactEvents | null;
}): LeadContactActivity {
  const emailContactedAt =
    events?.emailContactedAt ?? getLeadTagTimestamp(tags, LEAD_TAG_EMAIL_CONTACTED) ?? null;
  const phoneContactedAt =
    events?.phoneContactedAt ?? getLeadTagTimestamp(tags, LEAD_TAG_PHONE_CONTACTED) ?? null;
  const emailRepliedAt =
    events?.emailRepliedAt ?? getLeadTagTimestamp(tags, LEAD_TAG_EMAIL_REPLIED) ?? null;

  return {
    hasEmailContact:
      hasLeadTag(tags, LEAD_TAG_EMAIL_CONTACTED) || Boolean(emailContactedAt),
    hasPhoneContact:
      hasLeadTag(tags, LEAD_TAG_PHONE_CONTACTED) || Boolean(phoneContactedAt),
    hasEmailReply:
      hasLeadTag(tags, LEAD_TAG_EMAIL_REPLIED) || Boolean(emailRepliedAt),
    emailContactedAt,
    phoneContactedAt,
    emailRepliedAt,
  };
}
