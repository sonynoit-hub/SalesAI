import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { EmailDraftStatus } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const updateDraftSchema = z.object({
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(20_000).optional(),
  status: z
    .enum([
      EmailDraftStatus.DRAFT,
      EmailDraftStatus.APPROVED,
      EmailDraftStatus.DISCARDED,
    ])
    .optional(),
});

type DraftRouteProps = {
  params: Promise<{
    draftId: string;
  }>;
};

export async function PATCH(request: Request, { params }: DraftRouteProps) {
  try {
    const { draftId } = await params;
    const body = await request.json();
    const parsed = updateDraftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a valid draft update.",
          },
        },
        { status: 400 },
      );
    }

    const existingDraft = await prisma.emailDraft.findUnique({
      where: { id: draftId },
    });

    if (!existingDraft) {
      return NextResponse.json(
        {
          error: {
            code: "DRAFT_NOT_FOUND",
            message: "Email draft was not found.",
          },
        },
        { status: 404 },
      );
    }

    const updatedDraft = await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        subject: parsed.data.subject ?? existingDraft.subject,
        body: parsed.data.body ?? existingDraft.body,
        status: parsed.data.status ?? existingDraft.status,
      },
    });

    return NextResponse.json({ data: updatedDraft });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_DRAFT_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not update this draft.",
        },
      },
      { status: 500 },
    );
  }
}
