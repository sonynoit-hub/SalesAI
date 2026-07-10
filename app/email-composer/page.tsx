import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, SectionCard, statusTone } from "@/components/ui";
import { getCompanyQueueRows, statusLabel } from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

export default async function EmailComposerPage() {
  const rows = await getCompanyQueueRows();
  const draftRows = rows.filter((row) => row.latestDraft);
  const leadRows = rows.filter((row) => row.primaryLead);

  return (
    <AppShell
      eyebrow="Email approval"
      title="Draft Review"
      description="Review stored outreach drafts from PostgreSQL before Gmail sending is connected."
    >
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <SectionCard title="Draft context">
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Lead</span>
              <select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                {leadRows.map((row) => (
                  <option key={row.primaryLead?.id}>
                    {row.company.name || "Unnamed company"}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
              Draft creation and approval actions will be wired to APIs next.
              This page currently shows records already stored in PostgreSQL.
            </div>
            <Link
              className="flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
              href="/companies"
            >
              Back to AI Queue
            </Link>
          </div>
        </SectionCard>

        <div className="space-y-4">
          {draftRows.length > 0 ? (
            draftRows.map((row) => {
              const draft = row.latestDraft;

              if (!draft) return null;

              return (
                <SectionCard key={draft.id} title={draft.subject}>
                  <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                    <div>
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(statusLabel(draft.status))}>
                          {statusLabel(draft.status)}
                        </Badge>
                        <Badge>{statusLabel(draft.tone)}</Badge>
                        <Badge>{statusLabel(draft.language)}</Badge>
                        <span className="text-sm text-slate-500">
                          {row.company.name || "Unnamed company"} ·{" "}
                          {row.primaryContact?.email ?? "No email"}
                        </span>
                      </div>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Subject</span>
                        <input
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                          defaultValue={draft.subject}
                          readOnly
                        />
                      </label>
                      <label className="mt-3 block text-sm">
                        <span className="font-medium text-slate-700">Body</span>
                        <textarea
                          className="mt-1 min-h-64 w-full rounded-md border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-800"
                          defaultValue={draft.body}
                          readOnly
                        />
                      </label>
                    </div>
                    <aside className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">
                        Readiness
                      </p>
                      <div className="mt-3 space-y-2 text-sm">
                        {[
                          ["Research", Boolean(row.research)],
                          ["Lead", Boolean(row.primaryLead)],
                          ["Recipient", Boolean(row.primaryContact?.email)],
                          ["Draft", true],
                        ].map(([item, ok]) => (
                          <div
                            className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                            key={String(item)}
                          >
                            <span className="text-slate-600">{item}</span>
                            <Badge tone={ok ? "emerald" : "amber"}>
                              {ok ? "ok" : "missing"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      <Link
                        className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
                        href={`/companies/${row.company.id}`}
                      >
                        Open company detail
                      </Link>
                    </aside>
                  </div>
                </SectionCard>
              );
            })
          ) : (
            <SectionCard title="No drafts">
              <p className="text-sm text-slate-600">
                No email draft records exist in PostgreSQL yet.
              </p>
            </SectionCard>
          )}
        </div>
      </div>
    </AppShell>
  );
}
