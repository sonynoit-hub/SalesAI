import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import { WorkflowActionButton } from "@/components/workflow-action-button";
import {
  formatDate,
  getCompanyQueueRow,
  statusLabel,
} from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

type CompanyDetailPageProps = {
  params: Promise<{
    companyId: string;
  }>;
};

type WorkflowEndpoint =
  | "/api/company-research"
  | "/api/email-drafts";

type WorkflowAction =
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

function getWorkflowAction(
  row: NonNullable<Awaited<ReturnType<typeof getCompanyQueueRow>>>,
): WorkflowAction {
  if (!row.research) {
    return {
      kind: "api",
      label: "Create research",
      endpoint: "/api/company-research",
      helper: "Creates a first research record.",
    };
  }

  if (!row.latestDraft) {
    return {
      kind: "api",
      label: "Create draft",
      endpoint: "/api/email-drafts",
      helper: "Creates a draft from company and research.",
    };
  }

  if (row.latestSentEmail) {
    return {
      kind: "link",
      label: "Review outreach",
      href: "/outreach-history",
      helper: "Sent email exists.",
    };
  }

  return {
    kind: "link",
    label: "Review draft",
    href: "/email-composer",
    helper: "Draft exists.",
  };
}

export default async function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const { companyId } = await params;
  const row = await getCompanyQueueRow(companyId);

  if (!row) {
    notFound();
  }

  const contactStatus = row.primaryContact?.email ? "Recipient ready" : "Missing email";
  const outreachStatus = row.latestSentEmail
    ? "Tracking reply"
    : row.latestDraft
      ? "Draft ready"
      : "No draft";
  const workflowAction = getWorkflowAction(row);

  return (
    <AppShell
      action={{ label: "Back to queue", href: "/companies" }}
      eyebrow="Company detail"
      title={row.company.name || "Unnamed company"}
      description={row.company.description ?? "Real company row from PostgreSQL."}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          helper={row.research ? "research available" : "needs research"}
          label="Research"
          value={row.research ? "Ready" : "Pending"}
        />
        <MetricCard
          helper={row.primaryContact?.name ?? "company-level lead"}
          label="Contact"
          value={contactStatus}
        />
        <MetricCard
          helper={
            row.latestSentEmail
              ? formatDate(row.latestSentEmail.sentAt)
              : statusLabel(row.latestDraft?.status)
          }
          label="Outreach"
          value={outreachStatus}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <SectionCard title="AI review">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Company profile
                </p>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Website</dt>
                    <dd className="mt-1 truncate font-medium text-emerald-700">
                      {row.company.websiteUrl ? (
                        <a
                          href={row.company.websiteUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {row.company.websiteUrl}
                        </a>
                      ) : (
                        "No website"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Industry</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {row.company.industry ?? "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Location</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {row.company.location ?? "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Size</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {row.company.size ?? "Unknown"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.primaryLead ? (
                    <>
                      <Badge tone={statusTone(statusLabel(row.primaryLead.status))}>
                        {statusLabel(row.primaryLead.status)}
                      </Badge>
                      <Badge>{statusLabel(row.primaryLead.priority)} priority</Badge>
                    </>
                  ) : (
                    <Badge tone="amber">No lead</Badge>
                  )}
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-700">
                  {row.research?.summary ??
                    row.company.description ??
                    "No research has been generated yet. Keep this company out of sending until research is complete."}
                </p>
                {row.company.savedAt ? (
                  <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Saved from lead search on {formatDate(row.company.savedAt)}.
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">
                      Pain signals
                    </h3>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      {(row.research?.painPoints.length
                        ? row.research.painPoints
                        : ["No pain signals recorded yet."]
                      ).map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">
                      Sales angle
                    </h3>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      {(row.research?.salesOpportunities.length
                        ? row.research.salesOpportunities
                        : ["No sales opportunities recorded yet."]
                      ).map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Outreach preview">
            {row.latestSentEmail ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(statusLabel(row.latestSentEmail.status))}>
                    {statusLabel(row.latestSentEmail.status)}
                  </Badge>
                  <span className="text-sm text-slate-500">
                    {formatDate(row.latestSentEmail.sentAt)}
                  </span>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="font-medium text-slate-950">
                    {row.latestSentEmail.subject}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
                    {row.latestSentEmail.body}
                  </p>
                </div>
              </div>
            ) : row.latestDraft ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(statusLabel(row.latestDraft.status))}>
                    {statusLabel(row.latestDraft.status)}
                  </Badge>
                  <Badge>{statusLabel(row.latestDraft.tone)}</Badge>
                  <Badge>{statusLabel(row.latestDraft.language)}</Badge>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="font-medium text-slate-950">
                    {row.latestDraft.subject}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
                    {row.latestDraft.body}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                No email draft exists yet. Research should come before outreach.
              </p>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Contact">
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-slate-950">
                  {row.primaryContact?.name ?? "No person selected"}
                </p>
                <p className="mt-1 text-slate-500">
                  {row.primaryContact?.title ?? "Company-level outreach only"}
                </p>
              </div>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                {row.primaryContact?.email ?? "Recipient email missing"}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Next action">
            <div className="space-y-3">
              {workflowAction.kind === "api" ? (
                <WorkflowActionButton
                  companyId={row.company.id}
                  endpoint={workflowAction.endpoint}
                  label={workflowAction.label}
                />
              ) : (
                <Link
                  className="flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
                  href={workflowAction.href}
                >
                  {workflowAction.label}
                </Link>
              )}
              <p className="text-sm text-slate-500">{workflowAction.helper}</p>
              {row.nextFollowUp ? (
                <p className="text-sm text-slate-500">
                  Follow-up due {formatDate(row.nextFollowUp.dueDate)}
                </p>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
