"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ManualContactForm({
  companyId,
  defaultSourceUrl,
  compact = false,
}: {
  companyId: string;
  defaultSourceUrl?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceUrl, setSourceUrl] = useState(defaultSourceUrl ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyId,
          name,
          title,
          email,
          phone,
          sourceUrl,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "担当者を保存できませんでした。",
        );
      }

      setName("");
      setTitle("");
      setEmail("");
      setPhone("");
      setSuccessMessage(
        payload?.data?.activated
          ? "担当者を保存し、宛先に設定しました。"
          : "担当者を保存しました。一覧から宛先に切り替えられます。",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "担当者を保存できませんでした。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className={compact ? "space-y-2" : "space-y-3"}
      onSubmit={handleSubmit}
    >
      <div className={compact ? "grid grid-cols-2 gap-2" : "space-y-3"}>
        <label className="block text-sm">
          <span className="text-xs font-medium text-slate-700">氏名</span>
          <input
            className={`mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 ${
              compact ? "h-8" : "h-10 px-3"
            }`}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="山田 太郎"
            value={name}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-slate-700">役職</span>
          <input
            className={`mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 ${
              compact ? "h-8" : "h-10 px-3"
            }`}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="営業部長"
            value={title}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-700">メール</span>
        <input
          className={`mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 ${
            compact ? "h-8" : "h-10 px-3"
          }`}
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="taro@company.com"
          type="email"
          value={email}
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-700">電話番号</span>
        <input
          className={`mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 ${
            compact ? "h-8" : "h-10 px-3"
          }`}
          onChange={(event) => setPhone(event.currentTarget.value)}
          placeholder="03-1234-5678"
          value={phone}
        />
      </label>
      {!compact ? (
        <label className="block text-sm">
          <span className="text-xs font-medium text-slate-700">出典URL</span>
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            onChange={(event) => setSourceUrl(event.currentTarget.value)}
            placeholder="https://company.com/team"
            value={sourceUrl}
          />
        </label>
      ) : null}
      <button
        className={`inline-flex w-full items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 ${
          compact ? "h-9" : "h-10"
        }`}
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "保存中…" : "担当者を追加"}
      </button>
      {errorMessage ? (
        <p className="text-xs text-rose-600">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="text-xs text-emerald-700">{successMessage}</p>
      ) : null}
    </form>
  );
}
