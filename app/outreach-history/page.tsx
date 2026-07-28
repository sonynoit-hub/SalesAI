import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import {
  formatDate,
  getDatabaseErrorMessage,
} from "@/lib/db/sales-workflow";
import { prisma } from "@/lib/db/prisma";
import { getLatestContactEventsByLeadIds } from "@/lib/leads/contact-events";
import { deriveLeadContactActivity } from "@/lib/leads/contact-activity";

export const dynamic = "force-dynamic";

function sentStatusJa(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === "SENT") return "送信済み";
  if (normalized === "FAILED") return "失敗";
  return normalized;
}

async function loadOutreachHistoryData() {
  try {
    const [emails, approvedCount, followUpCount] = await Promise.all([
      prisma.sentEmail.findMany({
        orderBy: { sentAt: "desc" },
        include: {
          lead: {
            include: {
              company: true,
            },
          },
        },
      }),
      prisma.emailDraft.count({ where: { status: "APPROVED" } }),
      prisma.followUpTask.count({ where: { status: "OPEN" } }),
    ]);

    return {
      ok: true as const,
      emails,
      approvedCount,
      followUpCount,
    };
  } catch (error) {
    const message = getDatabaseErrorMessage(error);
    if (!message) {
      throw error;
    }
    return { ok: false as const, message };
  }
}

export default async function OutreachHistoryPage() {
  const loaded = await loadOutreachHistoryData();
  if (!loaded.ok) {
    return <DatabaseUnavailable eyebrow="送信履歴" message={loaded.message} />;
  }

  const { emails, approvedCount, followUpCount } = loaded;
  const sentRows = emails.filter((email) => email.status === "SENT");
  const failedRows = emails.filter((email) => email.status === "FAILED");
  const leadIds = Array.from(new Set(emails.map((email) => email.leadId)));
  const eventMap = await getLatestContactEventsByLeadIds(leadIds);

  return (
    <AppShell
      eyebrow="送信履歴"
      title="アウトリーチ履歴"
      description="アプリからの送信結果に加え、手動記録した外部送信もここに残ります。"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          helper="送信成功レコード"
          label="送信済み"
          value={sentRows.length}
        />
        <MetricCard
          helper="見直しが必要な送信失敗"
          label="失敗"
          value={failedRows.length}
        />
        <MetricCard
          helper="送信待ちの承認済み下書き"
          label="承認済み"
          value={approvedCount}
        />
        <MetricCard
          helper="オープン中フォロータスク"
          label="フォロー"
          value={followUpCount}
        />
      </div>

      <div className="mt-4">
        <SectionCard title="メールタイムライン">
          {emails.length === 0 ? (
            <p className="text-sm text-slate-500">送信履歴はまだありません。</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">メール</th>
                    <th className="w-28 px-4 py-3 font-semibold">送信日</th>
                    <th className="w-28 whitespace-nowrap px-4 py-3 font-semibold">
                      状態
                    </th>
                    <th className="w-20 px-4 py-3 font-semibold">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {emails.map((email) => {
                    const companyName =
                      email.lead.company.name || "未命名の会社";
                    const companyHref = `/companies/${email.lead.company.id}`;
                    const contactActivity = deriveLeadContactActivity({
                      tags: email.lead.tags,
                      events: eventMap.get(email.leadId) ?? null,
                    });
                    const contactLabel = contactActivity.hasPhoneContact
                      ? "架電済み"
                      : contactActivity.hasEmailContact
                        ? "メール送信"
                        : null;

                    return (
                      <tr key={email.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <Link
                            className="font-medium text-slate-950 hover:text-emerald-700"
                            href={companyHref}
                          >
                            {companyName}
                          </Link>
                          <p className="mt-0.5 line-clamp-2 text-sm text-slate-700">
                            {email.subject}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {email.toEmail}
                          </p>
                          {email.errorMessage ? (
                            <p className="mt-1 max-w-xl text-xs leading-5 text-rose-600">
                              {email.errorMessage}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatDate(email.sentAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge tone={statusTone(email.status.toLowerCase())}>
                            {sentStatusJa(email.status)}
                          </Badge>
                          {contactLabel ? (
                            <p
                              className="mt-1 inline-flex h-7 items-center whitespace-nowrap rounded-md border border-sky-200 bg-sky-50 px-2 text-xs font-medium text-sky-700"
                            >
                              {contactLabel}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                            href={companyHref}
                          >
                            詳細
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
