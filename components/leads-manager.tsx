"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LeadsExcelImport } from "@/components/leads-excel-import";
import type { LeadContactActivitySummary } from "@/components/lead-tracking-actions";
import { formatIndustryJa } from "@/lib/industries";
import {
  LEAD_PRIORITY_OPTIONS,
  LEAD_STATUS_OPTIONS,
} from "@/lib/leads/constants";
import {
  leadStatusLabelJa,
  nextQualifiedMarkStatus,
  priorityLabelJa,
  qualifyMarkLabel,
  resolveQualifyMark,
} from "@/lib/leads/status";
import type { LeadCrmFilters, LeadCrmPagination } from "@/lib/db/sales-workflow";

export type LeadManageRow = {
  leadId: string;
  companyId: string;
  companyName: string;
  websiteUrl: string;
  industry: string;
  location: string;
  address: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  contactFormUrl: string;
  hasOutreachChannel: boolean;
  status: string;
  progressStatus: string;
  priority: string;
  notes: string;
  contactActivity: LeadContactActivitySummary;
  progressAtLabel: string;
};

type LeadFormState = {
  companyName: string;
  websiteUrl: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  industry: string;
  location: string;
  address: string;
  status: string;
  priority: string;
  notes: string;
};

const emptyForm: LeadFormState = {
  companyName: "",
  websiteUrl: "",
  contactName: "",
  contactTitle: "",
  email: "",
  phone: "",
  industry: "",
  location: "",
  address: "",
  status: "NEW",
  priority: "MEDIUM",
  notes: "",
};

type ScopedLocalValues<T> = {
  scopeKey: string;
  values: Record<string, T>;
};

function rowToForm(row: LeadManageRow): LeadFormState {
  return {
    companyName: row.companyName,
    websiteUrl: row.websiteUrl,
    contactName: row.contactName,
    contactTitle: row.contactTitle,
    email: row.email,
    phone: row.phone,
    industry: formatIndustryJa(row.industry),
    location: row.location,
    address: row.address,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
  };
}

