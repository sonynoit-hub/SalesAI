"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MarkCalledButtonProps = {
  leadId: string;
};

export function MarkCalledButton({ leadId }: MarkCalledButtonProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function markCalled() {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/call`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "架電記録を更新できませんでした。再試行してください。",
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "架電記録を更新できませんでした。再試行してください。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        className="inline-flex h-9 items-center justify-center rounded-md border border-sky-300 bg-sky-50 px-3 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:bg-sky-50 disabled:text-sky-400"
        disabled={isWorking}
        onClick={markCalled}
        type="button"
      >
        {isWorking ? "更新中…" : "架電済みにする"}
      </button>
      {errorMessage ? (
        <p className="text-xs leading-5 text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
