import { AppShell } from "@/components/app-shell";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import {
  LeadsManager,
  type LeadManageRow,
} from "@/components/leads-manager";
import {
  formatDateTime,
  safeGetLeadCrmPageRows,
} from "@/lib/db/sales-workflow";
import { deriveLeadContactActivity } from "@/lib/leads/contact-activity";
import { getLatestContactEventsByLeadIds } from "@/lib/leads/contact-events";
import {
  type LeadStatusFilterGroup,
  latestLeadProgressAt,
  leadProgressEventLabel,
  type QualifyFilterGroup,
  resolveLeadProgressStatus,
} from "@/lib/leads/status";

export const dynamic = "force-dynamic";

type LeadsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const QUALIFY_FILTERS = new Set(["all", "unconfirmed", "qualified", "passed"]);
const PROGRESS_FILTERS = new Set([
  "not_contacted",
  "email",
  "phone",
  "reply",
]);

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = (await searchParams) ?? {};
  const filters = {
    location: getStringParam(params.location) || "all",
    qualify: getEnumParam(params.qualify, QUALIFY_FILTERS, "qualified") as QualifyFilterGroup,
    progress: getEnumParam(
      params.progress,
      PROGRESS_FILTERS,
      "not_contacted",
    ) as LeadStatusFilterGroup,
  };
  const page = parsePositiveInteger(getStringParam(params.page), 1);

  const loaded = await safeGetLeadCrmPageRows({
    filters,
    page,
  });
  if (!loaded.ok) {
    return <DatabaseUnavailable eyebrow="パイプライン" message={loaded.message} />;
  }

  const { rows: leadRows, locationOptions, pagination } = loaded.data;
  const leadIds = leadRows.map((row) => row.id);
  const contactEventsByLeadId = await getLatestContactEventsByLeadIds(leadIds);

  const rows: LeadManageRow[] = leadRows
    .map((row) => {
      const lead = row;
      const email =
        row.contact?.email ?? row.company.primaryEmail ?? "";
      const contactFormUrl = row.company.contactFormUrl ?? "";
      const contactActivity = deriveLeadContactActivity({
        tags: lead.tags,
        events: contactEventsByLeadId.get(lead.id),
      });
      const progressStatus = resolveLeadProgressStatus(lead.status, contactActivity);
      const progressAt = latestLeadProgressAt(contactActivity, lead.updatedAt);
      const progressEvent = leadProgressEventLabel(contactActivity, progressAt);
      const progressAtLabel = progressEvent
        ? `${progressEvent} ${formatDateTime(progressAt)}`
        : formatDateTime(progressAt);

      return {
        leadId: lead.id,
        companyId: row.company.id,
        companyName: row.company.name,
        websiteUrl: row.company.websiteUrl,
        industry: row.company.industry ?? "",
        location: row.company.location ?? "",
        address: row.company.address ?? "",
        contactName: row.contact?.name ?? "",
        contactTitle: row.contact?.title ?? "",
        email,
        phone: row.contact?.phone ?? "",
        contactFormUrl,
        hasOutreachChannel: Boolean(email || contactFormUrl),
        status: lead.status,
        progressStatus,
        priority: lead.priority,
        notes: lead.notes ?? "",
        contactActivity: {
          hasEmailContact: contactActivity.hasEmailContact,
          hasPhoneContact: contactActivity.hasPhoneContact,
          hasEmailReply: contactActivity.hasEmailReply,
        },
        progressAtLabel,
      };
    });

  return (
    <AppShell dense>
      <div className="space-y-2">
        <LeadsManager
          filters={filters}
          locationOptions={locationOptions}
          pagination={pagination}
          rows={rows}
        />
      </div>
    </AppShell>
  );
}

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getEnumParam(
  value: string | string[] | undefined,
  allowed: Set<string>,
  fallback: string,
) {
  const current = getStringParam(value);
  return current && allowed.has(current) ? current : fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}
