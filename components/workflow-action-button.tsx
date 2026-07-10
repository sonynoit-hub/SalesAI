"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type WorkflowActionButtonProps = {
  companyId: string;
  endpoint: "/api/company-research" | "/api/email-drafts";
  label: string;
};

export function WorkflowActionButton({
  companyId,
  endpoint,
  label,
}: WorkflowActionButtonProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ companyId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "Could not complete this action.",
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not complete this action.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        className="inline-flex h-9 w-full items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={isWorking}
        onClick={handleClick}
        type="button"
      >
        {isWorking ? "Working..." : label}
      </button>
      {errorMessage ? (
        <p className="text-xs leading-5 text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
