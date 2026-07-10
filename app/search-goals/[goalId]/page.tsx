import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import { getSearchGoalDetail } from "@/lib/db/search-goals";
import { formatDate, statusLabel } from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

type SearchGoalDetailPageProps = {
  params: Promise<{
    goalId: string;
  }>;
};

export default async function SearchGoalDetailPage({
  params,
}: SearchGoalDetailPageProps) {
  const { goalId } = await params;
  const goal = await getSearchGoalDetail(goalId);

  if (!goal) {
    notFound();
  }

  const companyCandidates = goal.candidates.filter(
    (candidate) => candidate.status !== "DUPLICATE" && candidate.status !== "REMOVED",
  );
  const duplicateCandidates = goal.candidates.filter(
    (candidate) => candidate.status === "DUPLICATE",
  );
  const rejectedCandidates = goal.candidates.filter(
    (candidate) => candidate.status === "REMOVED",
  );

  return (
    <AppShell
      action={{ label: "Back to goals", href: "/search-goals" }}
      eyebrow="Search goal"
      title={goal.referenceKeyword ?? goal.opportunityDescription}
      description="Inspect generated query strategy, attempts, company candidates, and duplicates."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          helper={statusLabel(goal.status)}
          label="Progress"
          value={`${goal.foundCompanyCount}/${goal.targetCompanyCount}`}
        />
        <MetricCard
          helper="Search rounds completed"
          label="Attempts"
          value={goal.attemptCount}
        />
        <MetricCard
          helper="Already known companies"
          label="Duplicates"
          value={duplicateCandidates.length}
        />
        <MetricCard
          helper="Filtered non-company junk"
          label="Filtered"
          value={rejectedCandidates.length}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Goal">
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(statusLabel(goal.status))}>
                {statusLabel(goal.status)}
              </Badge>
              <Badge>{formatDate(goal.createdAt)}</Badge>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Industry</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {goal.industry || "Any"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Location</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {goal.location || "Any"}
                </dd>
              </div>
            </dl>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">
                Exclude keywords
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {(goal.excludeKeywords.length ? goal.excludeKeywords : ["none"]).map(
                  (keyword) => (
                    <Badge key={keyword}>{keyword}</Badge>
                  ),
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Generated strategy">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Angles</h3>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                {goal.generatedAngles.map((angle) => (
                  <li key={angle}>- {angle}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Queries</h3>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
                {goal.generatedQueries.map((query) => (
                  <li
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono"
                    key={query}
                  >
                    {query}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <CandidateSection
          candidates={companyCandidates}
          empty="No company candidates for this goal yet."
          title="Companies"
        />
        <CandidateSection
          candidates={duplicateCandidates}
          empty="No duplicate candidates recorded."
          title="Duplicates"
        />
        <CandidateSection
          candidates={rejectedCandidates}
          empty="No filtered candidates recorded."
          title="Filtered"
        />
      </div>

      <div className="mt-4">
        <SectionCard title="Attempts">
          <div className="space-y-3">
            {goal.runs.map((run, index) => (
              <div
                className="rounded-md border border-slate-200 p-4 text-sm"
                key={run.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">
                    Attempt {index + 1}
                  </p>
                  <Badge>{formatDate(run.createdAt)}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  requested {run.resultLimit} · candidates {run.candidates.length}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {run.searchQueries.slice(0, 6).map((query) => (
                    <span
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"
                      key={query}
                    >
                      {query}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

type Candidate = NonNullable<Awaited<ReturnType<typeof getSearchGoalDetail>>>["candidates"][number];

function CandidateSection({
  candidates,
  empty,
  title,
}: {
  candidates: Candidate[];
  empty: string;
  title: string;
}) {
  return (
    <SectionCard title={title}>
      {candidates.length > 0 ? (
        <div className="space-y-3">
          {candidates.slice(0, 12).map((candidate) => (
            <div
              className="rounded-md border border-slate-200 px-3 py-3 text-sm"
              key={candidate.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-950">
                    {candidate.companyName}
                  </p>
                  <p className="mt-1 max-w-72 truncate text-xs text-slate-500">
                    {candidate.websiteUrl}
                  </p>
                </div>
                <Badge>{statusLabel(candidate.status)}</Badge>
              </div>
              {candidate.company ? (
                <Link
                  className="mt-3 inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  href={`/companies/${candidate.company.id}`}
                >
                  Open company
                </Link>
              ) : null}
              {candidate.removedReason ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {candidate.removedReason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-500">{empty}</p>
      )}
    </SectionCard>
  );
}
