import { NextResponse } from "next/server";
import {
  resetLeadContactStatus,
  setLeadContactStatus,
  type LeadContactStatusValue,
} from "@/lib/leads/contact-status";

export const runtime = "nodejs";

const CONTACT_STATUS_VALUES = new Set<LeadContactStatusValue>([
  "not_contacted",
  "email",
  "phone",
  "reply",
]);

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { leadId } = await params;
    const body = (await request.json()) as { status?: string };
    const status = body.status;

    if (!status || !CONTACT_STATUS_VALUES.has(status as LeadContactStatusValue)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "連絡進捗の値が不正です。",
          },
        },
        { status: 400 },
      );
    }

    const lead = await setLeadContactStatus(
      leadId,
      status as LeadContactStatusValue,
    );

    return NextResponse.json({
      data: {
        leadId: lead.id,
        status: lead.status,
        contactStatus: status,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "連絡進捗を更新できませんでした。";
    const notFound = message === "Lead was not found.";

    return NextResponse.json(
      {
        error: {
          code: notFound ? "LEAD_NOT_FOUND" : "SET_CONTACT_STATUS_FAILED",
          message: notFound ? "リードが見つかりませんでした。" : message,
        },
      },
      { status: notFound ? 404 : 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { leadId } = await params;
    const lead = await resetLeadContactStatus(leadId);

    return NextResponse.json({
      data: {
        leadId: lead.id,
        status: lead.status,
        contactStatus: "not_contacted",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "連絡ステータスを未連絡に戻せませんでした。";
    const notFound = message === "Lead was not found.";

    return NextResponse.json(
      {
        error: {
          code: notFound ? "LEAD_NOT_FOUND" : "RESET_CONTACT_STATUS_FAILED",
          message: notFound
            ? "リードが見つかりませんでした。"
            : message,
        },
      },
      { status: notFound ? 404 : 500 },
    );
  }
}