export function LeadsManager({
  rows,
  filters,
  locationOptions,
  pagination,
}: {
  rows: LeadManageRow[];
  filters: LeadCrmFilters;
  locationOptions: string[];
  pagination: LeadCrmPagination;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [inputPanel, setInputPanel] = useState<"create" | "import" | null>(null);
  const [createForm, setCreateForm] = useState<LeadFormState>(emptyForm);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const overrideScopeKey = [
    filters.qualify,
    filters.progress,
    filters.location,
    pagination.page,
  ].join("|");
  const [localStatusState, setLocalStatusState] = useState<
    ScopedLocalValues<string>
  >({ scopeKey: "", values: {} });
  const [localContactState, setLocalContactState] = useState<
    ScopedLocalValues<LeadContactActivitySummary>
  >({ scopeKey: "", values: {} });
  const [workingStatusLeadId, setWorkingStatusLeadId] = useState<string | null>(
    null,
  );
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{
    done: number;
    total: number;
    found: number;
  } | null>(null);

  const localStatusByLeadId = useMemo(
    () =>
      localStatusState.scopeKey === overrideScopeKey
        ? localStatusState.values
        : {},
    [localStatusState, overrideScopeKey],
  );
  const localContactByLeadId = useMemo(
    () =>
      localContactState.scopeKey === overrideScopeKey
        ? localContactState.values
        : {},
    [localContactState, overrideScopeKey],
  );

  const displayRows = useMemo(() => {
    return rows.map((row) => {
      const localStatus = localStatusByLeadId[row.leadId];
      const localContact = localContactByLeadId[row.leadId];
      if (!localStatus && !localContact) return row;
      return {
        ...row,
        status: localStatus ?? row.status,
        contactActivity: localContact ?? row.contactActivity,
        progressAtLabel: localContact
          ? progressLabelForContactStatus(
              resolveContactStatusValue(localContact),
            )
          : row.progressAtLabel,
      };
    });
  }, [rows, localStatusByLeadId, localContactByLeadId]);

  const missingContactRows = useMemo(() => {
    return displayRows.filter((row) => !row.hasOutreachChannel);
  }, [displayRows]);

  const pageStart =
    pagination.totalCount === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalCount,
  );

  function updateFilter(key: keyof LeadCrmFilters, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete("page");
    pushSearchParams(next);
  }

  function goToPage(page: number) {
    const next = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(page));
    }
    pushSearchParams(next);
  }

  function pushSearchParams(next: URLSearchParams) {
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  async function enrichMissingContacts() {
    if (isWorking || isEnriching) return;

    const targets = missingContactRows.map((row) => row.companyId);
    if (targets.length === 0) {
      setSuccessMessage("表示中のリードはすでに連絡先があります。");
      return;
    }

    if (
      !window.confirm(
        `表示中の未設定 ${targets.length} 社について、公式サイトからメール／お問い合わせフォームを自動検索します。よろしいですか？`,
      )
    ) {
      return;
    }

    setIsEnriching(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setEnrichProgress({ done: 0, total: targets.length, found: 0 });

    const chunkSize = 3;
    let found = 0;
    let done = 0;
    const failureMessages: string[] = [];

    try {
      for (let index = 0; index < targets.length; index += chunkSize) {
        const chunk = targets.slice(index, index + chunkSize);
        const response = await fetch("/api/companies/enrich-batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyIds: chunk,
            onlyMissing: true,
            limit: chunk.length,
          }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload?.error?.message ?? "一括の連絡先取得に失敗しました。",
          );
        }

        const results = payload?.data?.results ?? [];
        for (const result of results) {
          done += 1;
          if (result.ok && (result.primaryEmail || result.contactFormUrl)) {
            found += 1;
          } else if (!result.ok) {
            failureMessages.push(
              `${result.companyName || result.companyId}: ${result.message}`,
            );
          }
        }

        setEnrichProgress({ done, total: targets.length, found });
      }

      setSuccessMessage(
        `連絡先検索が完了しました。${targets.length}社中 ${found}社でメールまたはフォームを取得しました。`,
      );
      if (failureMessages.length > 0) {
        setErrorMessage(failureMessages.slice(0, 3).join(" / "));
      }
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "一括の連絡先取得に失敗しました。",
      );
    } finally {
      setIsEnriching(false);
    }
  }

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "リードを作成できませんでした。");
      }

      setCreateForm(emptyForm);
      setInputPanel(null);
      setSuccessMessage("リードを作成しました。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "リードを作成できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function toggleQualifyMark(row: LeadManageRow) {
    if (isWorking) return;

    const nextStatus = nextQualifiedMarkStatus(row.status);

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/leads/${row.leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...rowToForm(row),
          status: nextStatus,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "見込みマークを更新できませんでした。");
      }

      setSuccessMessage(
        nextStatus === "QUALIFIED"
          ? `${row.companyName || "リード"} を見込みにしました。`
          : nextStatus === "RESEARCHED"
            ? `${row.companyName || "リード"} を見送りにしました（レコードは残します）。`
            : `${row.companyName || "リード"} を未確認に戻しました。`,
      );
      setLocalStatusState((current) => ({
        scopeKey: overrideScopeKey,
        values: {
          ...(current.scopeKey === overrideScopeKey ? current.values : {}),
          [row.leadId]: nextStatus,
        },
      }));
      // Do not refresh: keep the row in the current filter view so Confirm
      // changes (見込み → 見送り / 未確認) stay visible until the filter changes.
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "見込みマークを更新できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function updateContactStatus(
    row: LeadManageRow,
    nextStatus: ContactStatusValue,
  ) {
    if (isWorking || workingStatusLeadId) return;

    const currentStatus = resolveContactStatusValue(row.contactActivity);
    if (currentStatus === nextStatus) return;

    const previousActivity = row.contactActivity;

    // Update UI immediately; roll back if the API fails.
    setLocalContactState((current) => ({
      scopeKey: overrideScopeKey,
      values: {
        ...(current.scopeKey === overrideScopeKey ? current.values : {}),
        [row.leadId]: activityForContactStatus(nextStatus),
      },
    }));
    setWorkingStatusLeadId(row.leadId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/leads/${row.leadId}/contact-status`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      let payload: { error?: { message?: string } } = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ??
            `連絡進捗を更新できませんでした。（${response.status}）`,
        );
      }

      setSuccessMessage(
        nextStatus === "not_contacted"
          ? `${row.companyName || "リード"} を未連絡に戻しました。`
          : `${row.companyName || "リード"} の連絡進捗を更新しました。`,
      );
    } catch (error) {
      setLocalContactState((current) => ({
        scopeKey: overrideScopeKey,
        values: {
          ...(current.scopeKey === overrideScopeKey ? current.values : {}),
          [row.leadId]: previousActivity,
        },
      }));
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "連絡進捗を更新できませんでした。",
      );
    } finally {
      setWorkingStatusLeadId(null);
    }
  }

  return (
    <div className="space-y-2">
      {(errorMessage || successMessage) && (
        <div className="text-sm">
          {errorMessage ? <p className="text-rose-700">{errorMessage}</p> : null}
          {successMessage ? (
            <p className="text-emerald-700">{successMessage}</p>
          ) : null}
        </div>
      )}

      <section className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="shrink-0">
              <h3 className="text-sm font-semibold text-slate-950">リード一覧</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {pagination.totalCount === 0
                  ? "0件を表示"
                  : `${pagination.totalCount}件中 ${pageStart}-${pageEnd}件を表示`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold ${
                  inputPanel === "create"
                    ? "border border-emerald-700 bg-emerald-700 text-white shadow-sm"
                    : "border border-emerald-200 bg-white text-emerald-800 shadow-sm hover:bg-emerald-50"
                }`}
                onClick={() =>
                  setInputPanel((current) =>
                    current === "create" ? null : "create",
                  )
                }
                type="button"
              >
                + Add Lead
              </button>
              <button
                className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold ${
                  inputPanel === "import"
                    ? "border border-slate-800 bg-slate-800 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                }`}
                onClick={() =>
                  setInputPanel((current) =>
                    current === "import" ? null : "import",
                  )
                }
                type="button"
              >
                Import Excel
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-emerald-300 disabled:bg-emerald-300"
                disabled={isWorking || isEnriching || missingContactRows.length === 0}
                onClick={() => void enrichMissingContacts()}
                type="button"
              >
                {isEnriching
                  ? `連絡先検索中… ${enrichProgress?.done ?? 0}/${enrichProgress?.total ?? 0}`
                  : `連絡先を一括検索（未設定 ${missingContactRows.length}社）`}
              </button>
            </div>
          </div>

          {inputPanel ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold text-slate-800">
                  {inputPanel === "create" ? "リード追加" : "Excelインポート"}
                </h4>
                <button
                  className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  onClick={() => setInputPanel(null)}
                  type="button"
                >
                  閉じる
                </button>
              </div>
              {inputPanel === "create" ? (
                <form className="space-y-3" onSubmit={createLead}>
                  <LeadFormFields form={createForm} onChange={setCreateForm} />
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={isWorking}
                    type="submit"
                  >
                    {isWorking ? "保存中…" : "リードを作成"}
                  </button>
                </form>
              ) : (
                <LeadsExcelImport embedded />
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <label className="flex h-8 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs sm:w-auto">
              <span className="shrink-0 font-medium text-slate-600">
                所在地
              </span>
              <select
                className="h-6 min-w-36 flex-1 border-0 bg-transparent px-0 text-xs text-slate-900 outline-none"
                onChange={(event) =>
                  updateFilter("location", event.currentTarget.value)
                }
                value={filters.location}
              >
                <option value="all">すべて</option>
                {locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-8 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs sm:w-auto">
              <span className="shrink-0 font-medium text-slate-600">
                見込み
              </span>
              <select
                className="h-6 min-w-24 flex-1 border-0 bg-transparent px-0 text-xs text-slate-900 outline-none"
                onChange={(event) =>
                  updateFilter("qualify", event.currentTarget.value)
                }
                value={filters.qualify}
              >
                <option value="all">すべて</option>
                <option value="unconfirmed">未確認</option>
                <option value="qualified">見込み</option>
                <option value="passed">見送り</option>
              </select>
            </label>
            <label className="flex h-8 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs sm:w-auto">
              <span className="shrink-0 font-medium text-slate-600">
                連絡進捗
              </span>
              <select
                className="h-6 min-w-24 flex-1 border-0 bg-transparent px-0 text-xs text-slate-900 outline-none"
                onChange={(event) =>
                  updateFilter("progress", event.currentTarget.value)
                }
                value={filters.progress}
              >
                <option value="all">すべて</option>
                <option value="not_yet">未連絡</option>
                <option value="contacted">連絡済み</option>
                <option value="replied">返信あり</option>
                <option value="closed">完了</option>
              </select>
            </label>
          </div>
        </div>
        {enrichProgress ? (
          <p className="mt-2 text-right text-xs text-slate-500">
            進捗 {enrichProgress.done}/{enrichProgress.total} ・ 取得成功{" "}
            {enrichProgress.found}社
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1040px] border-collapse bg-white text-left text-xs">
            <thead className="sticky top-0 z-10 bg-emerald-800 text-[11px] font-semibold uppercase tracking-normal text-white">
              <tr className="border-b border-emerald-900">
                <th className="w-[22%] px-3 py-2">Company</th>
                <th className="w-[13%] px-3 py-2">URL</th>
                <th className="w-[9%] px-3 py-2">Confirm</th>
                <th className="whitespace-nowrap px-2 py-2">連絡進捗</th>
                <th className="w-[20%] px-3 py-2">Email</th>
                <th className="w-[12%] px-3 py-2">Phone</th>
                <th className="w-[9%] px-3 py-2">Location</th>
                <th className="w-[8%] px-3 py-2">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-sm text-slate-500"
                    colSpan={8}
                  >
                    {pagination.totalCount === 0
                      ? "リードがありません。上のフォームかExcelから追加してください。"
                      : "選択した条件に一致するリードがありません。"}
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row, index) => (
                <tr
                  className={`align-middle transition-colors hover:bg-blue-50/60 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50"
                  }`}
                  key={row.leadId}
                >
                  <td className="px-3 py-2">
                    <Link
                      className="block max-w-[18rem] truncate font-medium text-slate-950 hover:text-blue-700 hover:underline"
                      href={`/companies/${row.companyId}`}
                      title={row.companyName || "未命名の会社"}
                    >
                      {row.companyName || "未命名の会社"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <WebsiteLink url={row.websiteUrl} />
                  </td>
                  <td className="px-3 py-2">
                    <QualifyMarkButton
                      disabled={isWorking}
                      onToggle={() => void toggleQualifyMark(row)}
                      status={row.status}
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <ContactStatusSelect
                      activity={row.contactActivity}
                      disabled={isWorking || workingStatusLeadId !== null}
                      isWorking={workingStatusLeadId === row.leadId}
                      onChange={(nextStatus) =>
                        void updateContactStatus(row, nextStatus)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <ContactEmail email={row.email} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.phone || <EmptyValue />}
                  </td>
                  <td className="px-3 py-2">
                    <LocationText row={row} />
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">
                    <span
                      className="block max-w-[9rem] truncate"
                      title={row.progressAtLabel}
                    >
                      {row.progressAtLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              {pagination.page} / {pagination.totalPages} ページ
            </span>
            <div className="flex gap-2">
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                disabled={pagination.page <= 1}
                onClick={() => goToPage(pagination.page - 1)}
                type="button"
              >
                前へ
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => goToPage(pagination.page + 1)}
                type="button"
              >
                次へ
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function WebsiteLink({ url }: { url: string }) {
  if (!url) {
    return <EmptyValue />;
  }

  const label = getWebsiteLabel(url);

  return (
    <a
      className="block max-w-[11rem] truncate text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
      href={url}
      rel="noreferrer"
      target="_blank"
      title={url}
    >
      {label}
    </a>
  );
}

function ContactEmail({ email }: { email: string }) {
  if (!email) {
    return <EmptyValue />;
  }

  return (
    <a
      className="block max-w-[15rem] truncate text-slate-700 hover:text-blue-700 hover:underline"
      href={`mailto:${email}`}
      title={email}
    >
      {email}
    </a>
  );
}

function LocationText({ row }: { row: LeadManageRow }) {
  const label = row.location || row.address;
  const title = [row.location, row.address].filter(Boolean).join(" / ");

  if (!label) {
    return <EmptyValue />;
  }

  return (
    <span className="block max-w-[10rem] truncate text-slate-700" title={title}>
      {label}
    </span>
  );
}

function getWebsiteLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  }
}

function EmptyValue() {
  return <span className="text-slate-300">—</span>;
}

type ContactStatusValue =
  | "not_contacted"
  | "email"
  | "phone"
  | "reply";

const CONTACT_STATUS_OPTIONS: Array<{
  value: ContactStatusValue;
  label: string;
}> = [
  { value: "not_contacted", label: "未連絡" },
  { value: "email", label: "メール済み" },
  { value: "phone", label: "電話済み" },
  { value: "reply", label: "返信あり" },
];

function ContactStatusSelect({
  activity,
  disabled,
  isWorking,
  onChange,
}: {
  activity: LeadContactActivitySummary;
  disabled?: boolean;
  isWorking?: boolean;
  onChange: (nextStatus: ContactStatusValue) => void;
}) {
  const value = resolveContactStatusValue(activity);

  return (
    <select
      aria-label="連絡進捗"
      className={`h-6 min-w-[6.75rem] cursor-pointer rounded-full border px-2 text-[11px] font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${contactStatusToneClass(
        value,
      )}`}
      disabled={disabled}
      onChange={(event) =>
        onChange(event.currentTarget.value as ContactStatusValue)
      }
      title="連絡進捗を記録"
      value={value}
    >
      {CONTACT_STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {isWorking && option.value === value ? "更新中…" : option.label}
        </option>
      ))}
    </select>
  );
}

function resolveContactStatusValue(
  activity: LeadContactActivitySummary,
): ContactStatusValue {
  if (activity.hasEmailReply) return "reply";
  if (activity.hasEmailContact) return "email";
  if (activity.hasPhoneContact) return "phone";
  return "not_contacted";
}

function activityForContactStatus(
  status: ContactStatusValue,
): LeadContactActivitySummary {
  return {
    hasEmailContact: status === "email" || status === "reply",
    hasPhoneContact: status === "phone",
    hasEmailReply: status === "reply",
  };
}

function progressLabelForContactStatus(status: ContactStatusValue) {
  const stamp = new Intl.DateTimeFormat("ja", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  if (status === "email") return `メール ${stamp}`;
  if (status === "phone") return `架電 ${stamp}`;
  if (status === "reply") return `返信 ${stamp}`;
  return stamp;
}

function contactStatusToneClass(status: ContactStatusValue) {
  if (status === "reply") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "email") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "phone") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function QualifyMarkButton({
  status,
  disabled,
  onToggle,
}: {
  status: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const kind = resolveQualifyMark(status);
  const label = qualifyMarkLabel(kind);

  const toneClass =
    kind === "qualified"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : kind === "passed"
        ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
        : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100";

  return (
    <button
      className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      disabled={disabled}
      onClick={onToggle}
      title="クリックで 未確認 → 見込み → 見送り を切替"
      type="button"
    >
      {label}
    </button>
  );
}

function LeadFormFields({
  form,
  onChange,
}: {
  form: LeadFormState;
  onChange: (next: LeadFormState) => void;
}) {
  function update<K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field
        label="会社名"
        onChange={(value) => update("companyName", value)}
        required
        value={form.companyName}
      />
      <Field
        label="ウェブサイトURL"
        onChange={(value) => update("websiteUrl", value)}
        placeholder="https://company.com"
        value={form.websiteUrl}
      />
      <Field
        label="担当者名"
        onChange={(value) => update("contactName", value)}
        value={form.contactName}
      />
      <Field
        label="役職"
        onChange={(value) => update("contactTitle", value)}
        value={form.contactTitle}
      />
      <Field
        label="メール"
        onChange={(value) => update("email", value)}
        type="email"
        value={form.email}
      />
      <Field
        label="電話番号"
        onChange={(value) => update("phone", value)}
        value={form.phone}
      />
      <Field
        label="業種"
        onChange={(value) => update("industry", value)}
        value={form.industry}
      />
      <Field
        label="所在地"
        onChange={(value) => update("location", value)}
        placeholder="都道府県"
        value={form.location}
      />
      <label className="block text-sm md:col-span-2">
        <span className="font-medium text-slate-700">住所</span>
        <input
          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          onChange={(event) => update("address", event.currentTarget.value)}
          placeholder="詳細住所"
          value={form.address}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">ステータス</span>
        <select
          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          onChange={(event) => update("status", event.currentTarget.value)}
          value={form.status}
        >
          {LEAD_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {leadStatusLabelJa(status)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">優先度</span>
        <select
          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          onChange={(event) => update("priority", event.currentTarget.value)}
          value={form.priority}
        >
          {LEAD_PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>
              {priorityLabelJa(priority)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="font-medium text-slate-700">メモ</span>
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          onChange={(event) => update("notes", event.currentTarget.value)}
          value={form.notes}
        />
      </label>
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
      <span className="font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
