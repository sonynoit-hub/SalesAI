"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type LeadContactActivitySummary = {
  hasEmailContact: boolean;
  hasPhoneContact: boolean;
  hasEmailReply: boolean;
};

type LeadTrackingActionsProps = {
  leadId: string;
  contactActivity: LeadContactActivitySummary;
  disabled?: boolean;
  size?: "default" | "compact";
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

type ActionKey = "email" | "call" | "reply";

const actionConfig: Array<{
  key: ActionKey;
  label: string;
  doneLabel: string;
  endpoint: string;
  successMessage: string;
  errorMessage: string;
  isDone: (activity: LeadContactActivitySummary) => boolean;
  buttonClass: string;
  doneClass: string;
}> = [
  {
    key: "email",
    label: "メール",
    doneLabel: "メール済",
    endpoint: "email",
    successMessage: "メール送信を記録しました。",
    errorMessage: "メール送信記録の更新に失敗しました。",
    isDone: (activity) => activity.hasEmailContact,
    buttonClass:
      "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
    doneClass: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    key: "call",
    label: "架電",
    doneLabel: "架電済",
    endpoint: "call",
    successMessage: "架電を記録しました。",
    errorMessage: "架電記録の更新に失敗しました。",
    isDone: (activity) => activity.hasPhoneContact,
    buttonClass:
      "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
    doneClass: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    key: "reply",
    label: "返信",
    doneLabel: "返信あり",
    endpoint: "reply",
    successMessage: "返信ありを記録しました。",
    errorMessage: "返信ありへの更新に失敗しました。",
    isDone: (activity) => activity.hasEmailReply,
    buttonClass:
      "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
    doneClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
];

export function LeadTrackingActions({
  leadId,
  contactActivity,
  disabled = false,
  size = "default",
  onSuccess,
  onError,
}: LeadTrackingActionsProps) {
  const router = useRouter();
  const [workingAction, setWorkingAction] = useState<ActionKey | null>(null);

  async function runAction(
    action: ActionKey,
    endpoint: string,
    successMessage: string,
    errorMessage: string,
  ) {
    if (disabled || workingAction) return;

    setWorkingAction(action);
    try {
      const response = await fetch(`/api/leads/${leadId}/${endpoint}`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? errorMessage);
      }

      onSuccess?.(successMessage);
      router.refresh();
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : errorMessage,
      );
    } finally {
      setWorkingAction(null);
    }
  }

  const isBusy = disabled || workingAction !== null;
  const controlClass =
    size === "compact"
      ? "inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium"
      : "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium";

  return (
    <div className="flex flex-nowrap gap-0.5">
      {actionConfig.map((action) => {
        const done = action.isDone(contactActivity);

        if (done) {
          return (
            <span
              className={`${controlClass} ${action.doneClass}`}
              key={action.key}
            >
              {action.doneLabel}
            </span>
          );
        }

        return (
          <button
            className={`${controlClass} disabled:cursor-not-allowed disabled:opacity-50 ${action.buttonClass}`}
            disabled={isBusy}
            key={action.key}
            onClick={() =>
              void runAction(
                action.key,
                action.endpoint,
                action.successMessage,
                action.errorMessage,
              )
            }
            type="button"
          >
            {workingAction === action.key ? "…" : action.label}
          </button>
        );
      })}
    </div>
  );
}
