import { NextResponse } from "next/server";
import { getDatabaseErrorMessage } from "@/lib/db/sales-workflow";
import { createManagedLead, leadManageSchema } from "@/lib/leads/manage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = leadManageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a company name and valid lead fields.",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const result = await createManagedLead(parsed.data);

    return NextResponse.json({
      data: {
        leadId: result.lead.id,
        companyId: result.company.id,
        contactId: result.contact?.id ?? null,
      },
    });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    return NextResponse.json(
      {
        error: {
          code: databaseErrorMessage ? "DATABASE_UNAVAILABLE" : "CREATE_FAILED",
          message:
            databaseErrorMessage ??
            (error instanceof Error ? error.message : "Could not create lead."),
        },
      },
      { status: databaseErrorMessage ? 503 : 400 },
    );
  }
}
