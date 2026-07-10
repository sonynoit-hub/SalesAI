import { prisma } from "@/lib/db/prisma";

export function getDatabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybePrismaError = error as {
    code?: string;
    message?: string;
  };

  if (maybePrismaError.code === "ECONNREFUSED") {
    return "PostgreSQL is not accepting connections on the configured DATABASE_URL.";
  }

  if (maybePrismaError.code === "P1001") {
    return "Prisma cannot reach the configured PostgreSQL server.";
  }

  if (maybePrismaError.code === "P2021" || maybePrismaError.code === "P2022") {
    return "The PostgreSQL schema is out of sync with the current Prisma schema.";
  }

  return null;
}

export async function getCompanyQueueRows() {
  const companies = await prisma.company.findMany({
    orderBy: [{ savedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      contacts: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      leads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          contact: true,
          emailDrafts: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          sentEmails: {
            orderBy: { sentAt: "desc" },
            take: 1,
          },
          followUpTasks: {
            where: { status: "OPEN" },
            orderBy: { dueDate: "asc" },
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

  return companies.map((company) => {
    const primaryLead = company.leads[0];
    const primaryContact = primaryLead?.contact ?? company.contacts[0];

    return {
      company,
      primaryLead,
      primaryContact,
      research: company.research[0],
      latestDraft: primaryLead?.emailDrafts[0],
      latestSentEmail: primaryLead?.sentEmails[0],
      nextFollowUp: primaryLead?.followUpTasks[0],
    };
  });
}

export async function getCompanyQueueRow(companyId: string) {
  const rows = await getCompanyQueueRows();
  return rows.find((row) => row.company.id === companyId);
}

export async function getDashboardData() {
  const rows = await getCompanyQueueRows();
  const [
    leadCount,
    draftCount,
    sentEmailCount,
    openFollowUpCount,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.emailDraft.count({
      where: {
        status: {
          in: ["DRAFT", "APPROVED"],
        },
      },
    }),
    prisma.sentEmail.count(),
    prisma.followUpTask.count({
      where: {
        status: "OPEN",
      },
    }),
  ]);

  return {
    rows,
    stats: {
      companyCount: rows.length,
      leadCount,
      draftCount,
      sentEmailCount,
      openFollowUpCount,
    },
  };
}

export function statusLabel(value: string | null | undefined) {
  return value ? value.toLowerCase() : "";
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}
