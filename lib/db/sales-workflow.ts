import { prisma } from "@/lib/db/prisma";
import type {
  Contact,
  EmailDraft,
  FollowUpTask,
  Lead,
  SentEmail,
} from "@/lib/generated/prisma/client";

export function getDatabaseErrorMessage(error: unknown) {
  const codes = collectErrorCodes(error);
  const messages = collectErrorMessages(error).join(" ");

  if (codes.has("ECONNREFUSED") || /ECONNREFUSED/i.test(messages)) {
    return "PostgreSQL is not accepting connections on the configured DATABASE_URL.";
  }

  if (codes.has("P1001")) {
    return "Prisma cannot reach the configured PostgreSQL server.";
  }

  if (codes.has("P2021") || codes.has("P2022")) {
    return "The PostgreSQL schema is out of sync with the current Prisma schema.";
  }

  return null;
}

export type CompanyQueueRow = Awaited<
  ReturnType<typeof getCompanyQueueRows>
>[number];

export async function safeGetCompanyQueueRows(): Promise<
  | { ok: true; rows: CompanyQueueRow[] }
  | { ok: false; message: string }
> {
  try {
    return { ok: true, rows: await getCompanyQueueRows() };
  } catch (error) {
    const message = getDatabaseErrorMessage(error);
    if (!message) {
      throw error;
    }
    return { ok: false, message };
  }
}

export async function safeGetCompanyQueueRow(companyId: string): Promise<
  | { ok: true; row: CompanyQueueRow | undefined }
  | { ok: false; message: string }
> {
  const result = await safeGetCompanyQueueRows();
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    row: result.rows.find((row) => row.company.id === companyId),
  };
}

function collectErrorCodes(error: unknown) {
  const codes = new Set<string>();
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === "object" && current !== null) {
      const record = current as { code?: unknown; cause?: unknown };
      if (typeof record.code === "string") {
        codes.add(record.code);
      }
      current = record.cause;
      continue;
    }
    break;
  }

  return codes;
}

function collectErrorMessages(error: unknown) {
  const messages: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "object" && current !== null) {
      const record = current as { message?: unknown; cause?: unknown };
      if (typeof record.message === "string") {
        messages.push(record.message);
      }
      current = record.cause;
      continue;
    }
    break;
  }

  return messages;
}

export async function getCompanyQueueRows() {
  const companies = await prisma.company.findMany({
    orderBy: [{ savedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      contacts: {
        orderBy: { updatedAt: "desc" },
        take: 5,
      },
      leads: {
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          contact: true,
          emailDrafts: {
            orderBy: { updatedAt: "desc" },
            take: 20,
          },
          sentEmails: {
            orderBy: { sentAt: "desc" },
            take: 10,
          },
          followUpTasks: {
            where: { status: "OPEN" },
            orderBy: { dueDate: "asc" },
            take: 10,
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
    const primaryLead = resolvePrimaryLead(company.leads);
    const primaryContact = resolvePrimaryContact(primaryLead, company.contacts);
    const latestDraft = resolveActiveDraft(primaryLead);
    const latestSentEmail = resolveLatestSentEmail(primaryLead);
    const nextFollowUp = resolveNextFollowUp(primaryLead);
    const outreachEmail = primaryContact?.email ?? company.primaryEmail;
    const outreachName = primaryContact?.name?.trim() || null;
    const outreachTitle = primaryContact?.title?.trim() || null;

    return {
      company,
      primaryLead,
      primaryContact,
      outreachEmail,
      outreachName,
      outreachTitle,
      research: company.research[0],
      latestDraft,
      latestSentEmail,
      nextFollowUp,
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

  return new Intl.DateTimeFormat("ja", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "";

  return new Intl.DateTimeFormat("ja", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function isLeadContacted(status: string | null | undefined) {
  const normalized = (status ?? "").toUpperCase();
  return [
    "CONTACTED",
    "REPLIED",
    "FOLLOW_UP",
    "MEETING",
    "WON",
    "LOST",
  ].includes(normalized);
}

function resolvePrimaryLead(leads: Array<Lead & {
  contact: Contact | null;
  emailDrafts: EmailDraft[];
  sentEmails: SentEmail[];
  followUpTasks: FollowUpTask[];
}>) {
  return leads[0];
}

function resolvePrimaryContact(
  primaryLead:
    | (Lead & {
        contact: Contact | null;
      })
    | undefined,
  contacts: Contact[],
) {
  return primaryLead?.contact ?? contacts[0];
}

function resolveActiveDraft(
  primaryLead:
    | (Lead & {
        emailDrafts: EmailDraft[];
      })
    | undefined,
) {
  return (
    primaryLead?.emailDrafts.find((draft) =>
      ["DRAFT", "APPROVED"].includes(draft.status),
    ) ?? null
  );
}

function resolveLatestSentEmail(
  primaryLead:
    | (Lead & {
        sentEmails: SentEmail[];
      })
    | undefined,
) {
  return primaryLead?.sentEmails[0] ?? null;
}

function resolveNextFollowUp(
  primaryLead:
    | (Lead & {
        followUpTasks: FollowUpTask[];
      })
    | undefined,
) {
  return primaryLead?.followUpTasks[0] ?? null;
}
