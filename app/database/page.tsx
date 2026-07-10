import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

async function getDatabasePreview() {
  const [
    companies,
    companyCount,
    contactCount,
    leadCount,
    researchCount,
    draftCount,
    sentEmailCount,
    followUpCount,
  ] = await Promise.all([
    prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        contacts: {
          take: 1,
        },
        leads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            emailDrafts: {
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
            sentEmails: {
              orderBy: { sentAt: "desc" },
              take: 1,
            },
            followUpTasks: {
              where: { status: "OPEN" },
              orderBy: { dueDate: "asc" },
              take: 1,
            },
          },
        },
        research: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take: 20,
    }),
    prisma.company.count(),
    prisma.contact.count(),
    prisma.lead.count(),
    prisma.companyResearch.count(),
    prisma.emailDraft.count(),
    prisma.sentEmail.count(),
    prisma.followUpTask.count(),
  ]);

  return {
    companies,
    counts: {
      companies: companyCount,
      contacts: contactCount,
      leads: leadCount,
      research: researchCount,
      drafts: draftCount,
      sentEmails: sentEmailCount,
      followUps: followUpCount,
    },
  };
}

export default async function DatabasePage() {
  const { companies, counts } = await getDatabasePreview();

  return (
    <AppShell
      eyebrow="PostgreSQL"
      title="Database Preview"
      description="This page reads directly from PostgreSQL through Prisma, so it confirms the real database is connected to the app."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          helper="Rows in the real companies table"
          label="Companies"
          value={counts.companies}
        />
        <MetricCard
          helper="People linked to companies"
          label="Contacts"
          value={counts.contacts}
        />
        <MetricCard
          helper="Sales opportunities"
          label="Leads"
          value={counts.leads}
        />
        <MetricCard
          helper="Open or completed reminders"
          label="Follow-ups"
          value={counts.followUps}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          helper="AI/web research snapshots"
          label="Research"
          value={counts.research}
        />
        <MetricCard
          helper="Generated or manual drafts"
          label="Drafts"
          value={counts.drafts}
        />
        <MetricCard
          helper="Recorded Gmail sends"
          label="Sent emails"
          value={counts.sentEmails}
        />
      </div>

      <div className="mt-4">
        <SectionCard title="Company rows from PostgreSQL">
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Research</th>
                  <th className="px-4 py-3 font-semibold">Draft</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                  <th className="px-4 py-3 font-semibold">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {companies.map((company) => {
                  const lead = company.leads[0];
                  const draft = lead?.emailDrafts[0];
                  const sentEmail = lead?.sentEmails[0];
                  const followUp = lead?.followUpTasks[0];
                  const research = company.research[0];

                  return (
                    <tr className="align-top" key={company.id}>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-950">
                          {company.name || "Unnamed company"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {company.websiteUrl || "No website"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {[company.industry, company.location]
                            .filter(Boolean)
                            .join(" · ") || "No industry/location"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-slate-800">
                          {company.contacts[0]?.name ?? "No contact"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {company.contacts[0]?.email ?? ""}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {lead ? (
                          <div className="space-y-2">
                            <Badge tone={statusTone(lead.status.toLowerCase())}>
                              {lead.status.toLowerCase()}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No lead</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {research ? (
                          <p className="max-w-56 text-xs leading-5 text-slate-600">
                            {research.summary}
                          </p>
                        ) : (
                          <span className="text-xs text-slate-500">No research</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {draft ? (
                          <div>
                            <Badge tone={statusTone(draft.status.toLowerCase())}>
                              {draft.status.toLowerCase()}
                            </Badge>
                            <p className="mt-2 max-w-48 text-xs leading-5 text-slate-500">
                              {draft.subject}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No draft</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {sentEmail ? (
                          <div>
                            <Badge tone={statusTone(sentEmail.status.toLowerCase())}>
                              {sentEmail.status.toLowerCase()}
                            </Badge>
                            <p className="mt-2 text-xs text-slate-500">
                              {sentEmail.toEmail}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No sent email</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {followUp ? (
                          <div>
                            <Badge tone={statusTone(followUp.status.toLowerCase())}>
                              {followUp.status.toLowerCase()}
                            </Badge>
                            <p className="mt-2 text-xs text-slate-500">
                              {followUp.title}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No task</span>
                        )}
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
