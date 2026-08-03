import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { LeadStatus } from "@/lib/generated/prisma/client";

export const researchSummarySchema = z.object({
  companyId: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(8_000),
});

export type ResearchSummaryInput = z.infer<typeof researchSummarySchema>;

export async function upsertCompanyResearchSummary(
  input: ResearchSummaryInput,
) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
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
    throw new Error("会社が見つかりませんでした。");
  }

  const existing = company.research[0];
  const research = existing
    ? await prisma.companyResearch.update({
        where: { id: existing.id },
        data: { summary: input.summary },
      })
    : await prisma.companyResearch.create({
        data: {
          companyId: company.id,
          summary: input.summary,
          researchSources: ["manual"],
        },
      });

  const lead = company.leads[0];
  if (lead && lead.status === LeadStatus.NEW) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: LeadStatus.RESEARCHED },
    });
  }

  return research;
}
