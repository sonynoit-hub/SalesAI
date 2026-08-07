import { prisma } from "@/lib/db/prisma";
import { LeadStatus } from "@/lib/generated/prisma/client";
import {
  addOrReplaceLeadEventTag,
  LEAD_TAG_EMAIL_CONTACTED,
  LEAD_TAG_EMAIL_REPLIED,
  LEAD_TAG_PHONE_CONTACTED,
} from "@/lib/leads/constants";
import { logContactEvent } from "@/lib/leads/contact-events";

export type LeadContactStatusValue =
  | "not_contacted"
  | "email"
  | "phone"
  | "reply";

const CONTACT_ACTIVITY_TAGS = [
  LEAD_TAG_EMAIL_CONTACTED,
  LEAD_TAG_PHONE_CONTACTED,
  LEAD_TAG_EMAIL_REPLIED,
] as const;

const QUALIFY_PIPELINE_STATUSES = new Set([
  "NEW",
  "QUALIFIED",
  "RESEARCHED",
]);

const RESETTABLE_CONTACT_STATUSES = new Set(["CONTACTED", "REPLIED"]);

export async function resetLeadContactStatus(leadId: string) {
  return setLeadContactStatus(leadId, "not_contacted");
}

export async function setLeadContactStatus(
  leadId: string,
  nextStatus: LeadContactStatusValue,
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      status: true,
      tags: true,
    },
  });

  if (!lead) {
    throw new Error("Lead was not found.");
  }

  const tags = buildContactTags(lead.tags, nextStatus);
  const pipelineStatus = nextPipelineStatus(lead.status, nextStatus);

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: pipelineStatus,
      tags,
    },
    select: {
      id: true,
      status: true,
      tags: true,
    },
  });

  // Events are best-effort; tags alone drive the 連絡進捗 UI.
  await syncContactEvents(leadId, nextStatus).catch((error) => {
    console.error("Failed to sync contact events:", error);
  });

  return updated;
}

function nextPipelineStatus(
  current: LeadStatus,
  nextStatus: LeadContactStatusValue,
): LeadStatus {
  if (QUALIFY_PIPELINE_STATUSES.has(current)) {
    return current;
  }

  if (nextStatus === "not_contacted") {
    return RESETTABLE_CONTACT_STATUSES.has(current)
      ? LeadStatus.QUALIFIED
      : current;
  }

  if (nextStatus === "reply") {
    return LeadStatus.REPLIED;
  }

  return LeadStatus.CONTACTED;
}

function buildContactTags(
  existing: string[],
  nextStatus: LeadContactStatusValue,
) {
  let tags = clearContactActivityTags(existing);

  if (nextStatus === "email") {
    tags = addOrReplaceLeadEventTag(tags, LEAD_TAG_EMAIL_CONTACTED);
  } else if (nextStatus === "phone") {
    tags = addOrReplaceLeadEventTag(tags, LEAD_TAG_PHONE_CONTACTED);
  } else if (nextStatus === "reply") {
    tags = addOrReplaceLeadEventTag(tags, LEAD_TAG_EMAIL_CONTACTED);
    tags = addOrReplaceLeadEventTag(tags, LEAD_TAG_EMAIL_REPLIED);
  }

  return tags;
}

function clearContactActivityTags(tags: string[]) {
  return tags.filter((value) =>
    CONTACT_ACTIVITY_TAGS.every(
      (tag) => value !== tag && !value.startsWith(`${tag}@`),
    ),
  );
}

async function syncContactEvents(
  leadId: string,
  nextStatus: LeadContactStatusValue,
) {
  await prisma.contactEvent.deleteMany({
    where: {
      leadId,
      OR: [
        { eventType: "contacted" },
        { channel: "email", eventType: "replied" },
      ],
    },
  });

  if (nextStatus === "not_contacted") return;

  if (nextStatus === "email" || nextStatus === "reply") {
    await logContactEvent(prisma, {
      leadId,
      channel: "email",
      eventType: "contacted",
      source: "manual",
    });
  }

  if (nextStatus === "phone") {
    await logContactEvent(prisma, {
      leadId,
      channel: "phone",
      eventType: "contacted",
      source: "manual",
    });
  }

  if (nextStatus === "reply") {
    await logContactEvent(prisma, {
      leadId,
      channel: "email",
      eventType: "replied",
      source: "manual",
    });
  }
}
