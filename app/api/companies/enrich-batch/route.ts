import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichCompanyRecords } from "@/lib/companies/enrich-company";
import { getDatabaseErrorMessage } from "@/lib/db/sales-workflow";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

const enrichBatchSchema = z.object({
  companyIds: z.array(z.string().trim().min(1)).max(20).optional(),
  onlyMissing: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enrichBatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "companyIds または limit を指定してください。",
          },
        },
        { status: 400 },
      );
    }

    let companyIds = parsed.data.companyIds ?? [];

    if (companyIds.length === 0) {
      const companies = await prisma.company.findMany({
        where: parsed.data.onlyMissing
          ? {
              AND: [
                {
                  OR: [{ primaryEmail: null }, { primaryEmail: "" }],
                },
                {
                  OR: [{ contactFormUrl: null }, { contactFormUrl: "" }],
                },
                {
                  contacts: {
                    none: {
                      email: {
                        not: null,
                      },
                    },
                  },
                },
              ],
            }
          : undefined,
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: parsed.data.limit,
      });
      companyIds = companies.map((company) => company.id);
    } else {
      companyIds = companyIds.slice(0, parsed.data.limit);
    }

    if (companyIds.length === 0) {
      return NextResponse.json({
        data: {
          processed: 0,
          foundCount: 0,
          results: [],
          message: "対象の会社がありません。",
        },
      });
    }

    const results = await enrichCompanyRecords(companyIds);
    const foundCount = results.filter(
      (result) => result.ok && (result.primaryEmail || result.contactFormUrl),
    ).length;

    return NextResponse.json({
      data: {
        processed: results.length,
        foundCount,
        results,
      },
    });
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    return NextResponse.json(
      {
        error: {
          code: databaseErrorMessage ? "DATABASE_UNAVAILABLE" : "ENRICH_BATCH_FAILED",
          message:
            databaseErrorMessage ??
            (error instanceof Error
              ? error.message
              : "一括の連絡先取得に失敗しました。"),
        },
      },
      { status: databaseErrorMessage ? 503 : 500 },
    );
  }
}
