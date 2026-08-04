import { prisma } from "@/lib/db/prisma";
import { LeadStatus } from "@/lib/generated/prisma/client";
import {
  LEAD_TAG_EMAIL_CONTACTED,
  LEAD_TAG_EMAIL_REPLIED,
  LEAD_TAG_PHONE_CONTACTED,
} from "@/lib/leads/constants";

const CONTACT_ACTIVITY_TAGS = [
  LEAD_TAG_EMAIL_CONTACTED,
  LEAD_TAG_PHONE_CONTACTED,
  LEAD_TAG_EMAIL_REPLIED,
] as const;

const RESETTABLE_CONTACT_STATUSES = new Set(["CONTACTED", "REPLIED"]);

export async function resetLeadContactStatus(leadId: string) {
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

  const nextStatus = RESETTABLE_CONTACT_STATUSES.has(lead.status)
    ? LeadStatus.QUALIFIED
    : lead.status;

  return prisma.$transaction(async (tx) => {
    await tx.contactEvent.deleteMany({
      where: {
        leadId,
        OR: [
          { eventType: "contacted" },
          { channel: "email", eventType: "replied" },
        ],
      },
    });

    return tx.lead.update({
      where: { id: leadId },
      data: {
        status: nextStatus,
        tags: clearContactActivityTags(lead.tags),
      },
      select: {
        id: true,
        status: true,
        tags: true,
      },
    });
  });
}

function clearContactActivityTags(tags: string[]) {
  return tags.filter((value) =>
    CONTACT_ACTIVITY_TAGS.every(
      (tag) => value !== tag && !value.startsWith(`${tag}@`),
    ),
  );
}
