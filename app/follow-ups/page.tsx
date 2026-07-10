import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import {
  formatDate,
  getCompanyQueueRows,
  statusLabel,
} from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const rows = await getCompanyQueueRows();
  const taskRows = rows.filter((row) => row.nextFollowUp);

  return (
    <AppShell
      eyebrow="Daily queue"
      title="Follow-up Tasks"
      description="Review open follow-up tasks stored in PostgreSQL."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          helper="Open follow-up work"
          label="Open"
          value={taskRows.length}
        />
        <MetricCard
          helper="Sent emails being tracked"
          label="Sent emails"
          value={rows.filter((row) => row.latestSentEmail).length}
        />
        <MetricCard
          helper="Companies with no sent email"
          label="Not contacted"
          value={rows.filter((row) => !row.latestSentEmail).length}
        />
      </div>

      <div className="mt-4">
        <SectionCard title="Action queue">
          <div className="grid gap-3">
            {taskRows.length > 0 ? (
              taskRows.map((row) => {
                const task = row.nextFollowUp;

                if (!task) return null;

                return (
                  <div
                    className="rounded-md border border-slate-200 p-4"
                    key={task.id}
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_180px_190px] lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-950">{task.title}</p>
                          <Badge tone={statusTone(statusLabel(task.status))}>
                            {statusLabel(task.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {row.company.name || "Unnamed company"} ·{" "}
                          {row.primaryContact?.name ?? "Company-level"}
                        </p>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                          {task.notes ??
                            row.latestSentEmail?.subject ??
                            row.primaryLead?.notes ??
                            "Review recent context before taking action."}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <p className="text-slate-500">Due</p>
                        <p className="mt-1 font-medium text-slate-950">
                          {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Link
                          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
                          href={`/companies/${row.company.id}`}
                        >
                          Review context
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">No open follow-up tasks.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
