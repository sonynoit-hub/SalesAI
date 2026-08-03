import { prisma } from "@/lib/db/prisma";
import { FollowUpStatus, LeadStatus } from "@/lib/generated/prisma/client";
import {
  addOrReplaceLeadEventTag,
  LEAD_TAG_EMAIL_CONTACTED,
} from "@/lib/leads/constants";
import { logContactEvent } from "@/lib/leads/contact-events";
import { resolveLeadStatusAfterContact } from "@/lib/leads/status";

export async function markManualEmailContact(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      company: true,
      followUpTasks: {
        where: { status: FollowUpStatus.OPEN },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
    },
  });

  if (!lead) {
    throw new Error("Lead was not found.");
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  return prisma.$transaction(async (tx) => {
    const next = await tx.lead.update({
      where: { id: leadId },
      data: {
        status: resolveLeadStatusAfterContact(lead.status) as LeadStatus,
        tags: addOrReplaceLeadEventTag(lead.tags, LEAD_TAG_EMAIL_CONTACTED),
      },
      select: { id: true, status: true, tags: true },
    });

    await logContactEvent(tx, {
      leadId,
      channel: "email",
      eventType: "contacted",
      source: "manual",
    });

    const followUpTask =
      lead.followUpTasks[0] ??
      (await tx.followUpTask.create({
        data: {
          leadId,
          title: `Follow up with ${lead.company.name}`,
          dueDate,
          status: FollowUpStatus.OPEN,
          notes: "Manual email outreach logged from Lead CRM.",
        },
      }));

    return {
      lead: next,
      followUpCreated: !lead.followUpTasks[0],
      followUpTaskId: followUpTask.id,
    };
  });
}
