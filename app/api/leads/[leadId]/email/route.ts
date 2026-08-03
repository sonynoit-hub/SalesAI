import { NextResponse } from "next/server";
import { markManualEmailContact } from "@/lib/leads/mark-manual-email-contact";

export const runtime = "nodejs";

type EmailRouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function POST(
  _request: Request,
  { params }: EmailRouteContext,
) {
  try {
    const { leadId } = await params;
    const result = await markManualEmailContact(leadId);

    return NextResponse.json({ data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "メール送信記録の更新に失敗しました。";
    const notFound = message === "Lead was not found.";

    return NextResponse.json(
      {
        error: {
          code: notFound ? "LEAD_NOT_FOUND" : "MARK_EMAILED_FAILED",
          message: notFound ? "リードが見つかりませんでした。" : message,
        },
      },
      { status: notFound ? 404 : 500 },
    );
  }
}
