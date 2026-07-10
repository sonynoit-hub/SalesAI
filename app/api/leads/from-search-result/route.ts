import { NextResponse } from "next/server";
import {
  saveLeadFromSearchResult,
  saveLeadFromSearchResultSchema,
} from "@/lib/leads/from-search-result";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = saveLeadFromSearchResultSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a company name and valid website URL.",
          },
        },
        { status: 400 },
      );
    }

    const data = await saveLeadFromSearchResult(parsed.data);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "SAVE_LEAD_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not save the search result as a lead.",
        },
      },
      { status: 500 },
    );
  }
}
