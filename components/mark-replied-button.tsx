"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MarkRepliedButtonProps = {
  leadId: string;
};

export function MarkRepliedButton({ leadId }: MarkRepliedButtonProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function markReplied() {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/reply`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "返信ありに更新できませんでした。再試行してください。",
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "返信ありに更新できませんでした。再試行してください。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-emerald-50 disabled:text-emerald-400"
        disabled={isWorking}
        onClick={markReplied}
        type="button"
      >
        {isWorking ? "更新中…" : "返信ありにする"}
      </button>
      {errorMessage ? (
        <p className="text-xs leading-5 text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
