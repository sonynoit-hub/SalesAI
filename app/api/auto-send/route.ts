import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enqueueAutoSendDraft,
  processDueAutoSendQueue,
} from "@/lib/outreach/auto-send-queue";
import { deliveryProviders } from "@/lib/outreach/send-email";

const enqueueSchema = z.object({
  draftId: z.string().trim().min(1),
  provider: z.enum(deliveryProviders).optional(),
  delayMinutes: z.number().min(0).max(24 * 60),
});

const processSchema = z.object({
  action: z.literal("run_due"),
  limit: z.number().int().min(1).max(25).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enqueueSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a valid draft id and delay.",
          },
        },
        { status: 400 },
      );
    }

    const item = await enqueueAutoSendDraft(parsed.data);
    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not add this draft to the auto-send queue.",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = processSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a valid auto-send action.",
          },
        },
        { status: 400 },
      );
    }

    const results = await processDueAutoSendQueue(parsed.data.limit ?? 10);
    return NextResponse.json({ data: results });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "PROCESS_QUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not process the auto-send queue.",
        },
      },
      { status: 500 },
    );
  }
}
