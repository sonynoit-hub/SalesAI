import { createHash } from "node:crypto";
import { z } from "zod";
import {
  buildCompanyIdentity,
  normalizeCompanyWebsiteUrl,
} from "@/lib/company-identity";
import { prisma } from "@/lib/db/prisma";
import { formatIndustryJa } from "@/lib/industries";
import {
  LEAD_PRIORITY_OPTIONS,
  LEAD_STATUS_OPTIONS,
  normalizeLocationLabel,
} from "@/lib/leads/constants";
import {
  CompanySource,
  type LeadPriority,
  type LeadStatus,
} from "@/lib/generated/prisma/client";

export { LEAD_PRIORITY_OPTIONS, LEAD_STATUS_OPTIONS } from "@/lib/leads/constants";

export const leadManageSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().max(500).optional().default(""),
  contactName: z.string().trim().max(120).optional().default(""),
  contactTitle: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(80).optional().default(""),
  industry: z.string().trim().max(120).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  status: z.enum(LEAD_STATUS_OPTIONS).default("NEW"),
  priority: z.enum(LEAD_PRIORITY_OPTIONS).default("MEDIUM"),
  notes: z.string().trim().max(4_000).optional().default(""),
});

export type LeadManageInput = z.infer<typeof leadManageSchema>;

export async function createManagedLead(input: LeadManageInput) {
  const email = normalizeEmail(input.email);
  const location = normalizeLocationLabel(input.location) || null;
  const industry = formatIndustryJa(input.industry) || null;
  const websiteUrl = resolveWebsiteUrl(input.websiteUrl, input.companyName, email);
  const companyWebsiteUrl = normalizeCompanyWebsiteUrl(websiteUrl);
  const identity = buildCompanyIdentity(websiteUrl);

  const existingCompany = await prisma.company.findFirst({
    where: {
      OR: [
        { websiteUrl: companyWebsiteUrl },
        ...(identity?.normalizedDomain
          ? [{ normalizedDomain: identity.normalizedDomain }]
          : []),
      ],
    },
    include: {
      leads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (existingCompany?.leads[0]) {
    throw new Error(
      "A lead for this company website already exists. Edit that row instead.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const company = existingCompany
      ? await tx.company.update({
          where: { id: existingCompany.id },
          data: {
            name: input.companyName,
            websiteUrl: companyWebsiteUrl,
            industry: industry || existingCompany.industry,
            location: location || existingCompany.location,
            address: input.address || existingCompany.address,
            primaryEmail: email || existingCompany.primaryEmail,
            canonicalWebsiteUrl: identity?.canonicalWebsiteUrl,
            normalizedDomain: identity?.normalizedDomain,
            companyKey: identity?.companyKey,
            source: CompanySource.MANUAL,
            sourceUrl: companyWebsiteUrl,
            savedAt: new Date(),
            lastSeenAt: new Date(),
            seenCount: { increment: 1 },
          },
        })
      : await tx.company.create({
          data: {
            name: input.companyName,
            websiteUrl: companyWebsiteUrl,
            industry,
            location,
            address: input.address || null,
            primaryEmail: email,
            canonicalWebsiteUrl: identity?.canonicalWebsiteUrl,
            normalizedDomain: identity?.normalizedDomain,
            companyKey: identity?.companyKey,
            source: CompanySource.MANUAL,
            sourceUrl: companyWebsiteUrl,
            savedAt: new Date(),
            lastSeenAt: new Date(),
            seenCount: 1,
          },
        });

    const contact = await upsertContact(tx, {
      companyId: company.id,
      companyWebsiteUrl,
      contactName: input.contactName,
      contactTitle: input.contactTitle,
      email,
      phone: input.phone,
      existingContactId: null,
    });

    const lead = await tx.lead.create({
      data: {
        companyId: company.id,
        contactId: contact?.id ?? null,
        status: input.status as LeadStatus,
        priority: input.priority as LeadPriority,
        notes: input.notes || "Created manually from Lead CRM.",
        tags: buildTags(input),
      },
    });

    return { company, contact, lead };
  });
}

export async function updateManagedLead(leadId: string, input: LeadManageInput) {
  const existingLead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      company: true,
      contact: true,
    },
  });

  if (!existingLead) {
    throw new Error("Lead was not found.");
  }

  const email = normalizeEmail(input.email);
  const location = normalizeLocationLabel(input.location) || null;
  const industry = formatIndustryJa(input.industry) || null;
  const websiteUrl = resolveWebsiteUrl(
    input.websiteUrl || existingLead.company.websiteUrl,
    input.companyName,
    email,
  );
  const companyWebsiteUrl = normalizeCompanyWebsiteUrl(websiteUrl);
  const identity = buildCompanyIdentity(websiteUrl);

  if (companyWebsiteUrl !== existingLead.company.websiteUrl) {
    const conflict = await prisma.company.findFirst({
      where: {
        id: { not: existingLead.companyId },
        OR: [
          { websiteUrl: companyWebsiteUrl },
          ...(identity?.normalizedDomain
            ? [{ normalizedDomain: identity.normalizedDomain }]
            : []),
        ],
      },
    });

    if (conflict) {
      throw new Error("Another company already uses this website URL.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id: existingLead.companyId },
      data: {
        name: input.companyName,
        websiteUrl: companyWebsiteUrl,
        industry,
        location,
        address: input.address || null,
        primaryEmail: email || null,
        canonicalWebsiteUrl: identity?.canonicalWebsiteUrl,
        normalizedDomain: identity?.normalizedDomain,
        companyKey: identity?.companyKey,
        sourceUrl: companyWebsiteUrl,
        lastSeenAt: new Date(),
      },
    });

    const contact = await upsertContact(tx, {
      companyId: company.id,
      companyWebsiteUrl,
      contactName: input.contactName,
      contactTitle: input.contactTitle,
      email,
      phone: input.phone,
      existingContactId: existingLead.contactId,
    });

    const lead = await tx.lead.update({
      where: { id: leadId },
      data: {
        status: input.status as LeadStatus,
        priority: input.priority as LeadPriority,
        notes: input.notes || null,
        contactId: contact?.id ?? null,
        tags: buildTags(input),
      },
    });

    return { company, contact, lead };
  });
}

