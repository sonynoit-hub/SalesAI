import { NextResponse } from "next/server";
import { searchAnalyzeRequestSchema } from "@/lib/search-analysis/schemas";
import { runStrictPublicCompanySearchGoal } from "@/lib/search-analysis/strict-public-search";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = searchAnalyzeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide an opportunity description, industry, and location.",
          },
        },
        { status: 400 },
      );
    }

    const response = await runStrictPublicCompanySearchGoal(parsed.data);

    return NextResponse.json({ data: response });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "SEARCH_ANALYSIS_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Search analysis failed unexpectedly.",
        },
      },
      { status: 500 },
    );
  }
}
