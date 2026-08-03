import { z } from "zod";
import {
  buildCompanyIdentity,
  normalizeCompanyWebsiteUrl,
} from "@/lib/company-identity";
import { prisma } from "@/lib/db/prisma";
import { formatIndustryJa } from "@/lib/industries";
import {
  CompanySource,
  LeadPriority,
  LeadStatus,
  SearchSource,
} from "@/lib/generated/prisma/client";

export const saveLeadFromSearchResultSchema = z.object({
  query: z.string().trim().min(1).max(500),
  companyName: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().url(),
  description: z.string().trim().max(12_000).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  sourceUrl: z.string().trim().url().optional(),
  industry: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  size: z.string().trim().max(120).optional(),
  publicEmail: z.string().trim().email().optional(),
  contactFormUrl: z.string().trim().url().optional(),
  aiOpportunity: z.string().trim().max(500).optional(),
  whyThisMatches: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
});

export type SaveLeadFromSearchResultInput = z.infer<
  typeof saveLeadFromSearchResultSchema
>;

export async function saveLeadFromSearchResult(input: SaveLeadFromSearchResultInput) {
  const companyWebsiteUrl = normalizeCompanyWebsiteUrl(input.websiteUrl);
  const identity = buildCompanyIdentity(input.websiteUrl);
  const sourceUrl = input.sourceUrl ?? input.websiteUrl;
  const source = toSearchSource(input.source);

  return prisma.$transaction(async (tx) => {
    const existingCompany = await tx.company.findFirst({
      where: {
        OR: [
          { websiteUrl: companyWebsiteUrl },
          ...(identity?.normalizedDomain
            ? [{ normalizedDomain: identity.normalizedDomain }]
            : []),
        ],
      },
    });
    const companyData = {
      name: input.companyName,
      industry: formatIndustryJa(input.industry) || undefined,
      location: input.location || undefined,
      size: input.size || undefined,
      description: input.description || input.aiOpportunity || undefined,
      primaryEmail: input.publicEmail || undefined,
      contactFormUrl: input.contactFormUrl || undefined,
      canonicalWebsiteUrl: identity?.canonicalWebsiteUrl,
      normalizedDomain: identity?.normalizedDomain,
      companyKey: identity?.companyKey,
      source: CompanySource.SEARCH,
      sourceUrl,
      lastSeenAt: new Date(),
      savedAt: new Date(),
    };
    const company = existingCompany
      ? await tx.company.update({
          where: { id: existingCompany.id },
          data: {
            ...companyData,
            websiteUrl: companyWebsiteUrl,
            seenCount: { increment: 1 },
          },
        })
      : await tx.company.create({
          data: {
            ...companyData,
            websiteUrl: companyWebsiteUrl,
            seenCount: 1,
          },
        });

    const searchResult = await tx.searchResult.create({
      data: {
        query: input.query,
        companyName: input.companyName,
        websiteUrl: companyWebsiteUrl,
        snippet: input.description || input.aiOpportunity,
        source,
        sourceUrl,
        savedAsCompanyId: company.id,
      },
    });

    const existingLead = await tx.lead.findFirst({
      where: { companyId: company.id },
      orderBy: { updatedAt: "desc" },
    });

    const lead =
      existingLead ??
      (await tx.lead.create({
        data: {
          companyId: company.id,
          status: LeadStatus.NEW,
          priority: LeadPriority.MEDIUM,
          tags: buildTags(input),
          notes: input.aiOpportunity
            ? `Search opportunity: ${input.aiOpportunity}`
            : "Saved from lead search.",
        },
      }));

    if (identity?.normalizedDomain) {
      await tx.searchCandidate.updateMany({
        where: {
          normalizedDomain: identity.normalizedDomain,
        },
        data: {
          companyId: company.id,
          status: "SAVED",
        },
      });
    }

    return {
      company,
      lead,
      searchResult,
      createdCompany: !existingCompany,
      createdLead: !existingLead,
    };
  });
}

function toSearchSource(source: string | undefined) {
  const normalized = source?.toLowerCase();

  if (normalized === "directory") return SearchSource.DIRECTORY;
  if (normalized === "manual") return SearchSource.MANUAL;
  if (normalized === "sns") return SearchSource.SNS;

  return SearchSource.SEARXNG;
}

function buildTags(input: SaveLeadFromSearchResultInput) {
  return [input.industry, input.location]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/\s+/g, "-"))
    .slice(0, 4);
}
