import { NextResponse } from "next/server";
import { getDatabaseErrorMessage } from "@/lib/db/sales-workflow";
import {
  researchSummarySchema,
  upsertCompanyResearchSummary,
} from "@/lib/research/update-summary";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = researchSummarySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "メモの内容を入力してください。",
          },
        },
        { status: 400 },
      );
    }

    const research = await upsertCompanyResearchSummary(parsed.data);
    return NextResponse.json({ data: research });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    return NextResponse.json(
      {
        error: {
          code: databaseErrorMessage
            ? "DATABASE_UNAVAILABLE"
            : "UPDATE_RESEARCH_FAILED",
          message:
            databaseErrorMessage ??
            (error instanceof Error
              ? error.message
              : "メモを保存できませんでした。"),
        },
      },
      { status: databaseErrorMessage ? 503 : 500 },
    );
  }
}
