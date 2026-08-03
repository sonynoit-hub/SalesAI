import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CompanyProfileEditor } from "@/components/company-profile-editor";
import { MarkCalledButton } from "@/components/mark-called-button";
import { ContactCardEditor } from "@/components/contact-card-editor";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { MarkRepliedButton } from "@/components/mark-replied-button";
import { ManualContactForm } from "@/components/manual-contact-form";
import { ResearchMemoEditor } from "@/components/research-memo-editor";
import { Badge, SectionCard } from "@/components/ui";
import { WorkflowActionButton } from "@/components/workflow-action-button";
import { formatIndustryJa } from "@/lib/industries";
import { getLatestContactEventsByLeadIds } from "@/lib/leads/contact-events";
import { deriveLeadContactActivity } from "@/lib/leads/contact-activity";
import { leadStatusLabelJa } from "@/lib/leads/status";
import {
  type CompanyQueueRow,
  formatDate,
  formatDateTime,
  isLeadContacted,
  safeGetCompanyQueueRow,
} from "@/lib/db/sales-workflow";

export const dynamic = "force-dynamic";

type CompanyDetailPageProps = {
  params: Promise<{
    companyId: string;
  }>;
};

type WorkflowAction =
  | {
      kind: "api";
      label: string;
      endpoint: "/api/email-drafts";
      redirectTo?: string;
      helper: string;
    }
  | {
      kind: "link";
      label: string;
      href: string;
      helper: string;
    };

function getWorkflowAction(row: CompanyQueueRow): WorkflowAction {
  if (!row.outreachEmail) {
    return {
      kind: "link",
      label: "担当者を追加",
      href: "#manual-contact",
      helper: "メール作成前に宛先メールが必要です。",
    };
  }

  if (row.latestDraft) {
    return {
      kind: "link",
      label: "下書きを確認",
      href: "/email-composer",
      helper: "下書きがあります。承認後に送信できます。",
    };
  }

  if (row.latestSentEmail?.status === "SENT") {
    return {
      kind: "api",
      label: "フォローメールを作成",
      endpoint: "/api/email-drafts",
      redirectTo: "/email-composer",
      helper: "送信済みです。新しい下書きを作って再送できます。",
    };
  }

  return {
    kind: "api",
    label: "下書きを作成",
    endpoint: "/api/email-drafts",
    redirectTo: "/email-composer",
    helper: "初回メール用の下書きを作成します。",
  };
}

