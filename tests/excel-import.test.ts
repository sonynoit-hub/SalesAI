import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { LeadStatus } from "@/lib/generated/prisma/client";
import { parseExcelImportBuffer } from "@/lib/leads/from-excel";

function buildWorkbookBuffer(rows: Array<Array<string>>) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Leads");
  return Buffer.from(
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer,
  );
}

describe("excel lead import parsing", () => {
  it("extracts fixed columns and defaults status to new", () => {
    const buffer = buildWorkbookBuffer([
      [
        "company_name",
        "website_url",
        "contact_name",
        "email",
        "industry",
        "location",
        "status",
        "notes",
      ],
      [
        "Acme IT",
        "https://acme.example",
        "Ada Lovelace",
        "ada@acme.example",
        "IT",
        "Tokyo",
        "",
        "Warm intro",
      ],
    ]);

    const parsed = parseExcelImportBuffer(buffer);

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.failures.length, 0);
    assert.equal(parsed.rows[0]?.companyName, "Acme IT");
    assert.equal(parsed.rows[0]?.websiteUrl, "https://acme.example");
    assert.equal(parsed.rows[0]?.contactName, "Ada Lovelace");
    assert.equal(parsed.rows[0]?.email, "ada@acme.example");
    assert.equal(parsed.rows[0]?.status, LeadStatus.NEW);
    assert.equal(parsed.rows[0]?.notes, "Warm intro");
  });

  it("accepts Japanese/alias headers and maps status values", () => {
    const buffer = buildWorkbookBuffer([
      ["会社名", "ウェブサイト", "担当者", "メール", "ステータス"],
      ["Beta Soft", "beta.example", "Ken", "ken@beta.example", "qualified"],
    ]);

    const parsed = parseExcelImportBuffer(buffer);

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0]?.companyName, "Beta Soft");
    assert.equal(parsed.rows[0]?.websiteUrl, "https://beta.example");
    assert.equal(parsed.rows[0]?.status, LeadStatus.QUALIFIED);
  });

  it("records a failure when company_name is missing on a non-empty row", () => {
    const buffer = buildWorkbookBuffer([
      ["company_name", "email"],
      ["", "person@example.com"],
    ]);

    const parsed = parseExcelImportBuffer(buffer);

    assert.equal(parsed.rows.length, 0);
    assert.equal(parsed.failures.length, 1);
    assert.match(parsed.failures[0]?.message ?? "", /company_name/i);
  });

  it("parses Japan IT supplier CRM Chinese headers", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["No.", "公司名称", "官网", "都道府县", "地址"],
      [
        "2",
        "株式会社アンカーネットワークサービス",
        "https://www.anchor-net.co.jp/",
        "千葉県",
        "千葉県松戸市南花島313-1",
      ],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Supplier CRM");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["methodology"]]),
      "Methodology",
    );
    const buffer = Buffer.from(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer,
    );

    const parsed = parseExcelImportBuffer(buffer);

    assert.equal(parsed.sheetName, "Supplier CRM");
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0]?.companyName, "株式会社アンカーネットワークサービス");
    assert.equal(parsed.rows[0]?.websiteUrl, "https://anchor-net.co.jp");
    assert.equal(parsed.rows[0]?.location, "千葉県");
    assert.equal(parsed.rows[0]?.address, "千葉県松戸市南花島313-1");
    assert.equal(parsed.rows[0]?.notes, null);
  });
});
