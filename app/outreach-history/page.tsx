import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import {
  formatDate,
  getCompanyQueueRows,
  statusLabel,
} from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

export default async function OutreachHistoryPage() {
  const rows = await getCompanyQueueRows();
  const sentRows = rows.filter((row) => row.latestSentEmail);

  return (
    <AppShell
      eyebrow="Response tracking"
      title="Outreach History"
      description="Track sent message records stored in PostgreSQL."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          helper="Sent email records"
          label="Sent"
          value={sentRows.length}
        />
        <MetricCard
          helper="Gmail reply sync is not connected yet"
          label="Replies"
          value={0}
        />
        <MetricCard
          helper="Rows waiting for future thread tracking"
          label="Waiting"
          value={sentRows.length}
        />
      </div>

      <div className="mt-4">
        <SectionCard title="Email timeline">
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Recipient</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sentRows.map((row) => {
                  const email = row.latestSentEmail;

                  if (!email) return null;

                  return (
                    <tr key={email.id} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-950">
                          {email.subject}
                        </p>
                        {email.errorMessage ? (
                          <p className="mt-1 max-w-72 text-xs leading-5 text-rose-600">
                            {email.errorMessage}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {row.company.name || "Unnamed company"}
                      </td>
                      <td className="px-4 py-4 text-slate-700">{email.toEmail}</td>
                      <td className="px-4 py-4 text-slate-500">
                        {formatDate(email.sentAt)}
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={statusTone(statusLabel(email.status))}>
                          {statusLabel(email.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-medium text-white hover:bg-slate-800"
                          href={`/companies/${row.company.id}`}
                        >
                          Review company
                        </Link>
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
