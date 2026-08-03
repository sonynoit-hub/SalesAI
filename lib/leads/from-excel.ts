import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
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
} from "@/lib/generated/prisma/client";
import { normalizeLocationLabel } from "@/lib/leads/constants";

export const EXCEL_IMPORT_COLUMNS = [
  "company_name",
  "website_url",
  "contact_name",
  "contact_title",
  "email",
  "phone",
  "industry",
  "location",
  "address",
  "status",
  "notes",
] as const;

export type ExcelImportColumn = (typeof EXCEL_IMPORT_COLUMNS)[number];

export type ExcelImportRow = {
  rowNumber: number;
  companyName: string;
  websiteUrl: string;
  contactName: string | null;
  contactTitle: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  location: string | null;
  address: string | null;
  status: LeadStatus;
  notes: string | null;
};

export type ExcelImportRowResult = {
  rowNumber: number;
  companyName: string;
  companyId: string;
  leadId: string;
  createdCompany: boolean;
  createdLead: boolean;
  createdContact: boolean;
};

export type ExcelImportFailure = {
  rowNumber: number;
  companyName?: string;
  message: string;
};

const HEADER_ALIASES: Record<ExcelImportColumn, string[]> = {
  company_name: [
    "company_name",
    "company",
    "company name",
    "name",
    "会社名",
    "企業名",
    "公司名称",
    "公司名稱",
  ],
  website_url: [
    "website_url",
    "website",
    "website url",
    "url",
    "site",
    "homepage",
    "ホームページ",
    "ウェブサイト",
    "官网",
    "官網",
  ],
  contact_name: [
    "contact_name",
    "contact",
    "contact name",
    "person",
    "担当者",
    "氏名",
    "联系人",
    "聯絡人",
  ],
  contact_title: ["contact_title", "title", "job title", "役職", "职位", "職位"],
  email: ["email", "e-mail", "mail", "メール", "メールアドレス", "邮箱", "郵箱"],
  phone: ["phone", "tel", "telephone", "電話", "電話番号", "电话", "電話"],
  industry: ["industry", "sector", "業種", "業界", "行业", "行業"],
  location: [
    "location",
    "region",
    "city",
    "所在地",
    "地域",
    "都道府県",
    "都道府县",
    "都道府縣",
    "省份",
  ],
  address: ["address", "full_address", "full address", "地址", "住所", "詳細地址"],
  status: ["status", "lead_status", "lead status", "ステータス", "状态", "狀態"],
  notes: ["notes", "note", "memo", "メモ", "備考"],
};

const STATUS_ALIASES: Record<string, LeadStatus> = {
  new: LeadStatus.NEW,
  researched: LeadStatus.RESEARCHED,
  qualified: LeadStatus.QUALIFIED,
  contacted: LeadStatus.CONTACTED,
  replied: LeadStatus.REPLIED,
  follow_up: LeadStatus.FOLLOW_UP,
  "follow-up": LeadStatus.FOLLOW_UP,
  followup: LeadStatus.FOLLOW_UP,
  meeting: LeadStatus.MEETING,
  won: LeadStatus.WON,
  lost: LeadStatus.LOST,
};

