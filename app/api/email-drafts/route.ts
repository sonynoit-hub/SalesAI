import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  EmailDraftStatus,
  EmailLanguage,
  EmailTone,
  LeadPriority,
  LeadStatus,
} from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const createDraftSchema = z.object({
  companyId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createDraftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a company id.",
          },
        },
        { status: 400 },
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: parsed.data.companyId },
      include: {
        contacts: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
        leads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            emailDrafts: {
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
          },
        },
        research: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!company) {
      return NextResponse.json(
        {
          error: {
            code: "COMPANY_NOT_FOUND",
            message: "Company was not found.",
          },
        },
        { status: 404 },
      );
    }

    const existingLead = company.leads[0];
    const lead =
      existingLead ??
      (await prisma.lead.create({
        data: {
          companyId: company.id,
          contactId: company.contacts[0]?.id,
          status: LeadStatus.NEW,
          priority: LeadPriority.MEDIUM,
          notes: "Created during draft generation.",
        },
      }));

    if (existingLead?.emailDrafts[0]) {
      return NextResponse.json({ data: existingLead.emailDrafts[0] });
    }

    const contact = company.contacts[0];
    const research = company.research[0];
    const recipientName = contact?.name?.split(" ")[0] ?? "there";
    const subject = `Idea for ${company.name || "your team"}`;
    const angle =
      research?.salesOpportunities[0] ??
      company.description ??
      "a small workflow improvement";

    const draft = await prisma.emailDraft.create({
      data: {
        leadId: lead.id,
        contactId: contact?.id,
        subject,
        body: [
          `Hello ${recipientName},`,
          "",
          `I noticed ${company.name || "your company"} may have an opportunity around ${angle.toLowerCase()}.`,
          "",
          "Would it be useful to compare a small, practical improvement idea?",
          "",
          "Best regards,",
        ].join("\n"),
        tone: EmailTone.PROFESSIONAL,
        language: EmailLanguage.EN,
        status: EmailDraftStatus.DRAFT,
      },
    });

    return NextResponse.json({ data: draft });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CREATE_DRAFT_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not create email draft.",
        },
      },
      { status: 500 },
    );
  }
}
