import { prisma } from "@/lib/db/prisma";
import {
  EmailDraftStatus,
  FollowUpStatus,
  LeadStatus,
  SentEmailStatus,
} from "@/lib/generated/prisma/client";
import {
  getDefaultDeliveryProvider,
  type DeliveryProvider,
  sendOutboundEmail,
} from "@/lib/outreach/send-email";
import {
  addOrReplaceLeadEventTag,
  LEAD_TAG_EMAIL_CONTACTED,
} from "@/lib/leads/constants";
import { logContactEvent } from "@/lib/leads/contact-events";

export type SendApprovedDraftResult = {
  sentEmail: {
    id: string;
    leadId: string;
    contactId: string | null;
    emailDraftId: string | null;
    gmailMessageId: string | null;
    toEmail: string;
    subject: string;
    body: string;
    sentAt: Date;
    status: SentEmailStatus;
    errorMessage: string | null;
  };
  followUpTask: {
    id: string;
    leadId: string;
    sentEmailId: string | null;
    title: string;
    dueDate: Date;
    status: FollowUpStatus;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  delivery: {
    provider: DeliveryProvider;
    status: SentEmailStatus;
    messageId?: string | null;
    errorMessage?: string | null;
  };
};

export async function sendApprovedDraft({
  draftId,
  provider = getDefaultDeliveryProvider(),
}: {
  draftId: string;
  provider?: DeliveryProvider;
}): Promise<SendApprovedDraftResult> {
  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    include: {
      lead: {
        include: {
          company: true,
          contact: true,
          followUpTasks: {
            where: { status: FollowUpStatus.OPEN },
            orderBy: { dueDate: "asc" },
            take: 1,
          },
        },
      },
      contact: true,
    },
  });

  if (!draft) {
    throw new Error("Email draft was not found.");
  }

  if (draft.status === EmailDraftStatus.DISCARDED) {
    throw new Error("Discarded drafts cannot be marked as sent.");
  }

  if (draft.status !== EmailDraftStatus.APPROVED) {
    throw new Error("Approve this draft before marking it as sent.");
  }

  const recipientEmail =
    draft.contact?.email ??
    draft.lead.contact?.email ??
    draft.lead.company.primaryEmail;

  if (!recipientEmail) {
    throw new Error("This draft does not have a recipient email yet.");
  }

  const delivery = await sendOutboundEmail({
    provider,
    toEmail: recipientEmail,
    subject: draft.subject,
    body: draft.body,
  });

  return prisma.$transaction(async (tx) => {
    const sentEmail = await tx.sentEmail.create({
      data: {
        leadId: draft.leadId,
        contactId: draft.contactId,
        emailDraftId: draft.id,
        toEmail: recipientEmail,
        subject: draft.subject,
        body: draft.body,
        status: delivery.status,
        gmailMessageId: delivery.messageId,
        errorMessage: delivery.errorMessage,
      },
    });

    if (delivery.status === SentEmailStatus.FAILED) {
      await logContactEvent(tx, {
        leadId: draft.leadId,
        channel: "email",
        eventType: "attempt_failed",
        eventAt: sentEmail.sentAt,
        source: provider,
        note: delivery.errorMessage ?? "Email provider returned failed status.",
        referenceId: sentEmail.id,
      });

      return {
        sentEmail,
        followUpTask: null,
        delivery,
      };
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    await tx.emailDraft.update({
      where: { id: draft.id },
      data: {
        status: EmailDraftStatus.SENT,
      },
    });

    await tx.lead.update({
      where: { id: draft.leadId },
      data: {
        status: LeadStatus.CONTACTED,
        tags: addOrReplaceLeadEventTag(draft.lead.tags, LEAD_TAG_EMAIL_CONTACTED),
      },
    });

    await logContactEvent(tx, {
      leadId: draft.leadId,
      channel: "email",
      eventType: "contacted",
      eventAt: sentEmail.sentAt,
      source: provider,
      referenceId: sentEmail.id,
    });

    const followUpTask =
      draft.lead.followUpTasks[0] ??
      (await tx.followUpTask.create({
        data: {
          leadId: draft.leadId,
          sentEmailId: sentEmail.id,
          title: `Follow up with ${draft.lead.company.name}`,
          dueDate,
          status: FollowUpStatus.OPEN,
          notes: `Sent outreach to ${recipientEmail}.`,
        },
      }));

    return {
      sentEmail,
      followUpTask,
      delivery,
    };
  });
}
