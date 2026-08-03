import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/ui";
import {
  getGmailConnectionSync,
  isGmailConfigured,
  isGmailConnected,
} from "@/lib/gmail/client";
import {
  getOutlookConnectionSync,
  isOutlookConfigured,
} from "@/lib/outlook/client";

type SettingsPageProps = {
  searchParams: Promise<{
    gmail?: string;
    outlook?: string;
  }>;
};

function getGmailNotice(gmailParam?: string) {
  switch (gmailParam) {
    case "connected":
      return "Gmail メールボックスを接続しました。";
    case "disconnected":
      return "Gmail メールボックスを切断しました。";
    case "missing-config":
      return ".env.local に Google Gmail アプリ認証情報を設定してください。";
    case "invalid-state":
      return "Gmail OAuth state を検証できませんでした。再接続してください。";
    case "access-denied":
      return "Google サインインがキャンセルされました。";
    case "connect-failed":
      return "Gmail 連携の完了に失敗しました。";
    default:
      return null;
  }
}

function getOutlookNotice(outlookParam?: string) {
  switch (outlookParam) {
    case "connected":
      return "Outlook メールボックスを接続しました。";
    case "disconnected":
      return "Outlook メールボックスを切断しました。";
    case "missing-config":
      return ".env.local に Microsoft Outlook アプリ認証情報を設定してください。";
    case "invalid-state":
      return "Outlook OAuth state を検証できませんでした。再接続してください。";
    case "access-denied":
      return "Microsoft サインインがキャンセルされました。";
    case "connect-failed":
      return "Outlook 連携の完了に失敗しました。";
    default:
      return null;
  }
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const gmailConfigured = isGmailConfigured();
  const gmailConnected = isGmailConnected();
  const gmailConnection = getGmailConnectionSync();
  const outlookConnection = getOutlookConnectionSync();
  const outlookConfigured = isOutlookConfigured();
  const gmailNotice = getGmailNotice(params.gmail);
  const outlookNotice = getOutlookNotice(params.outlook);

  return (
    <AppShell
      eyebrow="設定"
      title="メール連携"
      description="送信用メールボックス（Gmail / Outlook）を接続します。"
    >
      {gmailNotice ? (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {gmailNotice}
        </div>
      ) : null}

      {outlookNotice ? (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {outlookNotice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Gmail 連携">
          <div className="space-y-4 text-sm text-slate-600">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">
                {gmailConnected
                  ? gmailConnection?.email ?? "接続済み Gmail メールボックス"
                  : gmailConfigured
                    ? "Google OAuth 認証情報を検出"
                    : "Google OAuth 認証情報が未設定"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {gmailConnected
                  ? `接続日 ${new Date(gmailConnection?.connectedAt ?? "").toLocaleDateString("ja-JP", {
                      dateStyle: "medium",
                    })}`
                  : "OAuth 連携完了まで Gmail 送信は無効です。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {gmailConfigured ? (
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                  href="/api/gmail/connect"
                >
                  {gmailConnected ? "Gmail を再接続" : "Gmail を接続"}
                </a>
              ) : (
                <span className="inline-flex h-10 items-center justify-center rounded-md bg-slate-300 px-4 text-sm font-medium text-white">
                  Gmail を接続
                </span>
              )}
              {gmailConnected ? (
                <form action="/api/gmail/disconnect" method="post">
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    type="submit"
                  >
                    切断
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Outlook 連携">
          <div className="space-y-4 text-sm text-slate-600">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">
                {outlookConnection
                  ? outlookConnection.email ??
                    outlookConnection.displayName ??
                    "接続済みメールボックス"
                  : "Outlook メールボックス未接続"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {outlookConnection
                  ? `接続日 ${new Date(outlookConnection.connectedAt).toLocaleDateString("ja-JP", {
                      dateStyle: "medium",
                    })}`
                  : "ローカルトークンは work/outlook-account.json に保存されます。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {outlookConfigured ? (
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                  href="/api/outlook/connect"
                >
                  {outlookConnection ? "Outlook を再接続" : "Outlook を接続"}
                </a>
              ) : (
                <span className="inline-flex h-10 items-center justify-center rounded-md bg-slate-300 px-4 text-sm font-medium text-white">
                  Outlook を接続
                </span>
              )}
              {outlookConnection ? (
                <form action="/api/outlook/disconnect" method="post">
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    type="submit"
                  >
                    切断
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
