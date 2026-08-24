/**
 * Sync local Confirm (見込み/見送り/未確認) and 連絡進捗 onto production.
 * Matches leads by website domain (fallback: company name).
 *
 *   npx tsx scripts/sync-local-status-to-prod.ts
 *   npx tsx scripts/sync-local-status-to-prod.ts --dry-run
 */
import { prisma } from "../lib/db/prisma";
import { normalizeCompanyWebsiteUrl } from "../lib/company-identity";
import { deriveLeadContactActivity } from "../lib/leads/contact-activity";
import {
  resolveLeadProgressStatus,
  resolveQualifyMark,
} from "../lib/leads/status";

const BASE =
  process.env.SYNC_PROD_BASE_URL?.replace(/\/$/, "") ||
  "https://sales-ai-seven.vercel.app";

const DRY_RUN = process.argv.includes("--dry-run");

type ContactStatus = "not_contacted" | "email" | "phone" | "reply";
type QualifyKind = "unconfirmed" | "qualified" | "passed";

const PROGRESS_FILTERS: ContactStatus[] = [
  "not_contacted",
  "email",
  "phone",
  "reply",
];

type LocalRow = {
  companyName: string;
  domain: string;
  qualify: QualifyKind;
  qualifyStatus: "NEW" | "QUALIFIED" | "RESEARCHED";
  contact: ContactStatus;
};

type ProdRow = {
  leadId: string;
  companyName: string;
  websiteUrl: string;
  domain: string;
  industry: string;
  location: string;
  address: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  status: string;
  priority: string;
  notes: string;
  qualify: QualifyKind;
  contact: ContactStatus;
};

type SerializedProdRow = {
  leadId?: unknown;
  companyName?: unknown;
  websiteUrl?: unknown;
  industry?: unknown;
  location?: unknown;
  address?: unknown;
  contactName?: unknown;
  contactTitle?: unknown;
  email?: unknown;
  phone?: unknown;
  status?: unknown;
  priority?: unknown;
  notes?: unknown;
  contactActivity?: {
    hasEmailContact?: unknown;
    hasPhoneContact?: unknown;
    hasEmailReply?: unknown;
  };
};

type SerializedPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function domainOf(url: string, normalized?: string | null) {
  if (normalized) return normalized.toLowerCase();
  const website = normalizeCompanyWebsiteUrl(url || "") || url || "";
  return String(website)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

function contactStatusFromActivity(activity: {
  hasEmailContact: boolean;
  hasPhoneContact: boolean;
  hasEmailReply: boolean;
}): ContactStatus {
  if (activity.hasEmailReply) return "reply";
  if (activity.hasEmailContact) return "email";
  if (activity.hasPhoneContact) return "phone";
  return "not_contacted";
}

function contactStatusFromLead(
  status: string,
  activity: {
    hasEmailContact: boolean;
    hasPhoneContact: boolean;
    hasEmailReply: boolean;
  },
): ContactStatus {
  const progress = resolveLeadProgressStatus(status, activity);
  if (progress === "REPLIED") return "reply";
  if (progress === "CONTACTED") {
    if (activity.hasPhoneContact && !activity.hasEmailContact) return "phone";
    return "email";
  }
  return contactStatusFromActivity(activity);
}

function qualifyStatusFor(kind: QualifyKind): LocalRow["qualifyStatus"] {
  if (kind === "unconfirmed") return "NEW";
  if (kind === "passed") return "RESEARCHED";
  return "QUALIFIED";
}

function qualifyFromStatus(status: string): QualifyKind {
  const normalized = status.toUpperCase();
  if (normalized === "NEW") return "unconfirmed";
  if (
    normalized === "RESEARCHED" ||
    normalized === "LOST" ||
    normalized === "ARCHIVED"
  ) {
    return "passed";
  }
  return "qualified";
}

function unescapeRsc(html: string) {
  return html.replace(/\\"/g, '"');
}

async function loadLocalRows(): Promise<LocalRow[]> {
  const leads = await prisma.lead.findMany({
    select: {
      status: true,
      tags: true,
      company: {
        select: {
          name: true,
          websiteUrl: true,
          normalizedDomain: true,
        },
      },
    },
  });

  return leads.map((lead) => {
    const activity = deriveLeadContactActivity({ tags: lead.tags });
    const qualify = resolveQualifyMark(lead.status);
    return {
      companyName: lead.company.name,
      domain: domainOf(lead.company.websiteUrl, lead.company.normalizedDomain),
      qualify,
      qualifyStatus: qualifyStatusFor(qualify),
      contact: contactStatusFromLead(lead.status, activity),
    };
  });
}

function parseProdRows(html: string): ProdRow[] {
  const text = unescapeRsc(html);
  const rows: ProdRow[] = [];
  const seen = new Set<string>();

  for (const serializedRows of extractRowsArrays(text)) {
    let parsed: SerializedProdRow[];
    try {
      parsed = JSON.parse(serializedRows) as SerializedProdRow[];
    } catch {
      continue;
    }

    for (const row of parsed) {
      const leadId = stringValue(row.leadId);
      if (!leadId || seen.has(leadId)) continue;
      seen.add(leadId);

      const websiteUrl = stringValue(row.websiteUrl);
      const status = stringValue(row.status);
      const activity = row.contactActivity ?? {};

      rows.push({
        leadId,
        companyName: stringValue(row.companyName),
        websiteUrl,
        domain: domainOf(websiteUrl),
        industry: stringValue(row.industry),
        location: stringValue(row.location),
        address: stringValue(row.address),
        contactName: stringValue(row.contactName),
        contactTitle: stringValue(row.contactTitle),
        email: stringValue(row.email),
        phone: stringValue(row.phone),
        status,
        priority: stringValue(row.priority),
        notes: stringValue(row.notes),
        qualify: qualifyFromStatus(status),
        contact: contactStatusFromLead(status, {
          hasEmailContact: activity.hasEmailContact === true,
          hasPhoneContact: activity.hasPhoneContact === true,
          hasEmailReply: activity.hasEmailReply === true,
        }),
      });
    }
  }

  if (rows.length > 0) return rows;

  const re =
    /"leadId":"([0-9a-f-]+)","companyId":"[0-9a-f-]+","companyName":"((?:\\.|[^"\\])*)","websiteUrl":"((?:\\.|[^"\\])*)","industry":"((?:\\.|[^"\\])*)","location":"((?:\\.|[^"\\])*)","address":"((?:\\.|[^"\\])*)","description":"(?:\\.|[^"\\])*","researchSummary":"(?:\\.|[^"\\])*","contactName":"((?:\\.|[^"\\])*)","contactTitle":"((?:\\.|[^"\\])*)","email":"((?:\\.|[^"\\])*)","phone":"((?:\\.|[^"\\])*)","contactFormUrl":"(?:\\.|[^"\\])*","status":"([A-Z_]+)","progressStatus":"[A-Z_]+","priority":"([A-Z]+)","notes":"((?:\\.|[^"\\])*)","contactActivity":\{"hasEmailContact":(true|false),"hasPhoneContact":(true|false),"hasEmailReply":(true|false)\}/g;

  for (const match of text.matchAll(re)) {
    const hasEmailContact = match[14] === "true";
    const hasPhoneContact = match[15] === "true";
    const hasEmailReply = match[16] === "true";
    rows.push({
      leadId: match[1],
      companyName: match[2],
      websiteUrl: match[3],
      domain: domainOf(match[3]),
      industry: match[4],
      location: match[5],
      address: match[6],
      contactName: match[7],
      contactTitle: match[8],
      email: match[9],
      phone: match[10],
      status: match[11],
      priority: match[12],
      notes: match[13].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      qualify: qualifyFromStatus(match[11]),
      contact: contactStatusFromActivity({
        hasEmailContact,
        hasPhoneContact,
        hasEmailReply,
      }),
    });
  }

  return rows;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function extractRowsArrays(text: string) {
  const arrays: string[] = [];
  let searchIndex = 0;
  const token = '"rows":';

  while (searchIndex < text.length) {
    const tokenIndex = text.indexOf(token, searchIndex);
    if (tokenIndex === -1) break;

    const arrayStart = tokenIndex + token.length;
    if (text[arrayStart] !== "[") {
      searchIndex = tokenIndex + token.length;
      continue;
    }

    const arrayEnd = findJsonArrayEnd(text, arrayStart);
    if (arrayEnd === -1) {
      searchIndex = arrayStart + 1;
      continue;
    }

    arrays.push(text.slice(arrayStart, arrayEnd + 1));
    searchIndex = arrayEnd + 1;
  }

  return arrays;
}

function findJsonArrayEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

async function loadProdRows(): Promise<ProdRow[]> {
  const seen = new Set<string>();
  const rows: ProdRow[] = [];

  for (const progress of PROGRESS_FILTERS) {
    await loadProdRowsForProgress(progress, seen, rows);
  }

  return rows;
}

