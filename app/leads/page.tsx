import { AppShell } from "@/components/app-shell";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { LeadsExcelImport } from "@/components/leads-excel-import";
import {
  LeadsManager,
  type LeadManageRow,
} from "@/components/leads-manager";
import {
  formatDateTime,
  safeGetCompanyQueueRows,
} from "@/lib/db/sales-workflow";
import { deriveLeadContactActivity } from "@/lib/leads/contact-activity";
import { getLatestContactEventsByLeadIds } from "@/lib/leads/contact-events";
import {
  latestLeadProgressAt,
  leadProgressEventLabel,
  resolveLeadProgressStatus,
} from "@/lib/leads/status";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const loaded = await safeGetCompanyQueueRows();
  if (!loaded.ok) {
    return <DatabaseUnavailable eyebrow="パイプライン" message={loaded.message} />;
  }

  const leadIds = loaded.rows
    .map((row) => row.primaryLead?.id)
    .filter((id): id is string => Boolean(id));
  const contactEventsByLeadId = await getLatestContactEventsByLeadIds(leadIds);

  const rows: LeadManageRow[] = loaded.rows
    .filter((row) => row.primaryLead)
    .map((row) => {
      const lead = row.primaryLead!;
      const email =
        row.primaryContact?.email ?? row.outreachEmail ?? row.company.primaryEmail ?? "";
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
        contactName: row.primaryContact?.name ?? "",
        contactTitle: row.primaryContact?.title ?? "",
        email,
        phone: row.primaryContact?.phone ?? "",
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
    <AppShell
      dense
      eyebrow="パイプライン"
      title="リード管理"
      description="作成・編集・削除・インポートと連絡先の一括取得。"
    >
      <div className="space-y-2">
        <div className="hidden md:block">
          <LeadsExcelImport />
        </div>
        <LeadsManager rows={rows} />
      </div>
    </AppShell>
  );
}
