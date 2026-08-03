import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichCompanyRecord } from "@/lib/companies/enrich-company";
import { getDatabaseErrorMessage } from "@/lib/db/sales-workflow";

export const runtime = "nodejs";

const enrichCompanySchema = z.object({
  companyId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enrichCompanySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "会社IDを指定してください。",
          },
        },
        { status: 400 },
      );
    }

    const result = await enrichCompanyRecord(parsed.data.companyId);

    if (!result.ok && result.message === "会社が見つかりませんでした。") {
      return NextResponse.json(
        {
          error: {
            code: "COMPANY_NOT_FOUND",
            message: result.message,
          },
        },
        { status: 404 },
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          error: {
            code: "ENRICH_COMPANY_FAILED",
            message: result.message,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    return NextResponse.json(
      {
        error: {
          code: databaseErrorMessage
            ? "DATABASE_UNAVAILABLE"
            : "ENRICH_COMPANY_FAILED",
          message:
            databaseErrorMessage ??
            (error instanceof Error
              ? error.message
              : "連絡先の自動取得に失敗しました。"),
        },
      },
      { status: databaseErrorMessage ? 503 : 500 },
    );
  }
}