async function loadProdRowsForProgress(
  progress: ContactStatus,
  seen: Set<string>,
  rows: ProdRow[],
) {
  const firstUrl = `${BASE}/leads?qualify=all&progress=${progress}`;
  const firstHtml = await (
    await fetch(firstUrl, {
      headers: { "user-agent": "Mozilla/5.0 SalesAI-sync" },
      cache: "no-store",
    })
  ).text();
  const pages = getPageCount(firstHtml);

  for (let page = 1; page <= pages; page += 1) {
    const url = page === 1 ? firstUrl : `${firstUrl}&page=${page}`;
    const html =
      page === 1
        ? firstHtml
        : await (
            await fetch(url, {
              headers: { "user-agent": "Mozilla/5.0 SalesAI-sync" },
              cache: "no-store",
            })
          ).text();
    for (const row of parseProdRows(html)) {
      if (seen.has(row.leadId)) continue;
      seen.add(row.leadId);
      rows.push(row);
    }
  }
}

function getPageCount(html: string) {
  const serialized = getSerializedPagination(html);
  if (serialized) return Math.max(1, serialized.totalPages);

  const total = Number(
    html.replace(/<[^>]+>/g, " ").match(/(\d+)件中/)?.[1] || 0,
  );
  return Math.max(1, Math.ceil(total / 50));
}

function getSerializedPagination(html: string): SerializedPagination | null {
  const match = unescapeRsc(html).match(
    /"pagination":\{"page":(\d+),"pageSize":(\d+),"totalCount":(\d+),"totalPages":(\d+)\}/,
  );
  if (!match) return null;

  return {
    page: Number(match[1]),
    pageSize: Number(match[2]),
    totalCount: Number(match[3]),
    totalPages: Number(match[4]),
  };
}

function formatPaginationLabel(html: string) {
  const pagination = getSerializedPagination(html);
  if (pagination) {
    const start =
      pagination.totalCount === 0
        ? 0
        : (pagination.page - 1) * pagination.pageSize + 1;
    const end = Math.min(
      pagination.page * pagination.pageSize,
      pagination.totalCount,
    );
    return `${pagination.totalCount}件中 ${start}-${end}件`;
  }

  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .match(/\d+件中[^。]{0,40}|0件を表示/)?.[0];
}

async function patchQualify(prod: ProdRow, nextStatus: string) {
  const response = await fetch(`${BASE}/api/leads/${prod.leadId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 SalesAI-sync",
    },
    body: JSON.stringify({
      companyName: prod.companyName,
      websiteUrl: prod.websiteUrl,
      contactName: prod.contactName,
      contactTitle: prod.contactTitle,
      email: prod.email,
      phone: prod.phone,
      industry: prod.industry,
      location: prod.location,
      address: prod.address,
      status: nextStatus,
      priority: prod.priority || "MEDIUM",
      notes: prod.notes || "",
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `PATCH failed (${response.status})`,
    );
  }
}

async function putContact(leadId: string, status: ContactStatus) {
  const response = await fetch(`${BASE}/api/leads/${leadId}/contact-status`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 SalesAI-sync",
    },
    body: JSON.stringify({ status }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `PUT contact-status failed (${response.status})`,
    );
  }
}

async function main() {
  console.log(`==> Sync local -> ${BASE}${DRY_RUN ? " (dry-run)" : ""}`);

  const localRows = await loadLocalRows();
  const prodRows = await loadProdRows();
  console.log(`local=${localRows.length} prod=${prodRows.length}`);

  let qualifyOk = 0;
  let contactOk = 0;
  let fail = 0;
  let matched = 0;

  for (const local of localRows) {
    const prod =
      prodRows.find((row) => row.domain && row.domain === local.domain) ||
      prodRows.find((row) => row.companyName === local.companyName);
    if (!prod) continue;
    matched += 1;

    if (local.qualify !== prod.qualify) {
      console.log(
        `Confirm ${prod.companyName}: ${prod.qualify} -> ${local.qualify}`,
      );
      if (!DRY_RUN) {
        try {
          await patchQualify(prod, local.qualifyStatus);
          qualifyOk += 1;
        } catch (error) {
          fail += 1;
          console.error("  FAIL qualify", error);
        }
      } else {
        qualifyOk += 1;
      }
    }

    if (local.contact !== prod.contact) {
      console.log(
        `連絡進捗 ${prod.companyName}: ${prod.contact} -> ${local.contact}`,
      );
      if (!DRY_RUN) {
        try {
          await putContact(prod.leadId, local.contact);
          contactOk += 1;
        } catch (error) {
          fail += 1;
          console.error("  FAIL contact", error);
        }
      } else {
        contactOk += 1;
      }
    }
  }

  console.log(
    JSON.stringify({ matched, qualifyOk, contactOk, fail, dryRun: DRY_RUN }),
  );

  if (!DRY_RUN) {
    const verify = await (
      await fetch(`${BASE}/leads?qualify=qualified&progress=not_contacted`, {
        headers: { "user-agent": "Mozilla/5.0 SalesAI-sync" },
        cache: "no-store",
      })
    ).text();
    const label = formatPaginationLabel(verify);
    console.log("verify 見込み+未連絡:", label);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
