"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { ContactActivateButton } from "@/components/contact-activate-button";

type ContactCardEditorProps = {
  companyId: string;
  contact: {
    id: string;
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
  };
  isActive: boolean;
};

export function ContactCardEditor({
  companyId,
  contact,
  isActive,
}: ContactCardEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(contact.name ?? "");
  const [title, setTitle] = useState(contact.title ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayName =
    [contact.name, contact.title].filter(Boolean).join(" · ") || "名前未設定";

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          companyId,
          contactId: contact.id,
          name,
          title,
          email,
          phone,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "担当者を更新できませんでした。",
        );
      }

      setIsEditing(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "担当者を更新できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (isEditing) {
    return (
      <form
        className={`space-y-2 rounded-md px-2.5 py-2 ${
          isActive
            ? "border border-emerald-200 bg-emerald-50"
            : "border border-slate-200 bg-white"
        }`}
        onSubmit={handleSave}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-700">氏名</span>
            <input
              className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="山田 太郎"
              value={name}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-700">役職</span>
            <input
              className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="営業部長"
              value={title}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-xs font-medium text-slate-700">メール</span>
          <input
            className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="taro@company.com"
            type="email"
            value={email}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-slate-700">電話番号</span>
          <input
            className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
            onChange={(event) => setPhone(event.currentTarget.value)}
            placeholder="03-1234-5678"
            value={phone}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isWorking}
            type="submit"
          >
            {isWorking ? "保存中…" : "保存"}
          </button>
          <button
            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
            disabled={isWorking}
            onClick={() => {
              setName(contact.name ?? "");
              setTitle(contact.title ?? "");
              setEmail(contact.email ?? "");
              setPhone(contact.phone ?? "");
              setIsEditing(false);
              setErrorMessage(null);
            }}
            type="button"
          >
            キャンセル
          </button>
        </div>
        {errorMessage ? (
          <p className="text-xs text-rose-600">{errorMessage}</p>
        ) : null}
      </form>
    );
  }

  return (
    <div
      className={`rounded-md px-2.5 py-2 ${
        isActive
          ? "border border-emerald-200 bg-emerald-50"
          : "border border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-slate-900">{displayName}</p>
            {isActive ? <Badge tone="emerald">使用中</Badge> : null}
          </div>
          {contact.email ? (
            <p className="mt-0.5 truncate text-xs text-slate-600">
              {contact.email}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-400">メール未設定</p>
          )}
          {contact.phone ? (
            <p className="mt-0.5 truncate text-xs text-slate-600">
              TEL: {contact.phone}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => {
              setName(contact.name ?? "");
              setTitle(contact.title ?? "");
              setEmail(contact.email ?? "");
              setPhone(contact.phone ?? "");
              setIsEditing(true);
              setErrorMessage(null);
            }}
            type="button"
          >
            編集
          </button>
          {!isActive && (contact.email || contact.phone) ? (
            <ContactActivateButton
              companyId={companyId}
              contactId={contact.id}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
