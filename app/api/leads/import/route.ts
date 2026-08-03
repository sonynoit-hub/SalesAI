import { NextResponse } from "next/server";
import {
  importExcelLeadRows,
  parseExcelImportBuffer,
} from "@/lib/leads/from-excel";
import { getDatabaseErrorMessage } from "@/lib/db/sales-workflow";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please upload an Excel file (.xlsx, .xls, or .csv).",
          },
        },
        { status: 400 },
      );
    }

    const fileName = file.name.toLowerCase();
    const hasAllowedExtension = ALLOWED_EXTENSIONS.some((extension) =>
      fileName.endsWith(extension),
    );

    if (!hasAllowedExtension) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Supported formats are .xlsx, .xls, and .csv.",
          },
        },
        { status: 400 },
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "The uploaded file is empty.",
          },
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "File is too large. Keep uploads under 5MB.",
          },
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseExcelImportBuffer(buffer);

    if (parsed.rows.length === 0 && parsed.failures.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "No data rows were found in the sheet.",
          },
        },
        { status: 400 },
      );
    }

    const imported = await importExcelLeadRows(parsed.rows);
    const failures = [...parsed.failures, ...imported.failures];

    return NextResponse.json({
      data: {
        sheetName: parsed.sheetName,
        importedCount: imported.imported.length,
        failedCount: failures.length,
        createdCompanyCount: imported.imported.filter((row) => row.createdCompany)
          .length,
        createdLeadCount: imported.imported.filter((row) => row.createdLead).length,
        imported: imported.imported,
        failures: failures.slice(0, 50),
      },
    });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    return NextResponse.json(
      {
        error: {
          code: databaseErrorMessage ? "DATABASE_UNAVAILABLE" : "IMPORT_FAILED",
          message:
            databaseErrorMessage ??
            (error instanceof Error
              ? error.message
              : "Could not import the Excel file."),
        },
      },
      { status: databaseErrorMessage ? 503 : 500 },
    );
  }
}
