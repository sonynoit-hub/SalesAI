import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import { WorkflowActionButton } from "@/components/workflow-action-button";
import {
  formatDate,
  getCompanyQueueRows,
  statusLabel,
} from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

type CompanyQueueRow = Awaited<ReturnType<typeof getCompanyQueueRows>>[number];

type WorkflowEndpoint =
  | "/api/company-research"
  | "/api/email-drafts";

type NextAction =
  | {
      kind: "api";
      label: string;
      endpoint: WorkflowEndpoint;
      helper: string;
    }
  | {
      kind: "link";
      label: string;
      href: string;
      helper: string;
    };

function getAiStatus(row: CompanyQueueRow) {
  if (row.nextFollowUp) {
    return { label: "Follow-up due", tone: "sky" as const };
  }

  if (row.latestSentEmail) {
    return { label: "Tracking reply", tone: "sky" as const };
  }

  if (row.latestDraft?.status === "APPROVED") {
    return { label: "Ready to send", tone: "emerald" as const };
  }

  if (row.latestDraft) {
    return { label: "Draft review", tone: "amber" as const };
  }

  if (row.research) {
    return { label: "Needs draft", tone: "amber" as const };
  }

  return { label: "Needs research", tone: "slate" as const };
}

function getNextAction(row: CompanyQueueRow): NextAction {
  if (row.nextFollowUp) {
    return {
      kind: "link",
      label: "Review follow-up",
      href: "/follow-ups",
      helper: `Due ${formatDate(row.nextFollowUp.dueDate)}`,
    };
  }

  if (row.latestSentEmail) {
    return {
      kind: "link",
      label: "View outreach",
      href: "/outreach-history",
      helper: formatDate(row.latestSentEmail.sentAt),
    };
  }

  if (row.latestDraft) {
    return {
      kind: "link",
      label: "Review draft",
      href: "/email-composer",
      helper: statusLabel(row.latestDraft.status),
    };
  }

  if (row.research) {
    return {
      kind: "api",
      label: "Create draft",
      endpoint: "/api/email-drafts",
      helper: "Research is ready",
    };
  }

  return {
    kind: "api",
    label: "Research",
    endpoint: "/api/company-research",
    helper: "No research record",
  };
}

export default async function CompaniesPage() {
  const rows = await getCompanyQueueRows();
  const needsResearchCount = rows.filter((row) => !row.research).length;
  const readyToSendCount = rows.filter(
    (row) => row.latestDraft?.status === "APPROVED",
  ).length;
  const trackingCount = rows.filter(
    (row) => row.latestSentEmail || row.nextFollowUp,
  ).length;

  return (
    <AppShell
      action={{ label: "Search companies", href: "/lead-search" }}
      eyebrow="AI outreach"
      title="Company Outreach Queue"
      description="Review real companies from PostgreSQL with their research, draft, sent email, and follow-up state."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          helper="Companies in PostgreSQL"
          label="Companies"
          value={rows.length}
        />
        <MetricCard
          helper="Need company research before outreach"
          label="Needs research"
          value={needsResearchCount}
        />
        <MetricCard
          helper="Approved drafts waiting for Gmail"
          label="Ready to send"
          value={readyToSendCount}
        />
        <MetricCard
          helper="Sent emails or open follow-ups"
          label="Tracking"
          value={trackingCount}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <SectionCard title="AI queue">
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_170px_170px]">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Search</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                placeholder="Company, industry, location"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">AI status</span>
              <select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                <option>All statuses</option>
                <option>Needs research</option>
                <option>Needs draft</option>
                <option>Draft review</option>
                <option>Ready to send</option>
                <option>Tracking reply</option>
                <option>Follow-up due</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Outreach</span>
              <select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                <option>All outreach</option>
                <option>No draft</option>
                <option>Draft ready</option>
                <option>Email sent</option>
                <option>Follow-up due</option>
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">AI status</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Outreach</th>
                  <th className="px-4 py-3 font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => {
                  const aiStatus = getAiStatus(row);
                  const nextAction = getNextAction(row);

                  return (
                    <tr key={row.company.id} className="align-top">
                      <td className="px-4 py-4">
                        <Link
                          className="font-medium text-slate-950 hover:text-emerald-700"
                          href={`/companies/${row.company.id}`}
                        >
                          {row.company.name || "Unnamed company"}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {[row.company.industry, row.company.location]
                            .filter(Boolean)
                            .join(" · ") || "No industry/location"}
                        </p>
                        <p className="mt-2 max-w-60 truncate text-xs font-medium text-emerald-700">
                          {row.company.websiteUrl || "No website"}
                        </p>
                        {row.company.description ? (
                          <p className="mt-2 max-w-72 text-xs leading-5 text-slate-500">
                            {row.company.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <Badge tone={aiStatus.tone}>{aiStatus.label}</Badge>
                          <p className="max-w-56 text-xs leading-5 text-slate-500">
                            {row.research?.summary ??
                              row.company.description ??
                              "No research record yet."}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-slate-800">
                          {row.primaryContact?.name ?? "Company-level"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.primaryContact?.title ?? "No person selected"}
                        </p>
                        <p className="mt-2 max-w-48 truncate text-xs text-slate-500">
                          {row.primaryContact?.email ?? "No recipient email"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {row.latestSentEmail ? (
                          <div>
                            <Badge tone={statusTone(statusLabel(row.latestSentEmail.status))}>
                              sent
                            </Badge>
                            <p className="mt-2 max-w-56 text-xs leading-5 text-slate-500">
                              {row.latestSentEmail.subject}
                            </p>
                          </div>
                        ) : row.latestDraft ? (
                          <div>
                            <Badge tone={statusTone(statusLabel(row.latestDraft.status))}>
                              {statusLabel(row.latestDraft.status)}
                            </Badge>
                            <p className="mt-2 max-w-56 text-xs leading-5 text-slate-500">
                              {row.latestDraft.subject}
                            </p>
                          </div>
                        ) : (
                          <Badge tone="slate">No email yet</Badge>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-44 flex-col gap-2">
                          {nextAction.kind === "api" ? (
                            <WorkflowActionButton
                              companyId={row.company.id}
                              endpoint={nextAction.endpoint}
                              label={nextAction.label}
                            />
                          ) : (
                            <Link
                              className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-medium text-white hover:bg-slate-800"
                              href={nextAction.href}
                            >
                              {nextAction.label}
                            </Link>
                          )}
                          <p className="text-xs leading-5 text-slate-500">
                            {nextAction.helper}
                          </p>
                          {row.company.savedAt ? (
                            <p className="text-xs text-slate-400">
                              Saved {formatDate(row.company.savedAt)}
                            </p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Queue summary">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
              <span className="text-slate-600">Needs research</span>
              <Badge>{needsResearchCount}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
              <span className="text-slate-600">Ready to send</span>
              <Badge tone="emerald">{readyToSendCount}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
              <span className="text-slate-600">Tracking</span>
              <Badge tone="sky">{trackingCount}</Badge>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
