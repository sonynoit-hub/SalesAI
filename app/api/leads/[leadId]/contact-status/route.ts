import { NextResponse } from "next/server";
import { resetLeadContactStatus } from "@/lib/leads/contact-status";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { leadId } = await params;
    const lead = await resetLeadContactStatus(leadId);

    return NextResponse.json({
      data: {
        leadId: lead.id,
        status: lead.status,
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
