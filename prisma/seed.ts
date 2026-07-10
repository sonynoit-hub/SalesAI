import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  CompanySource,
  EmailDraftStatus,
  EmailLanguage,
  EmailTone,
  FollowUpStatus,
  LeadPriority,
  LeadStatus,
  SentEmailStatus,
  PrismaClient,
} from "../lib/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const company = await prisma.company.upsert({
    where: { websiteUrl: "https://example-it-customer.com" },
    update: {
      name: "Example IT Customer",
      industry: "Manufacturing",
      location: "Tokyo",
      description: "Sample company used for local SalesAI development.",
      source: CompanySource.MANUAL,
    },
    create: {
      name: "Example IT Customer",
      websiteUrl: "https://example-it-customer.com",
      industry: "Manufacturing",
      location: "Tokyo",
      description: "Sample company used for local SalesAI development.",
      source: CompanySource.MANUAL,
      savedAt: new Date(),
    },
  });

  const existingContact = await prisma.contact.findFirst({
    where: {
      companyId: company.id,
      email: "aiko.tanaka@example-it-customer.com",
    },
  });

  const contact = await (existingContact
    ? prisma.contact.update({
        where: { id: existingContact.id },
        data: {
          name: "Aiko Tanaka",
          title: "Operations Manager",
        },
      })
    : prisma.contact.create({
        data: {
          companyId: company.id,
          name: "Aiko Tanaka",
          title: "Operations Manager",
          email: "aiko.tanaka@example-it-customer.com",
        },
      }));

  const existingLead = await prisma.lead.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: "asc" },
  });

  const lead =
    existingLead ??
    (await prisma.lead.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        status: LeadStatus.CONTACTED,
        priority: LeadPriority.MEDIUM,
        tags: ["sample", "manufacturing"],
        notes: "Seed lead for testing the database-backed sales workflow.",
      },
    }));

  if (lead.contactId !== contact.id) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { contactId: contact.id },
    });
  }

  const existingResearch = await prisma.companyResearch.findFirst({
    where: { companyId: company.id },
  });

  await (existingResearch
    ? prisma.companyResearch.update({
        where: { id: existingResearch.id },
        data: {
          summary:
            "A sample manufacturing company that may need IT process support.",
          productsOrServices: ["Manufacturing services"],
          targetCustomers: ["B2B buyers"],
          painPoints: ["Manual workflows", "Limited visibility into operations"],
          salesOpportunities: [
            "Workflow automation",
            "Cloud system modernization",
          ],
          researchSources: [company.websiteUrl],
        },
      })
    : prisma.companyResearch.create({
        data: {
          companyId: company.id,
          summary:
            "A sample manufacturing company that may need IT process support.",
          productsOrServices: ["Manufacturing services"],
          targetCustomers: ["B2B buyers"],
          painPoints: ["Manual workflows", "Limited visibility into operations"],
          salesOpportunities: [
            "Workflow automation",
            "Cloud system modernization",
          ],
          researchSources: [company.websiteUrl],
        },
      }));

  const existingDraft = await prisma.emailDraft.findFirst({
    where: { leadId: lead.id },
  });

  const draft = await (existingDraft
    ? prisma.emailDraft.update({
        where: { id: existingDraft.id },
        data: {
          contactId: contact.id,
          subject: "IT workflow improvement idea for Example IT Customer",
          body: "Hello Aiko,\n\nI noticed your team may benefit from improving operational workflows. Would it be useful to discuss a small IT automation idea?\n\nBest regards,",
          tone: EmailTone.PROFESSIONAL,
          language: EmailLanguage.EN,
          status: EmailDraftStatus.DRAFT,
        },
      })
    : prisma.emailDraft.create({
        data: {
          leadId: lead.id,
          contactId: contact.id,
          subject: "IT workflow improvement idea for Example IT Customer",
          body: "Hello Aiko,\n\nI noticed your team may benefit from improving operational workflows. Would it be useful to discuss a small IT automation idea?\n\nBest regards,",
          tone: EmailTone.PROFESSIONAL,
          language: EmailLanguage.EN,
          status: EmailDraftStatus.DRAFT,
        },
      }));

  const existingSentEmail = await prisma.sentEmail.findFirst({
    where: { leadId: lead.id },
  });

  const sentEmail = await (existingSentEmail
    ? prisma.sentEmail.update({
        where: { id: existingSentEmail.id },
        data: {
          contactId: contact.id,
          emailDraftId: draft.id,
          toEmail: contact.email ?? "unknown@example.com",
          subject: draft.subject,
          body: draft.body,
          status: SentEmailStatus.SENT,
        },
      })
    : prisma.sentEmail.create({
        data: {
          leadId: lead.id,
          contactId: contact.id,
          emailDraftId: draft.id,
          toEmail: contact.email ?? "unknown@example.com",
          subject: draft.subject,
          body: draft.body,
          status: SentEmailStatus.SENT,
        },
      }));

  const existingFollowUp = await prisma.followUpTask.findFirst({
    where: { leadId: lead.id, sentEmailId: sentEmail.id },
  });

  await (existingFollowUp
    ? prisma.followUpTask.update({
        where: { id: existingFollowUp.id },
        data: {
          title: "Follow up with Example IT Customer",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: FollowUpStatus.OPEN,
          notes: "Seed follow-up task for the database-backed workflow.",
        },
      })
    : prisma.followUpTask.create({
        data: {
          leadId: lead.id,
          sentEmailId: sentEmail.id,
          title: "Follow up with Example IT Customer",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: FollowUpStatus.OPEN,
          notes: "Seed follow-up task for the database-backed workflow.",
        },
      }));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
