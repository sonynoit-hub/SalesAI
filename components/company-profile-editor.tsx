"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatIndustryJa } from "@/lib/industries";

type CompanyProfileEditorProps = {
  companyId: string;
  compact?: boolean;
  initial: {
    name: string;
    websiteUrl: string;
    industry: string;
    location: string;
    address: string;
    primaryEmail: string;
    contactFormUrl: string;
    description: string;
  };
};

export function CompanyProfileEditor({
  companyId,
  compact = false,
  initial,
}: CompanyProfileEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    ...initial,
    industry: formatIndustryJa(initial.industry),
  });
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "会社情報を更新できませんでした。",
        );
      }

      setIsEditing(false);
      setSuccessMessage("会社情報を保存しました。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "会社情報を更新できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (!isEditing) {
    return (
      <div className={compact ? "space-y-2" : "space-y-4"}>
        <dl className={`grid text-sm ${compact ? "gap-2" : "gap-3 sm:grid-cols-2"}`}>
          <InfoItem label="ウェブサイト">
            {form.websiteUrl ? (
              <a
                className="break-all text-emerald-700 hover:text-emerald-800"
                href={form.websiteUrl}
                rel="noreferrer"
                target="_blank"
              >
                {form.websiteUrl}
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </InfoItem>
          <div className="grid grid-cols-2 gap-2">
            <InfoItem label="業種">{formatIndustryJa(form.industry) || "—"}</InfoItem>
            <InfoItem label="所在地">{form.location || "—"}</InfoItem>
          </div>
          <InfoItem label="会社メール">{form.primaryEmail || "—"}</InfoItem>
          <InfoItem label="お問い合わせフォーム">
            {form.contactFormUrl ? (
              <a
                className="break-all text-emerald-700 hover:text-emerald-800"
                href={form.contactFormUrl}
                rel="noreferrer"
                target="_blank"
              >
                {form.contactFormUrl}
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </InfoItem>
          <InfoItem label="住所">{form.address || "—"}</InfoItem>
          <InfoItem label="概要">
            {form.description ? (
              <span className="whitespace-pre-line">{form.description}</span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </InfoItem>
        </dl>
        <button
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white"
          onClick={() => {
            setIsEditing(true);
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          type="button"
        >
          会社情報を編集
        </button>
        {successMessage ? (
          <p className="text-xs text-emerald-700">{successMessage}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form className="space-y-2" onSubmit={handleSave}>
      <Field
        label="会社名"
        onChange={(value) => setForm((current) => ({ ...current, name: value }))}
        required
        value={form.name}
      />
      <Field
        label="ウェブサイトURL"
        onChange={(value) =>
          setForm((current) => ({ ...current, websiteUrl: value }))
        }
        value={form.websiteUrl}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="業種"
          onChange={(value) =>
            setForm((current) => ({ ...current, industry: value }))
          }
          value={form.industry}
        />
        <Field
          label="所在地"
          onChange={(value) =>
            setForm((current) => ({ ...current, location: value }))
          }
          placeholder="都道府県"
          value={form.location}
        />
      </div>
      <Field
        label="住所"
        onChange={(value) =>
          setForm((current) => ({ ...current, address: value }))
        }
        placeholder="詳細住所"
        value={form.address}
      />
      <Field
        label="会社メール"
        onChange={(value) =>
          setForm((current) => ({ ...current, primaryEmail: value }))
        }
        type="email"
        value={form.primaryEmail}
      />
      <Field
        label="お問い合わせフォームURL"
        onChange={(value) =>
          setForm((current) => ({ ...current, contactFormUrl: value }))
        }
        placeholder="https://example.com/contact"
        value={form.contactFormUrl}
      />
      <label className="block text-sm">
        <span className="font-medium text-slate-700">概要</span>
        <textarea
          className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.currentTarget.value,
            }))
          }
          value={form.description}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isWorking}
          type="submit"
        >
          {isWorking ? "保存中…" : "保存"}
        </button>
        <button
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white"
          disabled={isWorking}
          onClick={() => {
            setForm(initial);
            setIsEditing(false);
            setErrorMessage(null);
          }}
          type="button"
        >
          キャンセル
        </button>
      </div>
      {errorMessage ? <p className="text-xs text-rose-700">{errorMessage}</p> : null}
    </form>
  );
}

function InfoItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
