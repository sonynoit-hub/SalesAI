import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { FollowUpActionButtons } from "@/components/follow-up-action-buttons";
import { MarkCalledButton } from "@/components/mark-called-button";
import { MarkRepliedButton } from "@/components/mark-replied-button";
import { Badge, MetricCard, SectionCard, statusTone } from "@/components/ui";
import { prisma } from "@/lib/db/prisma";
import { FollowUpStatus } from "@/lib/generated/prisma/client";
import {
  formatDate,
  formatDateTime,
  getDatabaseErrorMessage,
} from "@/lib/db/sales-workflow";
import { getLatestContactEventsByLeadIds } from "@/lib/leads/contact-events";
import { deriveLeadContactActivity } from "@/lib/leads/contact-activity";

export const dynamic = "force-dynamic";

function followUpStatusJa(value: FollowUpStatus) {
  if (value === "OPEN") return "未対応";
  if (value === "DONE") return "完了";
  return "キャンセル";
}

async function loadFollowUpData() {
  try {
    const [tasks, sentEmailCount, notContactedCount] = await Promise.all([
      prisma.followUpTask.findMany({
        where: { status: FollowUpStatus.OPEN },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        include: {
          lead: {
            include: {
              company: true,
              contact: true,
              sentEmails: {
                orderBy: { sentAt: "desc" },
                take: 1,
              },
            },
          },
          sentEmail: true,
        },
      }),
      prisma.sentEmail.count({ where: { status: "SENT" } }),
      prisma.lead.count({
        where: {
          sentEmails: {
            none: {
              status: "SENT",
            },
          },
        },
      }),
    ]);
    const leadIds = tasks.map((task) => task.lead.id);
    const eventMap = await getLatestContactEventsByLeadIds(leadIds);

    return {
      ok: true as const,
      tasks,
      eventMap,
      sentEmailCount,
      notContactedCount,
      overdueCount: tasks.filter(
        (task) => task.dueDate.getTime() < new Date().getTime(),
      ).length,
    };
  } catch (error) {
    const message = getDatabaseErrorMessage(error);
    if (!message) {
      throw error;
    }
    return { ok: false as const, message };
  }
}

export default async function FollowUpsPage() {
  const loaded = await loadFollowUpData();
  if (!loaded.ok) {
    return <DatabaseUnavailable eyebrow="日次キュー" message={loaded.message} />;
  }

  const { tasks, eventMap, sentEmailCount, notContactedCount, overdueCount } = loaded;

  return (
    <AppShell
      eyebrow="日次キュー"
      title="フォローアップ"
      description="対応が必要なフォロータスクを期限順に処理します。"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          helper="未完了のフォロータスク"
          label="未対応"
          value={tasks.length}
        />
        <MetricCard
          helper="期限を過ぎたタスク"
          label="期限超過"
          value={overdueCount}
        />
        <MetricCard
          helper="送信済みメール/未送信リード"
          label="送信状況"
          value={`${sentEmailCount} / ${notContactedCount}`}
        />
      </div>

      <div className="mt-4">
        <SectionCard title="対応キュー">
          <div className="grid gap-3">
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const latestEmail = task.lead.sentEmails[0] ?? null;
                const contactName = task.lead.contact?.name;
                const contactActivity = deriveLeadContactActivity({
                  tags: task.lead.tags,
                  events: eventMap.get(task.lead.id) ?? null,
                });

                return (
                  <div
                    className="rounded-md border border-slate-200 p-4"
                    key={task.id}
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_180px_190px] lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-950">{task.title}</p>
                          <Badge tone={statusTone(task.status.toLowerCase())}>
                            {followUpStatusJa(task.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {task.lead.company.name || "未命名の会社"} ・{" "}
                          {contactName ?? "会社窓口"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {contactActivity.hasEmailContact ? (
                            <Badge tone="sky">メール送信</Badge>
                          ) : null}
                          {contactActivity.hasPhoneContact ? (
                            <Badge tone="sky">架電済み</Badge>
                          ) : null}
                          {contactActivity.hasEmailReply ? (
                            <Badge tone="emerald">メール返信あり</Badge>
                          ) : null}
                        </div>
                        {(contactActivity.emailContactedAt ||
                          contactActivity.phoneContactedAt ||
                          contactActivity.emailRepliedAt) ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {[
                              contactActivity.emailContactedAt
                                ? `メール送信 ${formatDateTime(contactActivity.emailContactedAt)}`
                                : null,
                              contactActivity.phoneContactedAt
                                ? `架電 ${formatDateTime(contactActivity.phoneContactedAt)}`
                                : null,
                              contactActivity.emailRepliedAt
                                ? `返信受信 ${formatDateTime(contactActivity.emailRepliedAt)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" / ")}
                          </p>
                        ) : null}
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                          {task.notes ??
                            latestEmail?.subject ??
                            task.lead.notes ??
                            "対応内容を確認して次の連絡を実施してください。"}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <p className="text-slate-500">期限</p>
                        <p className="mt-1 font-medium text-slate-950">
                          {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <FollowUpActionButtons taskId={task.id} />
                        {task.lead.contact?.phone ? (
                          <MarkCalledButton leadId={task.lead.id} />
                        ) : null}
                        {task.lead.status !== "REPLIED" ? (
                          <MarkRepliedButton leadId={task.lead.id} />
                        ) : null}
                        <Link
                          className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
                          href={`/companies/${task.lead.company.id}`}
                        >
                          会社詳細を開く
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">未対応のフォロータスクはありません。</p>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