export function parseExcelImportBuffer(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const selected = pickImportSheet(workbook);

  if (!selected) {
    throw new Error(
      "No importable sheet found. Include a header row with company name (会社名 / 公司名称) and preferably website (官网 / ウェブサイト).",
    );
  }

  const { sheetName, matrix, columnIndex } = selected;

  if (columnIndex.company_name === undefined) {
    throw new Error(
      "Missing required column: company_name (aliases: company, 会社名, 公司名称).",
    );
  }

  const rows: ExcelImportRow[] = [];
  const failures: ExcelImportFailure[] = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const rowNumber = index + 1;
    const cells = matrix[index] ?? [];
    const companyName = readCell(cells, columnIndex.company_name);

    if (!companyName) {
      const hasAnyValue = cells.some((cell) => String(cell ?? "").trim().length > 0);
      if (!hasAnyValue) {
        continue;
      }

      failures.push({
        rowNumber,
        message: "company_name is required.",
      });
      continue;
    }

    const email = normalizeEmail(readCell(cells, columnIndex.email));
    const rawWebsite = readCell(cells, columnIndex.website_url);
    const websiteUrl = resolveWebsiteUrl(rawWebsite, companyName, email);

    if (!websiteUrl) {
      failures.push({
        rowNumber,
        companyName,
        message: "website_url is invalid.",
      });
      continue;
    }

    const location =
      normalizeLocationLabel(readCell(cells, columnIndex.location)) || null;
    const address = readCell(cells, columnIndex.address) || null;
    const notes = readCell(cells, columnIndex.notes) || null;

    rows.push({
      rowNumber,
      companyName,
      websiteUrl,
      contactName: readCell(cells, columnIndex.contact_name) || null,
      contactTitle: readCell(cells, columnIndex.contact_title) || null,
      email,
      phone: readCell(cells, columnIndex.phone) || null,
      industry: readCell(cells, columnIndex.industry) || null,
      location,
      address,
      status: parseLeadStatus(readCell(cells, columnIndex.status)),
      notes,
    });
  }

  return { rows, failures, sheetName };
}

