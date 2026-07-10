import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, SectionCard } from "@/components/ui";
import { getCompanyQueueRows } from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

export default async function CompanyResearchPage() {
  const rows = await getCompanyQueueRows();
  const researchedRows = rows.filter((row) => row.research);
  const pendingRows = rows.filter((row) => !row.research);

  return (
    <AppShell
      eyebrow="AI research"
      title="Research Review"
      description="Review stored company research records from PostgreSQL before writing outreach."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          helper="Companies with research records"
          label="Researched"
          value={researchedRows.length}
        />
        <MetricCard
          helper="Companies without research"
          label="Pending"
          value={pendingRows.length}
        />
        <MetricCard
          helper="Public sources captured"
          label="Sources"
          value={researchedRows.reduce(
            (total, row) => total + (row.research?.researchSources.length ?? 0),
            0,
          )}
        />
      </div>

      <div className="mt-4 space-y-4">
        {rows.map((row) => (
          <SectionCard
            key={row.company.id}
            title={row.company.name || "Unnamed company"}
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone={row.research ? "emerald" : "amber"}>
                    {row.research ? "reviewed" : "pending"}
                  </Badge>
                  {row.company.industry ? <Badge>{row.company.industry}</Badge> : null}
                  {row.company.location ? <Badge>{row.company.location}</Badge> : null}
                </div>
                <p className="text-sm leading-6 text-slate-700">
                  {row.research?.summary ??
                    "This company has no stored research record yet."}
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">
                      Pain signals
                    </h4>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      {(row.research?.painPoints.length
                        ? row.research.painPoints
                        : ["No evidence collected yet."]
                      ).map((point) => (
                        <li key={point}>- {point}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">
                      Outreach angle
                    </h4>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      {(row.research?.salesOpportunities.length
                        ? row.research.salesOpportunities
                        : ["No sales angle recorded yet."]
                      ).map((point) => (
                        <li key={point}>- {point}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <aside className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Sources
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {row.research?.researchSources.length ?? "--"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(row.research?.technologies.length
                    ? row.research.technologies
                    : ["not scanned"]
                  ).map((tech) => (
                    <Badge key={tech} tone={row.research ? "sky" : "slate"}>
                      {tech}
                    </Badge>
                  ))}
                </div>
                <Link
                  className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  href={`/companies/${row.company.id}`}
                >
                  Open detail
                </Link>
              </aside>
            </div>
          </SectionCard>
        ))}
      </div>
    </AppShell>
  );
}