export async function deleteManagedLead(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              leads: true,
            },
          },
        },
      },
    },
  });

  if (!lead) {
    throw new Error("Lead was not found.");
  }

  // Lead CRM rows are company-centric: removing the only lead removes the company.
  if (lead.company._count.leads <= 1) {
    await prisma.company.delete({
      where: { id: lead.companyId },
    });
    return {
      deletedLeadId: lead.id,
      deletedCompanyId: lead.companyId,
      companyName: lead.company.name,
    };
  }

  await prisma.lead.delete({
    where: { id: lead.id },
  });

  return {
    deletedLeadId: lead.id,
    deletedCompanyId: null,
    companyName: lead.company.name,
  };
}

async function upsertContact(
  tx: {
    contact: {
      findFirst: typeof prisma.contact.findFirst;
      create: typeof prisma.contact.create;
      update: typeof prisma.contact.update;
    };
  },
  input: {
    companyId: string;
    companyWebsiteUrl: string;
    contactName: string;
    contactTitle: string;
    email: string | null;
    phone: string;
    existingContactId: string | null;
  },
) {
  if (!input.email && !input.contactName && !input.phone && !input.contactTitle) {
    return null;
  }

  if (input.existingContactId) {
    return tx.contact.update({
      where: { id: input.existingContactId },
      data: {
        name: input.contactName || null,
        title: input.contactTitle || null,
        email: input.email,
        phone: input.phone || null,
        sourceUrl: input.companyWebsiteUrl,
      },
    });
  }

  if (input.email) {
    const existing = await tx.contact.findFirst({
      where: {
        companyId: input.companyId,
        email: input.email,
      },
    });

    if (existing) {
      return tx.contact.update({
        where: { id: existing.id },
        data: {
          name: input.contactName || existing.name,
          title: input.contactTitle || existing.title,
          phone: input.phone || existing.phone,
          sourceUrl: input.companyWebsiteUrl,
        },
      });
    }
  }

  return tx.contact.create({
    data: {
      companyId: input.companyId,
      name: input.contactName || null,
      title: input.contactTitle || null,
      email: input.email,
      phone: input.phone || null,
      sourceUrl: input.companyWebsiteUrl,
    },
  });
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please provide a valid contact email.");
  }

  return email;
}

function resolveWebsiteUrl(
  rawWebsite: string,
  companyName: string,
  email: string | null,
) {
  const candidate = rawWebsite.trim();

  if (candidate) {
    const withProtocol = /^https?:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`;
    try {
      new URL(withProtocol);
      return normalizeCompanyWebsiteUrl(withProtocol);
    } catch {
      throw new Error("Please provide a valid website URL.");
    }
  }

  if (email) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (
      domain &&
      !["gmail.com", "yahoo.com", "yahoo.co.jp", "hotmail.com", "outlook.com"].includes(
        domain,
      )
    ) {
      return normalizeCompanyWebsiteUrl(`https://${domain}`);
    }
  }

  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const hash = createHash("sha1")
    .update(companyName.toLowerCase())
    .digest("hex")
    .slice(0, 8);
  return `https://import.local/${slug || "company"}-${hash}`;
}

function buildTags(input: LeadManageInput) {
  return Array.from(
    new Set(
      [input.industry, input.location, "manual"]
        .filter(Boolean)
        .map((value) => value.toLowerCase().replace(/\s+/g, "-").slice(0, 40)),
    ),
  ).slice(0, 8);
}
