import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import {
  formatDate,
  getDatabaseErrorMessage,
  getDashboardData,
  statusLabel,
} from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

export default async function Home() {
  let dashboardData: Awaited<ReturnType<typeof getDashboardData>>;

  try {
    dashboardData = await getDashboardData();
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    if (!databaseErrorMessage) {
      throw error;
    }

    return (
      <AppShell
        eyebrow="Workspace"
        title="Database connection needed"
        description="SalesAI reads the outreach workflow from PostgreSQL. Start the local database, apply migrations, then refresh this page."
        action={{ label: "Open Database", href: "/database" }}
      >
        <SectionCard title="PostgreSQL is unavailable">
          <div className="space-y-4 text-sm text-slate-600">
            <p>{databaseErrorMessage}</p>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">
              <p>npm run db:migrate</p>
              <p>npm run db:seed</p>
              <p>npm run dev</p>
            </div>
            <p>
              The default local URL expects PostgreSQL on port 5433 with a
              database named salesai.
            </p>
          </div>
        </SectionCard>
      </AppShell>
    );
  }

  const { rows, stats } = dashboardData;
  const priorityRows = rows
    .filter((row) => row.primaryLead)
    .sort((a, b) => b.company.updatedAt.getTime() - a.company.updatedAt.getTime())
    .slice(0, 3);
  const followUpRows = rows.filter((row) => row.nextFollowUp).slice(0, 4);

  return (
    <AppShell
      eyebrow="Workspace"
      title="Sales workflow"
      description="This workspace is now reading the core sales workflow from PostgreSQL through Prisma."
      action={{ label: "Open AI Queue", href: "/companies" }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          helper="Rows in PostgreSQL"
          label="Companies"
          value={stats.companyCount}
        />
        <MetricCard
          helper="Sales opportunities"
          label="Leads"
          value={stats.leadCount}
        />
        <MetricCard
          helper="Generated or approved"
          label="Email drafts"
          value={stats.draftCount}
        />
        <MetricCard
          helper="Open reminders"
          label="Follow-ups"
          value={stats.openFollowUpCount}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <SectionCard title="Active companies">
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {priorityRows.map((row) => (
                  <tr key={row.company.id}>
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-slate-950 hover:text-emerald-700"
                        href={`/companies/${row.company.id}`}
                      >
                        {row.company.name || "Unnamed company"}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {row.company.industry ?? "No industry"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(statusLabel(row.primaryLead?.status))}>
                        {statusLabel(row.primaryLead?.status) || "no lead"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.nextFollowUp
                        ? `Follow up ${formatDate(row.nextFollowUp.dueDate)}`
                        : row.latestDraft
                          ? "Review draft"
                          : "Review company"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link
            className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href="/companies"
          >
            View AI Queue
          </Link>
        </SectionCard>

        <SectionCard title="Follow-up queue">
          <div className="space-y-3">
            {followUpRows.length > 0 ? (
              followUpRows.map((row) => (
                <div
                  className="rounded-md border border-slate-200 px-4 py-3"
                  key={row.nextFollowUp?.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-950">
                        {row.nextFollowUp?.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.company.name || "Unnamed company"} · due{" "}
                        {formatDate(row.nextFollowUp?.dueDate)}
                      </p>
                    </div>
                    <Badge tone={statusTone(statusLabel(row.nextFollowUp?.status))}>
                      {statusLabel(row.nextFollowUp?.status)}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No open follow-ups.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
