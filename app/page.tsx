import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import {
  formatDate,
  getDatabaseErrorMessage,
  getDashboardData,
  statusLabel,
} from "@/lib/db/sales-workflow";
import { formatIndustryJa } from "@/lib/industries";

export const dynamic = "force-dynamic";

function getWorkflowStatus(row: Awaited<ReturnType<typeof getDashboardData>>["rows"][number]) {
  if (row.nextFollowUp) return "follow-up due";
  if (row.latestDraft?.status === "APPROVED") return "approved";
  if (row.latestDraft) return "draft ready";
  if (row.latestSentEmail?.status === "SENT") return "can follow-up";
  if (row.outreachEmail) return "needs draft";
  return "contact ready";
}

function workflowStatusJa(status: string) {
  const map: Record<string, string> = {
    "follow-up due": "フォロー対応",
    "can follow-up": "再送可能",
    approved: "承認済み",
    "draft ready": "下書きあり",
    "needs draft": "下書き作成待ち",
    "contact ready": "担当者追加",
  };
  return map[status] ?? status;
}

export default async function Home() {
  let dashboardData: Awaited<ReturnType<typeof getDashboardData>>;

  try {
    dashboardData = await getDashboardData();
  } catch (error) {
    const databaseErrorMessage = getDatabaseErrorMessage(error);

    if (!databaseErrorMessage) {
      throw error;
    }

    return <DatabaseUnavailable message={databaseErrorMessage} />;
  }

  const { rows, stats } = dashboardData;
  const priorityRows = rows
    .filter((row) => row.primaryLead)
    .sort((a, b) => b.company.updatedAt.getTime() - a.company.updatedAt.getTime())
    .slice(0, 3);
  const followUpRows = rows.filter((row) => row.nextFollowUp).slice(0, 4);

  return (
    <AppShell
      eyebrow="ダッシュボード"
      title="営業ワークフロー"
      description="SalesAI の主要な進捗をまとめて確認できます。"
      action={{ label: "リード一覧へ", href: "/leads" }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          helper="登録済み会社数"
          label="会社"
          value={stats.companyCount}
        />
        <MetricCard
          helper="営業対象リード"
          label="リード"
          value={stats.leadCount}
        />
        <MetricCard
          helper="作成済み/承認済み"
          label="下書き"
          value={stats.draftCount}
        />
        <MetricCard
          helper="未完了フォロー"
          label="フォロー"
          value={stats.openFollowUpCount}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <SectionCard title="注目会社">
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">会社</th>
                  <th className="px-4 py-3 font-semibold">状態</th>
                  <th className="px-4 py-3 font-semibold">次アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {priorityRows.map((row) => (
                  <tr key={row.company.id}>
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-slate-950 hover:text-emerald-700"
                        href={`/companies/${row.company.id}`}
                      >
                        {row.company.name || "未命名の会社"}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {formatIndustryJa(row.company.industry) || "業種未設定"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(getWorkflowStatus(row).toLowerCase())}>
                        {workflowStatusJa(getWorkflowStatus(row))}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.nextFollowUp
                        ? `フォロー ${formatDate(row.nextFollowUp.dueDate)}`
                        : row.latestDraft
                          ? "下書き確認"
                          : row.latestSentEmail?.status === "SENT"
                            ? "フォローメール作成"
                            : !row.outreachEmail
                              ? "担当者追加"
                              : "下書き作成"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link
            className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href="/leads"
          >
            リード一覧を見る
          </Link>
        </SectionCard>

        <SectionCard title="フォローキュー">
          <div className="space-y-3">
            {followUpRows.length > 0 ? (
              followUpRows.map((row) => (
                <div
                  className="rounded-md border border-slate-200 px-4 py-3"
                  key={row.nextFollowUp?.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-950">
                        {row.nextFollowUp?.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.company.name || "未命名の会社"} ・期限{" "}
                        {formatDate(row.nextFollowUp?.dueDate)}
                      </p>
                    </div>
                    <Badge tone={statusTone(statusLabel(row.nextFollowUp?.status))}>
                      {statusLabel(row.nextFollowUp?.status)}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">未対応のフォローはありません。</p>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