function pickImportSheet(workbook: XLSX.WorkBook) {
  const preferredNames = new Set([
    "supplier crm",
    "leads",
    "companies",
    "crm",
  ]);

  type Candidate = {
    sheetName: string;
    matrix: Array<Array<string | number | boolean | Date | null>>;
    columnIndex: Partial<Record<ExcelImportColumn, number>>;
    score: number;
    preferred: boolean;
  };

  let best: Candidate | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matrix = XLSX.utils.sheet_to_json<
      Array<string | number | boolean | Date | null>
    >(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    if (matrix.length < 2) continue;

    const headerCells = (matrix[0] ?? []).map((cell) =>
      normalizeHeader(String(cell ?? "")),
    );
    const columnIndex = resolveColumnIndex(headerCells);

    if (columnIndex.company_name === undefined) {
      continue;
    }

    const mappedColumns = Object.keys(columnIndex).length;
    const preferred = preferredNames.has(sheetName.trim().toLowerCase());
    const score = mappedColumns + (preferred ? 10 : 0) + (columnIndex.website_url !== undefined ? 2 : 0);
    const candidate: Candidate = {
      sheetName,
      matrix,
      columnIndex,
      score,
      preferred,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

export async function importExcelLeadRows(rows: ExcelImportRow[]) {
  const imported: ExcelImportRowResult[] = [];
  const failures: ExcelImportFailure[] = [];

  for (const row of rows) {
    try {
      const result = await importExcelLeadRow(row);
      imported.push(result);
    } catch (error) {
      failures.push({
        rowNumber: row.rowNumber,
        companyName: row.companyName,
        message: error instanceof Error ? error.message : "Could not import this row.",
      });
    }
  }

  return { imported, failures };
}

async function importExcelLeadRow(row: ExcelImportRow): Promise<ExcelImportRowResult> {
  const companyWebsiteUrl = normalizeCompanyWebsiteUrl(row.websiteUrl);
  const identity = buildCompanyIdentity(row.websiteUrl);

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
      include: {
        leads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });

    const industry = formatIndustryJa(row.industry) || null;

    const companyData = {
      name: row.companyName,
      industry: industry || undefined,
      location: row.location || undefined,
      address: row.address || undefined,
      primaryEmail: row.email || undefined,
      canonicalWebsiteUrl: identity?.canonicalWebsiteUrl,
      normalizedDomain: identity?.normalizedDomain,
      companyKey: identity?.companyKey,
      source: CompanySource.IMPORT,
      sourceUrl: companyWebsiteUrl,
      lastSeenAt: new Date(),
      savedAt: new Date(),
    };

    const company = existingCompany
      ? await tx.company.update({
          where: { id: existingCompany.id },
          data: {
            ...companyData,
            websiteUrl: companyWebsiteUrl,
            industry: industry || existingCompany.industry,
            location: row.location || existingCompany.location,
            address: row.address || existingCompany.address,
            primaryEmail: row.email || existingCompany.primaryEmail,
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

    let createdContact = false;
    let contactId = existingCompany?.leads[0]?.contactId ?? null;

    if (row.email || row.contactName || row.phone || row.contactTitle) {
      const existingContact = row.email
        ? await tx.contact.findFirst({
            where: {
              companyId: company.id,
              email: row.email,
            },
          })
        : null;

      if (existingContact) {
        const contact = await tx.contact.update({
          where: { id: existingContact.id },
          data: {
            name: row.contactName || existingContact.name,
            title: row.contactTitle || existingContact.title,
            phone: row.phone || existingContact.phone,
            email: row.email || existingContact.email,
            sourceUrl: companyWebsiteUrl,
          },
        });
        contactId = contact.id;
      } else {
        const contact = await tx.contact.create({
          data: {
            companyId: company.id,
            name: row.contactName,
            title: row.contactTitle,
            email: row.email,
            phone: row.phone,
            sourceUrl: companyWebsiteUrl,
          },
        });
        contactId = contact.id;
        createdContact = true;
      }
    }

    const existingLead =
      existingCompany?.leads[0] ??
      (await tx.lead.findFirst({
        where: { companyId: company.id },
        orderBy: { updatedAt: "desc" },
      }));

    const lead = existingLead
      ? await tx.lead.update({
          where: { id: existingLead.id },
          data: {
            status: row.status,
            contactId: contactId ?? existingLead.contactId,
            notes: row.notes || existingLead.notes,
            tags: mergeTags(existingLead.tags, row),
          },
        })
      : await tx.lead.create({
          data: {
            companyId: company.id,
            contactId,
            status: row.status,
            priority: LeadPriority.MEDIUM,
            notes: row.notes || "Imported from Excel.",
            tags: mergeTags([], row),
          },
        });

    return {
      rowNumber: row.rowNumber,
      companyName: company.name,
      companyId: company.id,
      leadId: lead.id,
      createdCompany: !existingCompany,
      createdLead: !existingLead,
      createdContact,
    };
  });
}

function resolveColumnIndex(headers: string[]) {
  const index: Partial<Record<ExcelImportColumn, number>> = {};

  for (const [column, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [ExcelImportColumn, string[]]
  >) {
    const found = headers.findIndex((header) => aliases.includes(header));
    if (found >= 0) {
      index[column] = found;
    }
  }

  return index;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function readCell(
  cells: Array<string | number | boolean | Date | null | undefined>,
  index: number | undefined,
) {
  if (index === undefined) {
    return "";
  }

  const value = cells[index];
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email;
}

function parseLeadStatus(value: string): LeadStatus {
  if (!value) {
    return LeadStatus.NEW;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return STATUS_ALIASES[normalized] ?? LeadStatus.NEW;
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
      // Validate URL shape before normalize.
      new URL(withProtocol);
      return normalizeCompanyWebsiteUrl(withProtocol);
    } catch {
      return null;
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
  const hash = createHash("sha1").update(companyName.toLowerCase()).digest("hex").slice(0, 8);
  return `https://import.local/${slug || "company"}-${hash}`;
}

function mergeTags(existing: string[], row: ExcelImportRow) {
  const next = [
    ...existing,
    ...(row.industry ? [slugTag(row.industry)] : []),
    ...(row.location ? [slugTag(row.location)] : []),
    "excel-import",
  ];

  return Array.from(new Set(next.filter(Boolean))).slice(0, 8);
}

function slugTag(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}
