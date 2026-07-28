import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { LeadStatus } from "@/lib/generated/prisma/client";
import {
  addOrReplaceLeadEventTag,
  LEAD_TAG_PHONE_CONTACTED,
} from "@/lib/leads/constants";
import { logContactEvent } from "@/lib/leads/contact-events";

export const runtime = "nodejs";

type CallRouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function POST(
  _request: Request,
  { params }: CallRouteContext,
) {
  try {
    const { leadId } = await params;
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, tags: true },
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

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: LeadStatus.CONTACTED,
          tags: addOrReplaceLeadEventTag(lead.tags, LEAD_TAG_PHONE_CONTACTED),
        },
        select: { id: true, status: true, tags: true },
      });

      await logContactEvent(tx, {
        leadId,
        channel: "phone",
        eventType: "contacted",
        source: "manual",
      });

      return next;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "MARK_CALLED_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "架電記録の更新に失敗しました。",
        },
      },
      { status: 500 },
    );
  }
}
