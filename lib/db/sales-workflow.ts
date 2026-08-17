import { prisma } from "@/lib/db/prisma";
import {
  LEAD_TAG_EMAIL_CONTACTED,
  LEAD_TAG_EMAIL_REPLIED,
  LEAD_TAG_PHONE_CONTACTED,
  normalizeLocationLabel,
} from "@/lib/leads/constants";
import type {
  LeadStatusFilterGroup,
  QualifyFilterGroup,
} from "@/lib/leads/status";
import type {
  Contact,
  EmailDraft,
  FollowUpTask,
  Lead,
  Prisma,
  SentEmail,
} from "@/lib/generated/prisma/client";

const ACTIVE_LEAD_STATUSES = [
  "NEW",
  "RESEARCHED",
  "QUALIFIED",
  "CONTACTED",
  "REPLIED",
  "FOLLOW_UP",
  "MEETING",
  "WON",
  "LOST",
] as const;

const DEFAULT_LEAD_CRM_PAGE_SIZE = 50;
const MAX_LEAD_CRM_PAGE_SIZE = 100;

export type LeadCrmFilters = {
  location: string;
  qualify: QualifyFilterGroup;
  progress: LeadStatusFilterGroup;
};

export type LeadCrmPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

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

export type LeadCrmPageRow = Awaited<
  ReturnType<typeof getLeadCrmPageRows>
>["rows"][number];

export async function safeGetLeadCrmPageRows(input: {
  filters: LeadCrmFilters;
  page: number;
  pageSize?: number;
}): Promise<
  | { ok: true; data: Awaited<ReturnType<typeof getLeadCrmPageRows>> }
  | { ok: false; message: string }
> {
  try {
    return { ok: true, data: await getLeadCrmPageRows(input) };
  } catch (error) {
    const message = getDatabaseErrorMessage(error);
    if (!message) {
      throw error;
    }
    return { ok: false, message };
  }
}

export async function getLeadCrmPageRows({
  filters,
  page,
  pageSize = DEFAULT_LEAD_CRM_PAGE_SIZE,
}: {
  filters: LeadCrmFilters;
  page: number;
  pageSize?: number;
}) {
  const normalizedPageSize = Math.min(
    Math.max(1, pageSize),
    MAX_LEAD_CRM_PAGE_SIZE,
  );
  const where = buildLeadCrmWhere(filters);
  const totalCount = await prisma.lead.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);

  const [rows, locationOptions] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip: (normalizedPage - 1) * normalizedPageSize,
      take: normalizedPageSize,
      include: {
        company: true,
        contact: true,
      },
    }),
    getLeadCrmLocationOptions(),
  ]);

  return {
    rows,
    locationOptions,
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalCount,
      totalPages,
    },
  };
}

async function getLeadCrmLocationOptions() {
  const companies = await prisma.company.findMany({
    where: {
      leads: {
        some: {
          status: {
            in: [...ACTIVE_LEAD_STATUSES],
          },
        },
      },
    },
    select: {
      location: true,
    },
  });

  return Array.from(
    new Set(
      companies
        .map((company) => normalizeLocationLabel(company.location ?? ""))
        .filter((location) => Boolean(location) && !/^[a-z]/i.test(location)),
    ),
  ).sort((a, b) => a.localeCompare(b, "ja"));
}

function buildLeadCrmWhere(filters: LeadCrmFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [
    {
      status: {
        in: [...ACTIVE_LEAD_STATUSES],
      },
    },
  ];

  if (filters.location !== "all") {
    const locationAliases = leadLocationAliases(filters.location);
    and.push({
      company: {
        OR: locationAliases.map((location) => ({ location })),
      },
    });
  }

  const qualifyWhere = leadQualifyWhere(filters.qualify);
  if (qualifyWhere) {
    and.push(qualifyWhere);
  }

  const progressWhere = leadProgressWhere(filters.progress);
  if (progressWhere) {
    and.push(progressWhere);
  }

  return { AND: and };
}

