import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { FollowUpStatus, LeadStatus } from "@/lib/generated/prisma/client";
import {
  addOrReplaceLeadEventTag,
  LEAD_TAG_EMAIL_REPLIED,
} from "@/lib/leads/constants";
import { logContactEvent } from "@/lib/leads/contact-events";

export const runtime = "nodejs";

type ReplyRouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function POST(
  _request: Request,
  { params }: ReplyRouteContext,
) {
  try {
    const { leadId } = await params;
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        followUpTasks: {
          where: { status: FollowUpStatus.OPEN },
          select: { id: true },
        },
      },
    });

    if (!lead) {
      return NextResponse.json(
        {
          error: {
            code: "LEAD_NOT_FOUND",
            message: "リードが見つかりませんでした。",
          },
        },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          status: LeadStatus.REPLIED,
          tags: addOrReplaceLeadEventTag(lead.tags, LEAD_TAG_EMAIL_REPLIED),
        },
      });

      if (lead.followUpTasks.length > 0) {
        await tx.followUpTask.updateMany({
          where: {
            leadId,
            status: FollowUpStatus.OPEN,
          },
          data: { status: FollowUpStatus.DONE },
        });
      }

      await logContactEvent(tx, {
        leadId,
        channel: "email",
        eventType: "replied",
        source: "manual",
      });
    });

    return NextResponse.json({
      data: {
        leadId,
        status: LeadStatus.REPLIED,
        closedFollowUps: lead.followUpTasks.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "MARK_REPLIED_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "返信ありへの更新に失敗しました。",
        },
      },
      { status: 500 },
    );
  }
}
