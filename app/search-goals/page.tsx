import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import { getSearchGoals } from "@/lib/db/search-goals";
import { formatDate, statusLabel } from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

export default async function SearchGoalsPage() {
  const goals = await getSearchGoals();
  const completedCount = goals.filter((goal) => goal.status === "COMPLETED").length;
  const partialCount = goals.filter((goal) => goal.status === "PARTIAL").length;
  const foundCompanyCount = goals.reduce(
    (total, goal) => total + goal.foundCompanyCount,
    0,
  );

  return (
    <AppShell
      action={{ label: "New search goal", href: "/lead-search" }}
      eyebrow="Company search"
      title="Search Goals"
      description="Review search campaigns, target progress, attempts, duplicates, and company candidates."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard helper="Campaigns in PostgreSQL" label="Goals" value={goals.length} />
        <MetricCard helper="Reached target company count" label="Completed" value={completedCount} />
        <MetricCard helper="Found at least one company" label="Partial" value={partialCount} />
        <MetricCard helper="Company candidates from goals" label="Found" value={foundCompanyCount} />
      </div>

      <div className="mt-4">
        <SectionCard title="Campaign history">
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Goal</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Progress</th>
                  <th className="px-4 py-3 font-semibold">Attempts</th>
                  <th className="px-4 py-3 font-semibold">Candidates</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {goals.map((goal) => {
                  const duplicateCount = goal.candidates.filter(
                    (candidate) => candidate.status === "DUPLICATE",
                  ).length;
                  return (
                    <tr className="align-top" key={goal.id}>
                      <td className="px-4 py-4">
                        <Link
                          className="font-medium text-slate-950 hover:text-emerald-700"
                          href={`/search-goals/${goal.id}`}
                        >
                          {goal.referenceKeyword ?? goal.opportunityDescription}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {[goal.industry, goal.location].filter(Boolean).join(" · ") ||
                            "No optional filters"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={statusTone(statusLabel(goal.status))}>
                          {statusLabel(goal.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-950">
                          {goal.foundCompanyCount}/{goal.targetCompanyCount}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          companies found
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-800">{goal.attemptCount}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {goal.runs.length} saved runs
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-xs text-slate-500">
                          duplicates {duplicateCount}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          total {goal.candidates.length}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatDate(goal.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