function leadQualifyWhere(
  qualify: QualifyFilterGroup,
): Prisma.LeadWhereInput | null {
  if (qualify === "all") return null;
  if (qualify === "unconfirmed") {
    return { status: "NEW" };
  }
  if (qualify === "passed") {
    return { status: { in: ["RESEARCHED", "LOST"] } };
  }
  return {
    status: {
      in: ["QUALIFIED", "CONTACTED", "REPLIED", "FOLLOW_UP", "MEETING", "WON"],
    },
  };
}

function leadProgressWhere(
  progress: LeadStatusFilterGroup,
): Prisma.LeadWhereInput | null {
  if (progress === "all") return null;
  if (progress === "reply") return repliedProgressWhere();
  if (progress === "email") {
    return {
      AND: [
        noReplyProgressWhere(),
        {
          OR: [
            {
              contactEvents: {
                some: {
                  channel: "email",
                  eventType: "contacted",
                },
              },
            },
            { tags: { has: LEAD_TAG_EMAIL_CONTACTED } },
          ],
        },
      ],
    };
  }
  if (progress === "phone") {
    return {
      AND: [
        noReplyProgressWhere(),
        noEmailContactProgressWhere(),
        {
          OR: [
            {
              contactEvents: {
                some: {
                  channel: "phone",
                  eventType: "contacted",
                },
              },
            },
            { tags: { has: LEAD_TAG_PHONE_CONTACTED } },
          ],
        },
      ],
    };
  }
  if (progress === "contacted") {
    return {
      AND: [
        noReplyProgressWhere(),
        noEmailContactProgressWhere(),
        noPhoneContactProgressWhere(),
        { status: { in: ["CONTACTED", "FOLLOW_UP"] } },
      ],
    };
  }
  return {
    AND: [
      { status: { in: ["NEW", "RESEARCHED", "QUALIFIED"] } },
      {
        contactEvents: {
          none: {
            eventType: {
              in: ["contacted", "replied"],
            },
          },
        },
      },
      { NOT: { tags: { has: LEAD_TAG_EMAIL_CONTACTED } } },
      { NOT: { tags: { has: LEAD_TAG_PHONE_CONTACTED } } },
      { NOT: { tags: { has: LEAD_TAG_EMAIL_REPLIED } } },
    ],
  };
}

function repliedProgressWhere(): Prisma.LeadWhereInput {
  return {
    OR: [
      { status: "REPLIED" },
      {
        contactEvents: {
          some: {
            channel: "email",
            eventType: "replied",
          },
        },
      },
      { tags: { has: LEAD_TAG_EMAIL_REPLIED } },
    ],
  };
}

function noReplyProgressWhere(): Prisma.LeadWhereInput {
  return {
    NOT: repliedProgressWhere(),
  };
}

function noEmailContactProgressWhere(): Prisma.LeadWhereInput {
  return {
    AND: [
      {
        contactEvents: {
          none: {
            channel: "email",
            eventType: "contacted",
          },
        },
      },
      { NOT: { tags: { has: LEAD_TAG_EMAIL_CONTACTED } } },
    ],
  };
}

function noPhoneContactProgressWhere(): Prisma.LeadWhereInput {
  return {
    AND: [
      {
        contactEvents: {
          none: {
            channel: "phone",
            eventType: "contacted",
          },
        },
      },
      { NOT: { tags: { has: LEAD_TAG_PHONE_CONTACTED } } },
    ],
  };
}

function leadLocationAliases(location: string) {
  const aliases = new Set([location]);
  const englishCandidates = [
    "tokyo",
    "tokyo-to",
    "osaka",
    "kyoto",
    "hokkaido",
    "aichi",
    "kanagawa",
    "saitama",
    "chiba",
    "hyogo",
    "fukuoka",
  ];

  for (const candidate of englishCandidates) {
    if (normalizeLocationLabel(candidate) === location) {
      aliases.add(candidate);
    }
  }

  return [...aliases];
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
        where: {
          status: {
            in: [...ACTIVE_LEAD_STATUSES],
          },
        },
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
    prisma.lead.count({
      where: {
        status: {
          in: [...ACTIVE_LEAD_STATUSES],
        },
      },
    }),
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
