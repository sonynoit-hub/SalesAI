import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { LeadStatus } from "@/lib/generated/prisma/client";
import { buildCompanyResearchDraft } from "@/lib/research/company-research";

export const runtime = "nodejs";

const createResearchSchema = z.object({
  companyId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createResearchSchema.safeParse(body);

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
        leads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
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

    const existingResearch = company.research[0];

    if (existingResearch) {
      return NextResponse.json({ data: existingResearch });
    }

    const researchDraft = await buildCompanyResearchDraft(company);
    const research = await prisma.companyResearch.create({
      data: {
        companyId: company.id,
        summary: researchDraft.summary,
        productsOrServices: researchDraft.productsOrServices,
        targetCustomers: researchDraft.targetCustomers,
        painPoints: researchDraft.painPoints,
        salesOpportunities: researchDraft.salesOpportunities,
        technologies: researchDraft.technologies,
        recentSignals: researchDraft.recentSignals,
        researchSources: researchDraft.researchSources,
        rawContent: researchDraft.rawContent,
      },
    });

    const lead = company.leads[0];

    if (lead) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.RESEARCHED },
      });
    }

    return NextResponse.json({ data: research });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CREATE_RESEARCH_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not create company research.",
        },
      },
      { status: 500 },
    );
  }
}
