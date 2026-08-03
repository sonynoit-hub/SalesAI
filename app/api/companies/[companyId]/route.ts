import { NextResponse } from "next/server";
import {
  companyProfileSchema,
  updateCompanyProfile,
} from "@/lib/companies/update";
import { getDatabaseErrorMessage } from "@/lib/db/sales-workflow";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    companyId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { companyId } = await context.params;
    const body = await request.json();
    const parsed = companyProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "会社情報の入力内容を確認してください。",
          },
        },
        { status: 400 },
      );
    }

    const company = await updateCompanyProfile(companyId, parsed.data);

    return NextResponse.json({
      data: {
        companyId: company.id,
      },
    });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);
    const message =
      databaseErrorMessage ??
      (error instanceof Error ? error.message : "会社情報を更新できませんでした。");
    const notFound = message === "会社が見つかりませんでした。";

    return NextResponse.json(
      {
        error: {
          code: databaseErrorMessage
            ? "DATABASE_UNAVAILABLE"
            : notFound
              ? "NOT_FOUND"
              : "UPDATE_FAILED",
          message,
        },
      },
      { status: databaseErrorMessage ? 503 : notFound ? 404 : 400 },
    );
  }
}
