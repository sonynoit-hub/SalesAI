import { NextResponse } from "next/server";
import { z } from "zod";
import {
  pauseAutoSendQueueItem,
  removeAutoSendQueueItem,
  resumeAutoSendQueueItem,
} from "@/lib/outreach/auto-send-queue";

type ItemRouteProps = {
  params: Promise<{
    itemId: string;
  }>;
};

const actionSchema = z.object({
  action: z.enum(["pause", "resume"]),
});

export async function PATCH(request: Request, { params }: ItemRouteProps) {
  try {
    const { itemId } = await params;
    const body = await request.json();
    const parsed = actionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a valid queue action.",
          },
        },
        { status: 400 },
      );
    }

    const item =
      parsed.data.action === "pause"
        ? await pauseAutoSendQueueItem(itemId)
        : await resumeAutoSendQueueItem(itemId);

    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "QUEUE_UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not update this queue item.",
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: ItemRouteProps) {
  try {
    const { itemId } = await params;
    await removeAutoSendQueueItem(itemId);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "QUEUE_DELETE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not remove this queue item.",
        },
      },
      { status: 500 },
    );
  }
}
