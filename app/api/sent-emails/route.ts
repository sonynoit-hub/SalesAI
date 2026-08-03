import { NextResponse } from "next/server";
import { z } from "zod";
import { SentEmailStatus } from "@/lib/generated/prisma/client";
import { sendApprovedDraft } from "@/lib/outreach/send-approved-draft";
import { deliveryProviders } from "@/lib/outreach/send-email";

export const runtime = "nodejs";

const markSentSchema = z.object({
  draftId: z.string().trim().min(1),
  provider: z.enum(deliveryProviders).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = markSentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a valid draft id.",
          },
        },
        { status: 400 },
      );
    }

    const result = await sendApprovedDraft({
      draftId: parsed.data.draftId,
      provider: parsed.data.provider,
    });

    if (result.delivery.status === SentEmailStatus.FAILED) {
      return NextResponse.json(
        {
          error: {
            code: "DELIVERY_FAILED",
            message:
              result.delivery.errorMessage ??
              "The email provider could not send this draft.",
          },
          data: result,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof Error) {
      const status =
        error.message === "Email draft was not found."
          ? 404
          : [
                "Discarded drafts cannot be marked as sent.",
                "Approve this draft before marking it as sent.",
                "This draft does not have a recipient email yet.",
              ].includes(error.message)
            ? 400
            : 500;

      return NextResponse.json(
        {
          error: {
            code:
              status === 404
                ? "DRAFT_NOT_FOUND"
                : status === 400
                  ? "SEND_NOT_ALLOWED"
                  : "MARK_SENT_FAILED",
            message: error.message,
          },
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "MARK_SENT_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not mark this draft as sent.",
        },
      },
      { status: 500 },
    );
  }
}
