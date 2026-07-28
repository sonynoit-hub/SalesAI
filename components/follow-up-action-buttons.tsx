"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FollowUpActionButtonsProps = {
  taskId: string;
};

export function FollowUpActionButtons({
  taskId,
}: FollowUpActionButtonsProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function updateTask(action: "done" | "skip" | "reschedule") {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/follow-ups/${taskId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ??
            "フォロータスクを更新できませんでした。再試行してください。",
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "フォロータスクを更新できませんでした。再試行してください。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        <button
          className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          disabled={isWorking}
          onClick={() => updateTask("done")}
          type="button"
        >
          完了
        </button>
        <button
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
          disabled={isWorking}
          onClick={() => updateTask("reschedule")}
          type="button"
        >
          7日後に再設定
        </button>
        <button
          className="inline-flex h-9 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-rose-50"
          disabled={isWorking}
          onClick={() => updateTask("skip")}
          type="button"
        >
          スキップ
        </button>
      </div>
      {errorMessage ? (
        <p className="text-xs leading-5 text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
