import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, SectionCard, statusTone } from "@/components/ui";
import { getCompanyQueueRows, statusLabel } from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const rows = (await getCompanyQueueRows()).filter((row) => row.primaryLead);

  return (
    <AppShell
      eyebrow="Pipeline"
      title="Lead CRM"
      description="Review lead status, priority, contacts, tags, and next action from PostgreSQL."
    >
      <SectionCard title="Pipeline list">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Next action</th>
                <th className="px-4 py-3 font-semibold">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => {
                const lead = row.primaryLead;

                if (!lead) return null;

                return (
                  <tr key={lead.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-medium text-slate-950 hover:text-emerald-700"
                        href={`/companies/${row.company.id}`}
                      >
                        {row.company.name || "Unnamed company"}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {[row.company.industry, row.company.location]
                          .filter(Boolean)
                          .join(" · ") || "No industry/location"}
                      </p>
                      <p className="mt-2 max-w-56 truncate text-xs font-medium text-emerald-700">
                        {row.company.websiteUrl || "No website"}
                      </p>
                      {row.company.description ? (
                        <p className="mt-2 max-w-72 text-xs leading-5 text-slate-500">
                          {row.company.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-slate-800">
                        {row.primaryContact?.name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.primaryContact?.title ?? "Company-level lead"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={statusTone(statusLabel(lead.status))}>
                        {statusLabel(lead.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {statusLabel(lead.priority)}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-slate-800">
                        {row.nextFollowUp
                          ? row.nextFollowUp.title
                          : row.latestDraft
                            ? "Review email draft"
                            : "Review saved company"}
                      </p>
                      <Link
                        className="mt-2 inline-flex text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                        href={`/companies/${row.company.id}`}
                      >
                        Open record
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {lead.tags.length > 0 ? (
                          lead.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
                        ) : (
                          <span className="text-xs text-slate-500">No tags</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
