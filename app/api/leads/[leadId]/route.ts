import { NextResponse } from "next/server";
import { getDatabaseErrorMessage } from "@/lib/db/sales-workflow";
import {
  deleteManagedLead,
  leadManageSchema,
  updateManagedLead,
} from "@/lib/leads/manage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { leadId } = await context.params;
    const body = await request.json();
    const parsed = leadManageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide valid lead fields.",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const result = await updateManagedLead(leadId, parsed.data);

    return NextResponse.json({
      data: {
        leadId: result.lead.id,
        companyId: result.company.id,
        contactId: result.contact?.id ?? null,
      },
    });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);
    const message =
      databaseErrorMessage ??
      (error instanceof Error ? error.message : "Could not update lead.");
    const notFound = message === "Lead was not found.";

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

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { leadId } = await context.params;
    const result = await deleteManagedLead(leadId);

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);
    const message =
      databaseErrorMessage ??
      (error instanceof Error ? error.message : "Could not delete lead.");
    const notFound = message === "Lead was not found.";

    return NextResponse.json(
      {
        error: {
          code: databaseErrorMessage
            ? "DATABASE_UNAVAILABLE"
            : notFound
              ? "NOT_FOUND"
              : "DELETE_FAILED",
          message,
        },
      },
      { status: databaseErrorMessage ? 503 : notFound ? 404 : 400 },
    );
  }
}
