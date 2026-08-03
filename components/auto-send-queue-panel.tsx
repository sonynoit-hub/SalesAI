"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, statusTone } from "@/components/ui";

type AutoSendQueuePanelProps = {
  items: Array<{
    id: string;
    companyName: string;
    recipientEmail: string;
    subject: string;
    provider: string;
    status: string;
    delayMinutes: number;
    nextSendAt: string;
    lastError: string | null;
  }>;
};

const providerLabel: Record<string, string> = {
  manual: "手動",
  gmail: "Gmail",
  outlook: "Outlook",
};

const queueStatusLabel: Record<string, string> = {
  queued: "待機中",
  paused: "一時停止",
  sending: "送信中",
  sent: "送信済み",
  failed: "失敗",
};

function toProviderLabel(provider: string) {
  return providerLabel[provider] ?? provider;
}

function toQueueStatusLabel(status: string) {
  return queueStatusLabel[status] ?? status;
}

export function AutoSendQueuePanel({ items }: AutoSendQueuePanelProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function runDueItems() {
    if (isWorking) return;

    setIsWorking(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auto-send", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "run_due",
          limit: 10,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "自動送信キューの処理に失敗しました。",
        );
      }

      const resultCount = Array.isArray(payload.data) ? payload.data.length : 0;
      setMessage(
        resultCount > 0
          ? `${resultCount}件の期限到達キューを処理しました。`
          : "実行対象のキューはありません。",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "自動送信キューの処理に失敗しました。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function updateItem(itemId: string, action: "pause" | "resume" | "remove") {
    if (isWorking) return;

    setIsWorking(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/auto-send/${itemId}`, {
        method: action === "remove" ? "DELETE" : "PATCH",
        headers:
          action === "remove"
            ? undefined
            : {
                "content-type": "application/json",
              },
        body: action === "remove" ? undefined : JSON.stringify({ action }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "キュー更新に失敗しました。");
      }

      setMessage(
        action === "pause"
          ? "キューを一時停止しました。"
          : action === "resume"
            ? "キューを再開しました。"
            : "キューを削除しました。",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "キュー更新に失敗しました。");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          承認済み下書きを遅延送信キューに入れ、ここから期限到達分を実行できます。
        </div>
        <button
          className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isWorking}
          onClick={runDueItems}
          type="button"
        >
          {isWorking ? "処理中…" : "期限到達分を実行"}
        </button>
      </div>

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">会社</th>
                <th className="px-4 py-3 font-semibold">宛先</th>
                <th className="px-4 py-3 font-semibold">状態</th>
                <th className="px-4 py-3 font-semibold">次回送信</th>
                <th className="px-4 py-3 font-semibold">遅延</th>
                <th className="px-4 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-950">{item.companyName}</p>
                    <p className="mt-1 max-w-72 text-xs text-slate-500">{item.subject}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p>{item.recipientEmail}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {toProviderLabel(item.provider)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <Badge tone={statusTone(item.status)}>
                      {toQueueStatusLabel(item.status)}
                    </Badge>
                    {item.lastError ? (
                      <p className="mt-2 max-w-56 text-xs leading-5 text-rose-600">
                        {item.lastError}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {formatDateTime(item.nextSendAt)}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{item.delayMinutes}分</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {item.status === "queued" ? (
                        <button
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
                          disabled={isWorking}
                          onClick={() => updateItem(item.id, "pause")}
                          type="button"
                        >
                          一時停止
                        </button>
                      ) : null}
                      {["paused", "failed"].includes(item.status) ? (
                        <button
                          className="inline-flex h-8 items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:bg-sky-50"
                          disabled={isWorking}
                          onClick={() => updateItem(item.id, "resume")}
                          type="button"
                        >
                          再開
                        </button>
                      ) : null}
                      {item.status !== "sending" ? (
                        <button
                          className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-rose-50"
                          disabled={isWorking}
                          onClick={() => updateItem(item.id, "remove")}
                          type="button"
                        >
                          削除
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">自動送信キューはまだありません。</p>
      )}

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
