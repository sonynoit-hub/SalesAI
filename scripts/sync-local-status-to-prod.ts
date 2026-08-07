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
import { resolveQualifyMark } from "../lib/leads/status";

const BASE =
  process.env.SYNC_PROD_BASE_URL?.replace(/\/$/, "") ||
  "https://sales-ai-seven.vercel.app";

const DRY_RUN = process.argv.includes("--dry-run");

type ContactStatus = "not_contacted" | "email" | "phone" | "reply";
type QualifyKind = "unconfirmed" | "qualified" | "passed";

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
  let text = html;
  for (let i = 0; i < 2; i += 1) {
    text = text.replace(/\\"/g, '"');
  }
  return text;
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
      contact: contactStatusFromActivity(activity),
    };
  });
}

function parseProdRows(html: string): ProdRow[] {
  const text = unescapeRsc(html);
  const rows: ProdRow[] = [];
  const re =
    /"leadId":"([0-9a-f-]+)","companyId":"[0-9a-f-]+","companyName":"([^"]*)","websiteUrl":"([^"]*)","industry":"([^"]*)","location":"([^"]*)","address":"([^"]*)","contactName":"([^"]*)","contactTitle":"([^"]*)","email":"([^"]*)","phone":"([^"]*)","contactFormUrl":"[^"]*","hasOutreachChannel":(?:true|false),"status":"([A-Z_]+)","progressStatus":"[A-Z_]+","priority":"([A-Z]+)","notes":"(.*?)","contactActivity":\{"hasEmailContact":(true|false),"hasPhoneContact":(true|false),"hasEmailReply":(true|false)\}/gs;

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

async function loadProdRows(): Promise<ProdRow[]> {
  const firstUrl = `${BASE}/leads?qualify=all&progress=all`;
  const firstHtml = await (
    await fetch(firstUrl, {
      headers: { "user-agent": "Mozilla/5.0 SalesAI-sync" },
      cache: "no-store",
    })
  ).text();
  const total = Number(
    firstHtml.replace(/<[^>]+>/g, " ").match(/(\d+)件中/)?.[1] || 0,
  );
  const pages = Math.max(1, Math.ceil(total / 50));
  const seen = new Set<string>();
  const rows: ProdRow[] = [];

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

  return rows;
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
      await fetch(`${BASE}/leads?qualify=qualified&progress=not_yet`, {
        headers: { "user-agent": "Mozilla/5.0 SalesAI-sync" },
        cache: "no-store",
      })
    ).text();
    const label = verify
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .match(/\d+件中[^。]{0,40}|0件を表示/)?.[0];
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
