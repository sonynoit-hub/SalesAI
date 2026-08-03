import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { FollowUpStatus } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const updateFollowUpSchema = z.object({
  action: z.enum(["done", "skip", "reschedule"]),
  dueDate: z.string().datetime().optional(),
});

type FollowUpRouteProps = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function PATCH(request: Request, { params }: FollowUpRouteProps) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const parsed = updateFollowUpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a valid follow-up action.",
          },
        },
        { status: 400 },
      );
    }

    const existingTask = await prisma.followUpTask.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      return NextResponse.json(
        {
          error: {
            code: "FOLLOW_UP_NOT_FOUND",
            message: "Follow-up task was not found.",
          },
        },
        { status: 404 },
      );
    }

    const nextDueDate =
      parsed.data.action === "reschedule"
        ? parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : existingTask.dueDate;

    const updatedTask = await prisma.followUpTask.update({
      where: { id: taskId },
      data:
        parsed.data.action === "done"
          ? { status: FollowUpStatus.DONE }
          : parsed.data.action === "skip"
            ? { status: FollowUpStatus.SKIPPED }
            : {
                status: FollowUpStatus.OPEN,
                dueDate: nextDueDate,
              },
    });

    return NextResponse.json({ data: updatedTask });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_FOLLOW_UP_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not update this follow-up task.",
        },
      },
      { status: 500 },
    );
  }
}
