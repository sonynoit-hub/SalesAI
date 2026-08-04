import { z } from "zod";
import {
  buildCompanyIdentity,
  normalizeCompanyWebsiteUrl,
} from "@/lib/company-identity";
import { prisma } from "@/lib/db/prisma";
import { formatIndustryJa } from "@/lib/industries";
import { normalizeLocationLabel } from "@/lib/leads/constants";

export const companyProfileSchema = z.object({
  name: z.string().trim().max(200).optional().default(""),
  websiteUrl: z.string().trim().max(500).optional().default(""),
  industry: z.string().trim().max(120).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  primaryEmail: z.string().trim().max(200).optional().default(""),
  contactFormUrl: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(4_000).optional().default(""),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export async function updateCompanyProfile(
  companyId: string,
  input: CompanyProfileInput,
) {
  const existing = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!existing) {
    throw new Error("会社が見つかりませんでした。");
  }

  const websiteSource = input.websiteUrl.trim() || existing.websiteUrl;
  const withProtocol = /^https?:\/\//i.test(websiteSource)
    ? websiteSource
    : `https://${websiteSource}`;

  let companyWebsiteUrl: string;
  try {
    new URL(withProtocol);
    companyWebsiteUrl = normalizeCompanyWebsiteUrl(withProtocol);
  } catch {
    throw new Error("有効なウェブサイトURLを入力してください。");
  }

  const identity = buildCompanyIdentity(companyWebsiteUrl);
  const location = normalizeLocationLabel(input.location) || null;
  const primaryEmail = normalizeOptionalEmail(input.primaryEmail);
  const contactFormUrl = normalizeOptionalUrl(input.contactFormUrl);

  if (companyWebsiteUrl !== existing.websiteUrl) {
    const conflict = await prisma.company.findFirst({
      where: {
        id: { not: companyId },
        OR: [
          { websiteUrl: companyWebsiteUrl },
          ...(identity?.normalizedDomain
            ? [{ normalizedDomain: identity.normalizedDomain }]
            : []),
        ],
      },
    });

    if (conflict) {
      throw new Error("このウェブサイトURLは別の会社ですでに使われています。");
    }
  }

  return prisma.company.update({
    where: { id: companyId },
    data: {
      name: input.name,
      websiteUrl: companyWebsiteUrl,
      industry: formatIndustryJa(input.industry) || null,
      location,
      address: input.address || null,
      primaryEmail,
      contactFormUrl,
      description: input.description || null,
      canonicalWebsiteUrl: identity?.canonicalWebsiteUrl,
      normalizedDomain: identity?.normalizedDomain,
      companyKey: identity?.companyKey,
      sourceUrl: companyWebsiteUrl,
      lastSeenAt: new Date(),
    },
  });
}

function normalizeOptionalEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("有効なメールアドレスを入力してください。");
  }
  return email;
}

function normalizeOptionalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    throw new Error("有効なお問い合わせフォームURLを入力してください。");
  }
}
