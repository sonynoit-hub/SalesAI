"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ContactActivateButton({
  companyId,
  contactId,
}: {
  companyId: string;
  contactId: string;
}) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "activate",
          companyId,
          contactId,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "Could not set this contact as active.",
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not set this contact as active.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
        disabled={isWorking}
        onClick={handleClick}
        type="button"
      >
        {isWorking ? "設定中…" : "宛先に設定"}
      </button>
      {errorMessage ? (
        <p className="text-xs text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
