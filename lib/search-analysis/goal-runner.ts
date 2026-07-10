import { prisma } from "@/lib/db/prisma";
import { SearchGoalStatus } from "@/lib/generated/prisma/client";
import { MAX_TARGET_COMPANY_COUNT } from "@/lib/search-analysis/constants";
import { runLeadSearchAnalysis } from "@/lib/search-analysis/pipeline";
import { generateSearchQueryStrategy } from "@/lib/search-analysis/query-generator";
import type { SearchAnalyzeRequest } from "@/lib/search-analysis/schemas";
import {
  applyDatabaseStatuses,
  saveSearchRunToDatabase,
} from "@/lib/search-analysis/store";
import type {
  OpportunityResult,
  SearchAnalyzeResponse,
} from "@/lib/search-analysis/types";

const MAX_GOAL_ATTEMPTS = 3;

type SearchAttemptSummary = {
  attempt: number;
  requested: number;
  returned: number;
};

export async function runLeadSearchGoal(
  request: SearchAnalyzeRequest,
): Promise<SearchAnalyzeResponse> {
  const startedAt = Date.now();
  const targetCompanyCount = request.resultLimit;
  const queryStrategy = await generateSearchQueryStrategy(request);
  const searchGoal = await prisma.searchGoal.create({
    data: {
      opportunityDescription: request.opportunityDescription,
      referenceKeyword: request.referenceKeyword,
      industry: request.industry,
      location: request.location,
      excludeKeywords: request.excludeKeywords,
      generatedAngles: queryStrategy.searchAngles,
      generatedQueries: queryStrategy.searchQueries,
      targetCompanyCount,
    },
  });
  const attempts: SearchAttemptSummary[] = [];
  const resultByUrl = new Map<string, OpportunityResult>();
  let latestResponse: SearchAnalyzeResponse | null = null;

  for (let attempt = 1; attempt <= MAX_GOAL_ATTEMPTS; attempt += 1) {
    const remaining = Math.max(1, targetCompanyCount - resultByUrl.size);
    const searchQueries = selectAttemptQueries({
      attempt,
      queries: queryStrategy.searchQueries,
    });
    const attemptRequest = buildAttemptRequest({
      attempt,
      remaining,
      request,
    });
    const response = await runLeadSearchAnalysis(attemptRequest, {
      searchPlan: queryStrategy.searchPlan,
      searchQueries,
    });

    latestResponse = response;
    await saveSearchRunToDatabase({
      request: attemptRequest,
      run: response,
      searchGoalId: searchGoal.id,
      queryUsed: searchQueries.join("\n"),
    });

    for (const result of await applyDatabaseStatuses(response.results)) {
      if (!result.websiteUrl) continue;
      resultByUrl.set(result.websiteUrl, result);
    }

    attempts.push({
      attempt,
      requested: attemptRequest.resultLimit,
      returned: response.results.length,
    });

    await prisma.searchGoal.update({
      where: { id: searchGoal.id },
      data: {
        foundCompanyCount: resultByUrl.size,
        attemptCount: attempt,
        diagnostics: { attempts, queryStrategy },
      },
    });

    if (resultByUrl.size >= targetCompanyCount) {
      break;
    }
  }

  const status =
    resultByUrl.size >= targetCompanyCount
      ? SearchGoalStatus.COMPLETED
      : resultByUrl.size > 0
        ? SearchGoalStatus.PARTIAL
        : SearchGoalStatus.FAILED;
  const updatedGoal = await prisma.searchGoal.update({
    where: { id: searchGoal.id },
    data: {
      foundCompanyCount: resultByUrl.size,
      attemptCount: attempts.length,
      status,
      diagnostics: { attempts, queryStrategy },
    },
  });
  const finalResults = prioritizeGoalResults(Array.from(resultByUrl.values())).slice(
    0,
    Math.max(targetCompanyCount, request.resultLimit),
  );
  const fallbackResponse = latestResponse ?? (await runLeadSearchAnalysis(request));

  return {
    ...fallbackResponse,
    results: finalResults,
    meta: {
      ...fallbackResponse.meta,
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      resultLimit: targetCompanyCount,
      searchGoal: {
        id: updatedGoal.id,
        status: updatedGoal.status,
        referenceKeyword: updatedGoal.referenceKeyword ?? updatedGoal.opportunityDescription,
        generatedAngles: updatedGoal.generatedAngles,
        generatedQueries: updatedGoal.generatedQueries,
        targetCompanyCount: updatedGoal.targetCompanyCount,
        foundCompanyCount: updatedGoal.foundCompanyCount,
        attemptCount: updatedGoal.attemptCount,
        maxAttempts: MAX_GOAL_ATTEMPTS,
      },
    },
  };
}

function selectAttemptQueries({
  attempt,
  queries,
}: {
  attempt: number;
  queries: string[];
}) {
  const groupSize = Math.max(3, Math.ceil(queries.length / MAX_GOAL_ATTEMPTS));
  const start = (attempt - 1) * groupSize;
  const selected = queries.slice(start, start + groupSize);

  return selected.length > 0 ? selected : queries.slice(0, groupSize);
}

function buildAttemptRequest({
  attempt,
  remaining,
  request,
}: {
  attempt: number;
  remaining: number;
  request: SearchAnalyzeRequest;
}): SearchAnalyzeRequest {
  return {
    ...request,
    opportunityDescription:
      attempt === 1
        ? request.opportunityDescription
        : [
            request.opportunityDescription,
            `Search attempt ${attempt}: use a different generated query group, avoid already discovered companies, and find new company candidates.`,
          ].join(" "),
    resultLimit: Math.min(
      MAX_TARGET_COMPANY_COUNT,
      Math.max(remaining * 3, request.resultLimit),
    ),
  };
}

function prioritizeGoalResults(results: OpportunityResult[]) {
  const order = {
    saved: 0,
    new: 1,
    seen: 2,
  };

  return [...results].sort(
    (a, b) =>
      order[a.databaseStatus?.state ?? "new"] -
      order[b.databaseStatus?.state ?? "new"],
  );
}
