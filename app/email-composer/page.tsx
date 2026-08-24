import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { DraftReviewCard } from "@/components/draft-review-card";
import { SectionCard } from "@/components/ui";
import { safeGetCompanyQueueRows } from "@/lib/db/sales-workflow";
import { getDeliveryOptions } from "@/lib/outreach/send-email";

export const dynamic = "force-dynamic";

export default async function EmailComposerPage() {
  const loaded = await safeGetCompanyQueueRows();
  if (!loaded.ok) {
    return <DatabaseUnavailable eyebrow="メール承認" message={loaded.message} />;
  }

  const rows = loaded.rows;
  const deliveryOptions = getDeliveryOptions();
  const draftRows = rows.filter((row) => row.latestDraft);

  return (
    <AppShell
      eyebrow="メール承認"
      title="下書きレビュー"
      description="会社ごとの下書きを確認・編集して、承認後に送信します。"
    >
      <div className="space-y-3">
        {draftRows.length > 0 ? (
          draftRows.map((row) => {
            const draft = row.latestDraft;
            if (!draft) return null;

            return (
              <SectionCard key={draft.id} title={draft.subject}>
                <DraftReviewCard
                  companyName={row.company.name || "未命名の会社"}
                  draft={{
                    id: draft.id,
                    subject: draft.subject,
                    body: draft.body,
                    status: draft.status,
                    tone: draft.tone,
                    language: draft.language,
                  }}
                  outreachEmail={row.outreachEmail ?? null}
                  deliveryOptions={deliveryOptions}
                />
                <Link
                  className="mt-2 inline-flex text-sm font-medium text-blue-600 hover:text-blue-800"
                  href={
                    row.primaryLead
                      ? `/leads?lead=${row.primaryLead.id}`
                      : `/leads?company=${row.company.id}`
                  }
                >
                  CRMで会社を開く
                </Link>
              </SectionCard>
            );
          })
        ) : (
          <SectionCard title="下書きなし">
            <p className="text-sm text-slate-600">
              メール下書きはまだありません。リードCRMで会社を選び、必要な情報を確認してください。
            </p>
            <Link
              className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:text-blue-800"
              href="/leads"
            >
              リード一覧へ
            </Link>
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}
