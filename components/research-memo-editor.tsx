"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ResearchMemoEditorProps = {
  companyId: string;
  initialSummary: string;
  compact?: boolean;
};

export function ResearchMemoEditor({
  companyId,
  initialSummary,
  compact = false,
}: ResearchMemoEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWorking) return;

    const trimmed = summary.trim();
    if (!trimmed) {
      setErrorMessage("メモを入力してください。");
      return;
    }

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/company-research", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, summary: trimmed }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "メモを保存できませんでした。",
        );
      }

      setSummary(trimmed);
      setIsEditing(false);
      setSuccessMessage("メモを保存しました。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "メモを保存できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (!isEditing) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p
          className={`min-h-0 flex-1 overflow-y-auto whitespace-pre-line text-sm ${
            summary ? "leading-5 text-slate-700" : "text-slate-400"
          } ${compact ? "max-h-none" : ""}`}
        >
          {summary || "メモはまだありません。気になった点を手入力できます。"}
        </p>
        {successMessage ? (
          <p className="mt-2 text-xs text-emerald-700">{successMessage}</p>
        ) : null}
        <div className="mt-auto flex justify-end pt-3">
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white"
            onClick={() => {
              setIsEditing(true);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            type="button"
          >
            {summary ? "編集" : "メモを追加"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="flex h-full min-h-0 flex-col space-y-2" onSubmit={handleSave}>
      <label className="block min-h-0 flex-1 text-sm">
        <span className="text-xs font-medium text-slate-700">メモ</span>
        <textarea
          className={`mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 ${
            compact ? "h-[calc(100%-1.25rem)] min-h-24" : "min-h-36"
          }`}
          onChange={(event) => setSummary(event.currentTarget.value)}
          placeholder="商談のポイント、ヒアリング内容、次のアクションなどを記入"
          value={summary}
        />
      </label>
      <div className="mt-auto flex flex-wrap justify-end gap-2">
        <button
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white"
          disabled={isWorking}
          onClick={() => {
            setSummary(initialSummary);
            setIsEditing(false);
            setErrorMessage(null);
          }}
          type="button"
        >
          キャンセル
        </button>
        <button
          className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isWorking}
          type="submit"
        >
          {isWorking ? "保存中…" : "保存"}
        </button>
      </div>
      {errorMessage ? <p className="text-xs text-rose-700">{errorMessage}</p> : null}
    </form>
  );
}
