"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, statusTone } from "@/components/ui";

type DraftReviewCardProps = {
  draft: {
    id: string;
    subject: string;
    body: string;
    status: string;
    tone: string;
    language: string;
  };
  companyName: string;
  outreachEmail: string | null;
  deliveryOptions: Array<{
    id: string;
    label: string;
    description: string;
    available: boolean;
  }>;
};

const draftStatusLabel: Record<string, string> = {
  draft: "下書き",
  approved: "承認済み",
  discarded: "破棄",
  sent: "送信済み",
};

function toStatusLabel(status: string) {
  return draftStatusLabel[status] ?? status;
}

export function DraftReviewCard({
  draft,
  companyName,
  outreachEmail,
  deliveryOptions,
}: DraftReviewCardProps) {
  const router = useRouter();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [status, setStatus] = useState(draft.status.toLowerCase());
  const [provider, setProvider] = useState(
    deliveryOptions.find((option) => option.available)?.id ??
      deliveryOptions[0]?.id ??
      "manual",
  );
  const [delayMinutes, setDelayMinutes] = useState("15");
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const selectedProvider =
    deliveryOptions.find((option) => option.id === provider) ?? null;
  const isApproved = status === "approved";
  const isSent = status === "sent";
  const isDiscarded = status === "discarded";
  const isLocked = isSent || isDiscarded;
  const canEditDraft = !isWorking && !isLocked;
  const hasRecipient = Boolean(outreachEmail);
  const hasProvider = Boolean(selectedProvider?.available);
  const canSendNow =
    !isWorking && !isLocked && hasRecipient && isApproved && hasProvider;
  const canQueue =
    canSendNow && selectedProvider?.id !== "manual";

  function sendBlockedReason() {
    if (isSent) return "この下書きは送信済みです。再送する場合は新しい下書きを作成してください。";
    if (isDiscarded) return "この下書きは破棄済みです。送信するには下書きを再作成してください。";
    if (!isApproved) return "送信するには先に「承認」が必要です。";
    if (!hasRecipient) return "宛先メールが未設定です。会社詳細で担当者を設定してください。";
    if (!hasProvider) return "利用可能な送信方法がありません。設定画面でメール連携してください。";
    return null;
  }

  async function patchDraft(nextStatus?: "DRAFT" | "APPROVED" | "DISCARDED") {
    const response = await fetch(`/api/email-drafts/${draft.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body,
        status: nextStatus,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? "下書きを更新できませんでした。");
    }

    setSubject(payload.data.subject);
    setBody(payload.data.body);
    setStatus(payload.data.status.toLowerCase());

    return payload.data as {
      subject: string;
      body: string;
      status: string;
    };
  }

  async function updateDraft(nextStatus?: "DRAFT" | "APPROVED" | "DISCARDED") {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await patchDraft(nextStatus);
      setSuccessMessage(
        nextStatus === "APPROVED"
          ? "下書きを承認しました。"
          : nextStatus === "DISCARDED"
            ? "下書きを破棄しました。"
            : "下書きを保存しました。",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "下書きを更新できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function markSent() {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await patchDraft();

      const response = await fetch("/api/sent-emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          draftId: draft.id,
          provider,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ??
            payload?.data?.delivery?.errorMessage ??
            payload?.data?.errorMessage ??
            "メール送信に失敗しました。",
        );
      }

      setStatus("sent");
      setSuccessMessage("送信して履歴を記録しました。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "メール送信に失敗しました。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function queueAutoSend() {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await patchDraft();

      const response = await fetch("/api/auto-send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          draftId: draft.id,
          provider,
          delayMinutes: Number(delayMinutes),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "自動送信キューへの追加に失敗しました。",
        );
      }

      setSuccessMessage(
        `${delayMinutes}分後に自動送信するキューへ追加しました。`,
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "自動送信キューへの追加に失敗しました。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-3 py-1.5">
        <p className="text-sm font-medium text-slate-700">新規メッセージ</p>
        <Badge tone={statusTone(status)}>{toStatusLabel(status)}</Badge>
      </div>

      <div className="space-y-0">
        <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2 text-sm">
          <span className="w-10 shrink-0 text-slate-500">宛先</span>
          <span className="truncate text-slate-800">
            {outreachEmail ?? `${companyName}（メール未設定）`}
          </span>
        </div>
        <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2 text-sm">
          <span className="w-10 shrink-0 text-slate-500">件名</span>
          <input
            className="w-full border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            disabled={!canEditDraft}
            onChange={(event) => setSubject(event.currentTarget.value)}
            value={subject}
          />
        </div>
        <textarea
          className="min-h-52 w-full resize-y border-0 px-3 py-2 text-sm leading-6 text-slate-800 outline-none"
          disabled={!canEditDraft}
          onChange={(event) => setBody(event.currentTarget.value)}
          value={body}
        />
      </div>

      <div className="border-t border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              className="inline-flex h-9 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-600/40 disabled:text-white"
              disabled={!canSendNow}
              onClick={markSent}
              type="button"
            >
              送信
            </button>

            <button
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!canEditDraft}
              onClick={() => updateDraft("DRAFT")}
              type="button"
            >
              保存
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-800/40 disabled:text-white"
              disabled={!canEditDraft}
              onClick={() => updateDraft("APPROVED")}
              type="button"
            >
              承認
            </button>
          </div>
          <button
            className="ml-auto inline-flex h-9 shrink-0 items-center justify-center rounded-md px-2 text-sm font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-rose-300"
            disabled={!canEditDraft}
            onClick={() => updateDraft("DISCARDED")}
            type="button"
          >
            破棄
          </button>
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">送信方法</span>
            <select
              className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"
              disabled={isLocked}
              onChange={(event) => setProvider(event.currentTarget.value)}
              value={provider}
            >
              {deliveryOptions.map((option) => (
                <option disabled={!option.available} key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {selectedProvider?.id === "manual" ? (
            <div className="block">
              <span className="text-xs font-medium text-slate-500">自動送信遅延</span>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                手動送信では遅延キューは使えません。
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-slate-500">自動送信遅延</span>
              <div className="mt-1 flex items-center gap-2">
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"
                  disabled={isLocked}
                  onChange={(event) => setDelayMinutes(event.currentTarget.value)}
                  value={delayMinutes}
                >
                  {["5", "10", "15", "30", "60"].map((value) => (
                    <option key={value} value={value}>
                      {value}分
                    </option>
                  ))}
                </select>
                <button
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  disabled={!canQueue}
                  onClick={queueAutoSend}
                  type="button"
                >
                  キューに入れる
                </button>
              </div>
            </label>
          )}
        </div>
        {selectedProvider ? (
          <p className="mt-1.5 text-xs leading-5 text-slate-500 lg:whitespace-nowrap">
            {selectedProvider.description}
          </p>
        ) : null}
        {!canSendNow ? (
          <p className="mt-1 text-xs text-amber-700">
            {sendBlockedReason()}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mt-2 text-sm text-emerald-700">{successMessage}</p>
        ) : null}
        {errorMessage ? (
          <p className="mt-2 text-sm text-rose-600">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
