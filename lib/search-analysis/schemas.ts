import { z } from "zod";

export const searchAnalyzeRequestSchema = z.object({
  referenceKeyword: z.string().trim().min(2).max(500).optional(),
  opportunityDescription: z.string().trim().min(2).max(500).optional(),
  industry: z.string().trim().max(80).optional().default(""),
  location: z.string().trim().max(80).optional().default(""),
  excludeKeywords: z
    .array(z.string().trim().min(1).max(80))
    .max(12)
    .optional()
    .default([]),
  targetCompanyCount: z.coerce.number().int().min(1).max(20).optional(),
  resultLimit: z.coerce.number().int().min(1).max(20).optional(),
}).transform((value, context) => {
  const referenceKeyword = value.referenceKeyword ?? value.opportunityDescription;

  if (!referenceKeyword) {
    context.addIssue({
      code: "custom",
      message: "Please provide a reference keyword.",
      path: ["referenceKeyword"],
    });
    return z.NEVER;
  }

  const targetCompanyCount = value.targetCompanyCount ?? value.resultLimit ?? 5;

  return {
    referenceKeyword,
    opportunityDescription: referenceKeyword,
    industry: value.industry,
    location: value.location,
    excludeKeywords: value.excludeKeywords,
    targetCompanyCount,
    resultLimit: targetCompanyCount,
  };
});

export const ollamaAnalysisSchema = z.object({
  strategy: z.object({
    objective: z.string(),
    signals: z.array(z.string()).min(3).max(8),
    sources: z.array(z.string()).min(2).max(6),
    confidence: z.enum(["High", "Medium", "Low"]),
  }),
  results: z.array(
    z.object({
      companyName: z.string(),
      candidateId: z.string(),
      aiOpportunity: z.string(),
      whyThisMatches: z.array(z.string()).min(2).max(5),
      industry: z.string(),
      location: z.string(),
      employees: z.string(),
    }),
  ),
});

export type SearchAnalyzeRequest = z.infer<typeof searchAnalyzeRequestSchema>;
