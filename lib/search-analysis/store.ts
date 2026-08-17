import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCompanyIdentity } from "@/lib/company-identity";
import { prisma } from "@/lib/db/prisma";
import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import type {
  CompanyDatabaseStatus,
  OpportunityResult,
  SearchAnalyzeResponse,
} from "@/lib/search-analysis/types";

const workDir = path.join(process.cwd(), "work");
const searchRunsPath = path.join(workDir, "search-runs.json");

type StoredSearchRun = SearchAnalyzeResponse & {
  id: string;
};

export async function saveSearchRun(run: SearchAnalyzeResponse) {
  await mkdir(workDir, { recursive: true });

  const existing = await readSearchRuns();
  const nextRun: StoredSearchRun = {
    id: `run-${Date.now()}`,
    ...run,
  };

  await writeFile(
    searchRunsPath,
    JSON.stringify([nextRun, ...existing].slice(0, 20), null, 2),
  );

  return nextRun;
}

export async function saveSearchRunToDatabase({
  request,
  run,
  searchGoalId,
  queryUsed,
}: {
  request: SearchAnalyzeRequest;
  run: SearchAnalyzeResponse;
  searchGoalId?: string;
  queryUsed?: string;
}) {
  try {
    const searchRun = await prisma.searchRun.create({
      data: {
        searchGoalId,
        opportunityDescription: request.opportunityDescription,
        industry: request.industry,
        location: request.location,
        resultLimit: request.resultLimit,
        searchPlan: run.meta.searchPlan,
        searchQueries: run.meta.searchQueries,
        diagnostics: run.meta.diagnostics ?? {},
        durationMs: run.meta.durationMs,
        candidates: {
          create: run.results.map((result) => {
            const identity = buildCompanyIdentity(result.websiteUrl);

            return {
              companyName: result.companyName,
              websiteUrl: result.websiteUrl,
              aboutUrl: result.aboutUrl,
              searchGoalId,
              normalizedDomain: identity?.normalizedDomain,
              companyKey: identity?.companyKey,
              source: result.source,
              status: toCandidateStatus(result.databaseStatus),
              removedReason: toCandidateRemovedReason(result.databaseStatus),
              queryUsed,
              evidence: result.evidence ?? {},
              salesBrief: result.salesBrief,
            };
          }),
        },
      },
    });

    return searchRun;
  } catch {
    return saveSearchRun(run);
  }
}

export async function applyDatabaseStatuses(
  results: OpportunityResult[],
): Promise<OpportunityResult[]> {
  try {
    const identities = results
      .map((result) => buildCompanyIdentity(result.websiteUrl))
      .filter((identity): identity is NonNullable<typeof identity> => Boolean(identity));
    const domains = Array.from(new Set(identities.map((identity) => identity.normalizedDomain)));

    if (domains.length === 0) {
      return results.map((result) => ({
        ...result,
        databaseStatus: { state: "new" },
      }));
    }

    const [companies, seenCandidates] = await Promise.all([
      prisma.company.findMany({
        where: {
          normalizedDomain: {
            in: domains,
          },
        },
        include: {
          leads: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.searchCandidate.findMany({
        where: {
          normalizedDomain: {
            in: domains,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);
    const companyByDomain = new Map(
      companies
        .filter((company) => company.normalizedDomain)
        .map((company) => [company.normalizedDomain as string, company]),
    );
    const seenByDomain = new Map<string, { createdAt: Date; count: number }>();

    for (const candidate of seenCandidates) {
      if (!candidate.normalizedDomain) continue;

      const existing = seenByDomain.get(candidate.normalizedDomain);
      seenByDomain.set(candidate.normalizedDomain, {
        createdAt: existing?.createdAt ?? candidate.createdAt,
        count: (existing?.count ?? 0) + 1,
      });
    }

    return results.map((result) => {
      const identity = buildCompanyIdentity(result.websiteUrl);
      const company = identity ? companyByDomain.get(identity.normalizedDomain) : undefined;
      const seen = identity ? seenByDomain.get(identity.normalizedDomain) : undefined;

      return {
        ...result,
        databaseStatus: buildDatabaseStatus({ company, seen }),
      };
    });
  } catch {
    return results.map((result) => ({
      ...result,
      databaseStatus: { state: "new" },
    }));
  }
}

export async function getKnownCompanyDomainKeys(): Promise<Set<string>> {
  const keys = new Set<string>();

  try {
    const [companies, candidates] = await Promise.all([
      prisma.company.findMany({
        select: {
          normalizedDomain: true,
          websiteUrl: true,
        },
      }),
      prisma.searchCandidate.findMany({
        select: {
          normalizedDomain: true,
          websiteUrl: true,
        },
      }),
    ]);

    for (const company of companies) {
      addDomainKeys(keys, company.normalizedDomain, company.websiteUrl);
    }

    for (const candidate of candidates) {
      addDomainKeys(keys, candidate.normalizedDomain, candidate.websiteUrl);
    }
  } catch {
    return keys;
  }

  return keys;
}

async function readSearchRuns(): Promise<StoredSearchRun[]> {
  try {
    const content = await readFile(searchRunsPath, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildDatabaseStatus({
  company,
  seen,
}: {
  company?: {
    id: string;
    lastSeenAt: Date | null;
    seenCount: number;
    leads: Array<{ id: string }>;
  };
  seen?: {
    createdAt: Date;
    count: number;
  };
}): CompanyDatabaseStatus {
  const lead = company?.leads[0];

  if (company && lead) {
    return {
      state: "saved",
      companyId: company.id,
      leadId: lead.id,
      lastSeenAt: company.lastSeenAt?.toISOString() ?? seen?.createdAt.toISOString(),
      seenCount: company.seenCount || seen?.count,
    };
  }

  if (company || seen) {
    return {
      state: "seen",
      companyId: company?.id,
      lastSeenAt: company?.lastSeenAt?.toISOString() ?? seen?.createdAt.toISOString(),
      seenCount: company?.seenCount || seen?.count,
    };
  }

  return { state: "new" };
}

function addDomainKeys(keys: Set<string>, ...values: Array<string | null>) {
  for (const value of values) {
    const key = normalizeDomainKey(value);

    if (key) {
      keys.add(key);
    }
  }
}

function normalizeDomainKey(value: string | null) {
  if (!value) {
    return "";
  }

  const hostname = parseHostname(value);

  return hostname
    .toLowerCase()
    .replace(/^(www|m|en|jp|ja|global|corp|corporate)\./, "")
    .replace(/\.$/, "")
    .trim();
}

function parseHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function toCandidateStatus(status: CompanyDatabaseStatus | undefined) {
  if (status?.state === "saved" || status?.state === "seen") {
    return "DUPLICATE" as const;
  }

  return "VERIFIED" as const;
}

function toCandidateRemovedReason(status: CompanyDatabaseStatus | undefined) {
  if (status?.state === "saved") {
    return "Already exists as a saved company/lead.";
  }

  if (status?.state === "seen") {
    return "Already exists in the company database.";
  }

  return undefined;
}