export default async function CompanyDetailPage({
  params,
}: CompanyDetailPageProps) {
  const { companyId } = await params;
  const loaded = await safeGetCompanyQueueRow(companyId);

  if (!loaded.ok) {
    return (
      <DatabaseUnavailable eyebrow="会社詳細" message={loaded.message} />
    );
  }

  const row = loaded.row;
  if (!row) {
    notFound();
  }

  const leadId = row.primaryLead?.id ?? null;
  const eventMap = leadId
    ? await getLatestContactEventsByLeadIds([leadId])
    : new Map();
  const latestEvents = leadId ? eventMap.get(leadId) ?? null : null;

  const workflowAction = getWorkflowAction(row);
  const isReplied = row.primaryLead?.status === "REPLIED";
  const contactActivity = deriveLeadContactActivity({
    tags: row.primaryLead?.tags,
    events: latestEvents,
  });
  const contacted =
    isLeadContacted(row.primaryLead?.status) ||
    row.latestSentEmail?.status === "SENT";
  const activityMeta = [
    contactActivity.emailContactedAt
      ? `メール ${formatDateTime(contactActivity.emailContactedAt)}`
      : null,
    contactActivity.phoneContactedAt
      ? `架電 ${formatDateTime(contactActivity.phoneContactedAt)}`
      : null,
    contactActivity.emailRepliedAt
      ? `返信 ${formatDateTime(contactActivity.emailRepliedAt)}`
      : null,
    row.company.savedAt ? `保存日 ${formatDate(row.company.savedAt)}` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <AppShell
      action={{ label: "リード一覧へ", href: "/leads" }}
      dense
      eyebrow="会社詳細"
      title={row.company.name || "未命名の会社"}
      description={[formatIndustryJa(row.company.industry), row.company.location]
        .filter(Boolean)
        .join(" · ")}
    >
      <div className="grid gap-3 xl:grid-cols-12 xl:items-stretch">
        <SectionCard className="xl:col-span-4" compact title="会社情報">
          <div className="mb-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={contacted ? "emerald" : "amber"}>
                {contacted ? "連絡済み" : "未連絡"}
              </Badge>
              {row.primaryLead ? (
                <Badge tone="slate">
                  リード: {leadStatusLabelJa(row.primaryLead.status)}
                </Badge>
              ) : null}
              {contactActivity.hasEmailContact ? <Badge tone="sky">メール送信</Badge> : null}
              {contactActivity.hasPhoneContact ? <Badge tone="sky">架電済み</Badge> : null}
              {contactActivity.hasEmailReply ? <Badge tone="emerald">メール返信あり</Badge> : null}
            </div>
            {activityMeta.length > 0 ? (
              <p className="text-xs text-slate-500">{activityMeta.join(" / ")}</p>
            ) : null}
          </div>
          <CompanyProfileEditor
            key={row.company.updatedAt.toISOString()}
            companyId={row.company.id}
            compact
            initial={{
              name: row.company.name,
              websiteUrl: row.company.websiteUrl,
              industry: row.company.industry ?? "",
              location: row.company.location ?? "",
              address: row.company.address ?? "",
              primaryEmail: row.company.primaryEmail ?? "",
              contactFormUrl: row.company.contactFormUrl ?? "",
              description: row.company.description ?? "",
            }}
          />
        </SectionCard>

        <SectionCard className="xl:col-span-4" compact title="担当者">
          <div className="space-y-3">
            {row.company.contacts.length > 0 ? (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {row.company.contacts.map((contact) => (
                  <ContactCardEditor
                    companyId={row.company.id}
                    contact={{
                      id: contact.id,
                      name: contact.name,
                      title: contact.title,
                      email: contact.email,
                      phone: contact.phone,
                    }}
                    isActive={row.primaryContact?.id === contact.id}
                    key={contact.id}
                  />
                ))}
              </div>
            ) : row.outreachEmail || row.company.contactFormUrl ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs font-medium text-emerald-800">
                    現在の宛先
                  </p>
                  <Badge tone="emerald">使用中</Badge>
                </div>
                {row.outreachEmail ? (
                  <p className="mt-1 truncate font-medium text-slate-900">
                    {row.outreachEmail}
                  </p>
                ) : null}
                {row.company.contactFormUrl ? (
                  <a
                    className="mt-1 block truncate text-xs text-blue-600 hover:text-blue-800"
                    href={row.company.contactFormUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    お問い合わせフォーム
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">宛先がまだありません</p>
            )}

            {row.company.contacts.length > 0 &&
            !row.primaryContact &&
            row.company.primaryEmail ? (
              <p className="text-xs text-slate-500">
                会社メール {row.company.primaryEmail} を暫定宛先にしています
              </p>
            ) : null}

            <div id="manual-contact" className="border-t border-slate-100 pt-2">
              <p className="mb-2 text-xs font-medium text-slate-800">
                担当者を追加
              </p>
              <ManualContactForm
                companyId={row.company.id}
                compact
                defaultSourceUrl={row.company.websiteUrl}
              />
            </div>

            <WorkflowActionButton
              companyId={row.company.id}
              endpoint="/api/company-enrichment"
              label="会社情報を補完"
            />
          </div>
        </SectionCard>

        <div className="flex flex-col gap-3 xl:col-span-4">
          <SectionCard compact title="次のアクション">
            <div className="space-y-2">
              {workflowAction.kind === "api" ? (
                <WorkflowActionButton
                  companyId={row.company.id}
                  endpoint={workflowAction.endpoint}
                  label={workflowAction.label}
                  redirectTo={workflowAction.redirectTo}
                />
              ) : (
                <Link
                  className="flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                  href={workflowAction.href}
                >
                  {workflowAction.label}
                </Link>
              )}
              <p className="text-xs text-slate-500">{workflowAction.helper}</p>
              {row.primaryLead &&
              row.latestSentEmail?.status === "SENT" &&
              !isReplied ? (
                <MarkRepliedButton leadId={row.primaryLead.id} />
              ) : null}
              {row.primaryLead &&
              (row.primaryContact?.phone || row.company.contacts.some((contact) => contact.phone)) ? (
                <MarkCalledButton leadId={row.primaryLead.id} />
              ) : null}
              {row.latestSentEmail?.status === "SENT" ? (
                <Link
                  className="inline-flex text-xs font-medium text-blue-600 hover:text-blue-800"
                  href="/outreach-history"
                >
                  送信履歴を見る
                </Link>
              ) : null}
              {row.nextFollowUp ? (
                <p className="text-xs text-slate-500">
                  フォロー期限 {formatDate(row.nextFollowUp.dueDate)}
                </p>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            className="flex min-h-0 flex-1 flex-col"
            compact
            title="調査メモ"
          >
            <ResearchMemoEditor
              key={row.research?.id ?? "new"}
              companyId={row.company.id}
              compact
              initialSummary={row.research?.summary ?? ""}
            />
          </SectionCard>

          <SectionCard compact title="メール">
            {row.latestDraft ? (
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                <p className="text-xs font-medium text-emerald-800">
                  進行中の下書き
                </p>
                <p className="text-sm font-medium text-slate-950">
                  {row.latestDraft.subject}
                </p>
                <p className="whitespace-pre-line text-xs leading-5 text-slate-700">
                  {row.latestDraft.body}
                </p>
              </div>
            ) : row.latestSentEmail ? (
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                <p className="text-xs text-slate-500">
                  最終送信 {formatDate(row.latestSentEmail.sentAt)}
                </p>
                <p className="text-sm font-medium text-slate-950">
                  {row.latestSentEmail.subject}
                </p>
                {row.latestSentEmail.errorMessage ? (
                  <p className="text-xs text-rose-600">
                    {row.latestSentEmail.errorMessage}
                  </p>
                ) : null}
                <p className="whitespace-pre-line text-xs leading-5 text-slate-700">
                  {row.latestSentEmail.body}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
