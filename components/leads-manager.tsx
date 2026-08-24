"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LeadsExcelImport } from "@/components/leads-excel-import";
import type { LeadContactActivitySummary } from "@/components/lead-tracking-actions";
import { formatIndustryJa } from "@/lib/industries";
import {
  nextQualifiedMarkStatus,
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
  description: string;
  researchSummary: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  contactFormUrl: string;
  status: string;
  progressStatus: string;
  priority: string;
  notes: string;
  contactActivity: LeadContactActivitySummary;
  progressAtLabel: string;
  lastActivityDateLabel: string;
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

type DetailPanelFormState = LeadFormState & {
  contactFormUrl: string;
  description: string;
  researchSummary: string;
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

const detailPanelStyle = {
  width: "360px",
  minWidth: "360px",
  maxWidth: "360px",
  flex: "0 0 360px",
};

const detailPanelClassName =
  "sticky top-3 z-10 max-h-[calc(100vh-1.5rem)] self-start overflow-y-auto border-l border-slate-300 bg-white p-5";

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

function rowToDetailForm(row: LeadManageRow): DetailPanelFormState {
  return {
    ...rowToForm(row),
    contactFormUrl: row.contactFormUrl,
    description: row.description,
    researchSummary: row.researchSummary,
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
  const [query, setQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
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

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return displayRows;

    return displayRows.filter((row) => {
      const haystack = [
        row.companyName,
        row.websiteUrl,
        getWebsiteLabel(row.websiteUrl),
        row.email,
        row.phone,
        row.location,
        row.address,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [displayRows, query]);

  const visibleLeadIds = useMemo(
    () => visibleRows.map((row) => row.leadId),
    [visibleRows],
  );
  const allVisibleSelected =
    visibleLeadIds.length > 0 &&
    visibleLeadIds.every((leadId) => selectedLeadIds.has(leadId));
  const requestedLeadId = searchParams.get("lead");
  const requestedCompanyId = searchParams.get("company");
  const requestedRow = displayRows.find(
    (row) =>
      (requestedLeadId && row.leadId === requestedLeadId) ||
      (requestedCompanyId && row.companyId === requestedCompanyId),
  );
  const selectedRow =
    displayRows.find((row) => row.leadId === selectedLeadId) ??
    requestedRow ??
    null;

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

  function selectLead(row: LeadManageRow) {
    setSelectedLeadId(row.leadId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("lead", row.leadId);
    next.delete("company");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function updateFilters(nextFilters: Partial<LeadCrmFilters>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    next.delete("page");
    pushSearchParams(next);
  }

  function applyQuickPreset(value: string) {
    if (value === "qualified_uncontacted") {
      updateFilters({ qualify: "qualified", progress: "not_contacted" });
    } else if (value === "needs_contact") {
      updateFilters({ qualify: "all", progress: "not_contacted" });
    } else if (value === "replied") {
      updateFilters({ qualify: "all", progress: "reply" });
    }
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const leadId of visibleLeadIds) {
          next.delete(leadId);
        }
      } else {
        for (const leadId of visibleLeadIds) {
          next.add(leadId);
        }
      }
      return next;
    });
  }

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { companyName, websiteUrl, address, email } = createForm;
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName, websiteUrl, address, email }),
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
        throw new Error(payload?.error?.message ?? "判定を更新できませんでした。");
      }

      setSuccessMessage(
        nextStatus === "QUALIFIED"
          ? `${row.companyName || "リード"} を有望にしました。`
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
      // changes (有望 → 見送り / 未確認) stay visible until the filter changes.
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "判定を更新できませんでした。",
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

      <section className="rounded-md border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-300 bg-slate-50 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 w-36 flex-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm">
              <span className="text-slate-500">所在地:</span>
              <select
                className="h-7 min-w-0 flex-1 truncate border-0 bg-transparent text-sm font-semibold text-slate-900 outline-none"
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
            <label className="flex h-9 w-32 flex-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm">
              <span className="text-slate-500">判定:</span>
              <select
                className="h-7 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-900 outline-none"
                onChange={(event) =>
                  updateFilter("qualify", event.currentTarget.value)
                }
                value={filters.qualify}
              >
                <option value="all">すべて</option>
                <option value="unconfirmed">未確認</option>
                <option value="qualified">有望</option>
                <option value="passed">見送り</option>
              </select>
            </label>
            <label className="flex h-9 w-32 flex-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm">
              <span className="text-slate-500">進捗:</span>
              <select
                className="h-7 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-900 outline-none"
                onChange={(event) =>
                  updateFilter("progress", event.currentTarget.value)
                }
                value={filters.progress}
              >
                <option value="not_contacted">未連絡</option>
                <option value="email">メール済み</option>
                <option value="phone">電話済み</option>
                <option value="reply">返信あり</option>
              </select>
            </label>
            <label className="flex h-9 w-64 flex-none items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm">
              <span className="text-slate-400">Search</span>
              <input
                className="h-7 min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="company or domain..."
                type="search"
                value={query}
              />
            </label>
            <label className="flex h-9 w-40 flex-none items-center rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 shadow-sm">
              <select
                aria-label="Quick Presets"
                className="h-7 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
                onChange={(event) => {
                  applyQuickPreset(event.currentTarget.value);
                  event.currentTarget.value = "";
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  + Quick Presets
                </option>
                <option value="needs_contact">未連絡リード</option>
                <option value="qualified_uncontacted">有望・未連絡</option>
                <option value="replied">返信あり</option>
              </select>
            </label>
            <button
              className={`inline-flex h-9 items-center justify-center rounded-md border px-2.5 text-sm font-semibold shadow-sm ${
                inputPanel === "import"
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-sky-300 bg-white text-sky-800 hover:bg-sky-50"
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
              className={`inline-flex h-9 items-center justify-center rounded-md border px-2.5 text-sm font-semibold shadow-sm ${
                inputPanel === "create"
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-blue-700 bg-blue-600 text-white hover:bg-blue-700"
              }`}
              onClick={() =>
                setInputPanel((current) =>
                  current === "create" ? null : "create",
                )
              }
              type="button"
            >
              + Add Leads
            </button>
          </div>

          {inputPanel ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
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
        </div>
        <div className="flex items-start">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse bg-white text-left">
              <thead className="bg-slate-100 text-base font-semibold text-slate-950">
                <tr className="border-b border-slate-300">
                  <th className="w-12 border-r border-slate-300 px-3 py-3">
                    <input
                      aria-label="表示中のリードを選択"
                      checked={allVisibleSelected}
                      className="h-5 w-5 rounded border-slate-300"
                      onChange={toggleVisibleSelection}
                      type="checkbox"
                    />
                  </th>
                  <th className="w-[50%] border-r border-slate-300 px-4 py-3">
                    Company
                  </th>
                  <th className="w-[18%] border-r border-slate-300 px-4 py-3">
                    Last Activity
                  </th>
                  <th className="w-[26%] min-w-[15rem] px-4 py-3">
                    Progress &amp; Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm text-slate-950">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-10 text-center text-sm text-slate-500"
                      colSpan={4}
                    >
                      {pagination.totalCount === 0
                        ? "リードがありません。上のフォームかExcelから追加してください。"
                        : query
                          ? "検索条件に一致するリードがありません。"
                        : "選択した条件に一致するリードがありません。"}
                    </td>
                  </tr>
                ) : null}
                {visibleRows.map((row) => {
                  const isSelected = row.leadId === selectedRow?.leadId;

                  return (
                    <tr
                      className={`h-[68px] align-middle transition-colors hover:bg-blue-50/60 ${
                        isSelected ? "bg-blue-50" : "bg-white"
                      }`}
                      key={row.leadId}
                    >
                      <td className="border-r border-slate-300 px-3 py-2">
                        <input
                          aria-label={`${row.companyName || "未命名の会社"}を選択`}
                          checked={selectedLeadIds.has(row.leadId)}
                          className="h-4 w-4 rounded border-slate-300"
                          onChange={() => toggleLeadSelection(row.leadId)}
                          type="checkbox"
                        />
                      </td>
                      <td className="border-r border-slate-300 px-3 py-2">
                        <div className="min-w-0">
                          <button
                            className="block max-w-[18rem] truncate text-left text-sm font-semibold leading-5 text-slate-950 hover:text-blue-700 hover:underline"
                            onClick={() => selectLead(row)}
                            title={row.companyName || "未命名の会社"}
                            type="button"
                          >
                            {row.companyName || "未命名の会社"}
                          </button>
                          <CompanyMetaLines row={row} />
                        </div>
                      </td>
                      <td className="border-r border-slate-300 px-3 py-2 text-sm">
                        <span
                          className="whitespace-nowrap"
                          title={row.progressAtLabel}
                        >
                          {row.lastActivityDateLabel}
                        </span>
                      </td>
                      <td className="min-w-[15rem] px-3 py-2 text-center">
                        <LeadProgressCell
                          disabled={isWorking || workingStatusLeadId !== null}
                          isWorking={workingStatusLeadId === row.leadId}
                          onContactChange={(nextStatus) =>
                            void updateContactStatus(row, nextStatus)
                          }
                          onQualifyToggle={() => void toggleQualifyMark(row)}
                          row={row}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CompanyDetailPanel key={selectedRow?.leadId ?? "empty"} row={selectedRow} />
        </div>
        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
            <span>
              {pagination.totalCount}件中 {pageStart}-{pageEnd}件 ・{" "}
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

function CompanyDetailPanel({ row }: { row: LeadManageRow | null }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<DetailPanelFormState | null>(
    row ? rowToDetailForm(row) : null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!row) {
    return (
      <aside
        className={`min-w-0 ${detailPanelClassName}`}
        style={detailPanelStyle}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">Company detail</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            会社名を選択すると、必要な情報だけをここに表示します。
          </p>
        </div>
      </aside>
    );
  }

  const currentRow = row;
  const qualifyLabel = qualifyMarkLabel(resolveQualifyMark(row.status));
  const contactStatus = resolveContactStatusValue(row.contactActivity);
  const memo = row.researchSummary || row.description;
  const location = [formatIndustryJa(row.industry), row.location]
    .filter(Boolean)
    .join(" / ");

  function updateForm<K extends keyof DetailPanelFormState>(
    key: K,
    value: DetailPanelFormState[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function savePanel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const leadResponse = await fetch(`/api/leads/${currentRow.leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          websiteUrl: form.websiteUrl,
          contactName: form.contactName,
          contactTitle: form.contactTitle,
          email: form.email,
          phone: form.phone,
          industry: form.industry,
          location: form.location,
          address: form.address,
          status: currentRow.status,
          priority: currentRow.priority,
          notes: currentRow.notes,
        }),
      });
      const leadPayload = await leadResponse.json();

      if (!leadResponse.ok) {
        throw new Error(
          leadPayload?.error?.message ?? "リード情報を保存できませんでした。",
        );
      }

      const companyResponse = await fetch(`/api/companies/${currentRow.companyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.companyName,
          websiteUrl: form.websiteUrl,
          industry: form.industry,
          location: form.location,
          address: form.address,
          primaryEmail: form.email,
          contactFormUrl: form.contactFormUrl,
          description: form.description,
        }),
      });
      const companyPayload = await companyResponse.json();

      if (!companyResponse.ok) {
        throw new Error(
          companyPayload?.error?.message ?? "会社情報を保存できませんでした。",
        );
      }

      if (form.researchSummary.trim() || currentRow.researchSummary) {
        const researchResponse = await fetch("/api/company-research", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId: currentRow.companyId,
            summary: form.researchSummary,
          }),
        });
        const researchPayload = await researchResponse.json();

        if (!researchResponse.ok) {
          throw new Error(
            researchPayload?.error?.message ?? "メモを保存できませんでした。",
          );
        }
      }

      setIsEditing(false);
      setSuccessMessage("保存しました。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "保存できませんでした。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing && form) {
    return (
      <aside
        className={`min-w-0 ${detailPanelClassName}`}
        style={detailPanelStyle}
      >
        <form className="min-w-0 space-y-4" onSubmit={savePanel}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Edit company
              </p>
              <h3 className="mt-1 break-words text-lg font-bold text-slate-950">
                {row.companyName || "未命名の会社"}
              </h3>
            </div>
            <button
              className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              disabled={isSaving}
              onClick={() => {
                setForm(rowToDetailForm(row));
                setIsEditing(false);
                setErrorMessage(null);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            <PanelField
              label="Company"
              onChange={(value) => updateForm("companyName", value)}
              required
              value={form.companyName}
            />
            <PanelField
              label="Website"
              onChange={(value) => updateForm("websiteUrl", value)}
              value={form.websiteUrl}
            />
            <div className="grid grid-cols-2 gap-2">
              <PanelField
                label="Industry"
                onChange={(value) => updateForm("industry", value)}
                value={form.industry}
              />
              <PanelField
                label="Location"
                onChange={(value) => updateForm("location", value)}
                value={form.location}
              />
            </div>
            <PanelField
              label="Address"
              onChange={(value) => updateForm("address", value)}
              value={form.address}
            />
            <div className="grid grid-cols-2 gap-2">
              <PanelField
                label="Contact name"
                onChange={(value) => updateForm("contactName", value)}
                value={form.contactName}
              />
              <PanelField
                label="Title"
                onChange={(value) => updateForm("contactTitle", value)}
                value={form.contactTitle}
              />
            </div>
            <PanelField
              label="Email"
              onChange={(value) => updateForm("email", value)}
              type="email"
              value={form.email}
            />
            <PanelField
              label="Phone"
              onChange={(value) => updateForm("phone", value)}
              value={form.phone}
            />
            <PanelField
              label="Contact form"
              onChange={(value) => updateForm("contactFormUrl", value)}
              value={form.contactFormUrl}
            />
            <PanelTextArea
              label="Memo"
              onChange={(value) => updateForm("researchSummary", value)}
              value={form.researchSummary}
            />
          </div>

          <button
            className="inline-flex h-9 w-full items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          {errorMessage ? (
            <p className="text-xs leading-5 text-rose-700">{errorMessage}</p>
          ) : null}
        </form>
      </aside>
    );
  }

  return (
    <aside
      className={`min-w-0 ${detailPanelClassName}`}
      style={detailPanelStyle}
    >
      <div className="min-w-0 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Selected company
            </p>
            <h3 className="mt-1 break-words text-xl font-bold leading-7 text-slate-950">
              {row.companyName || "未命名の会社"}
            </h3>
            {location ? (
              <p className="mt-1 break-words text-sm text-slate-600">
                {location}
              </p>
            ) : null}
          </div>
          <button
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setIsEditing(true)}
            type="button"
          >
            Edit
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-7 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">
            {qualifyLabel}
          </span>
          <span className="inline-flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-800">
            {contactStatusLabel(contactStatus)}
          </span>
        </div>

        <dl className="min-w-0 space-y-3 text-sm">
          <DetailItem label="Website">
            {row.websiteUrl ? (
              <a
                className="break-all text-blue-700 hover:text-blue-800 hover:underline"
                href={row.websiteUrl}
                rel="noreferrer"
                target="_blank"
              >
                {getWebsiteLabel(row.websiteUrl)}
              </a>
            ) : (
              <EmptyValue />
            )}
          </DetailItem>
          <DetailItem label="Contact">
            <div className="space-y-1">
              {row.contactName || row.contactTitle ? (
                <p>
                  {[row.contactName, row.contactTitle].filter(Boolean).join(" / ")}
                </p>
              ) : null}
              {row.email ? (
                <a
                  className="block break-all text-blue-700 hover:text-blue-800 hover:underline"
                  href={`mailto:${row.email}`}
                >
                  {row.email}
                </a>
              ) : null}
              {row.phone ? (
                <a
                  className="block text-blue-700 hover:text-blue-800 hover:underline"
                  href={`tel:${row.phone}`}
                >
                  {row.phone}
                </a>
              ) : null}
              {row.contactFormUrl ? (
                <a
                  className="block break-all text-blue-700 hover:text-blue-800 hover:underline"
                  href={row.contactFormUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  お問い合わせフォーム
                </a>
              ) : null}
              {!row.email && !row.phone && !row.contactFormUrl ? (
                <EmptyValue />
              ) : null}
            </div>
          </DetailItem>
          <DetailItem label="Address">
            <span className="break-words">
              {row.address || row.location || <EmptyValue />}
            </span>
          </DetailItem>
          <DetailItem label="Last activity">{row.progressAtLabel}</DetailItem>
          <DetailItem label="Memo">
            {memo ? (
              <p className="max-h-40 overflow-y-auto whitespace-pre-line break-words leading-6 text-slate-700">
                {memo}
              </p>
            ) : (
              <span className="text-slate-400">調査メモはまだありません。</span>
            )}
          </DetailItem>
        </dl>

        {successMessage ? (
          <p className="text-xs font-medium text-emerald-700">{successMessage}</p>
        ) : null}
      </div>
    </aside>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function PanelField({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        onChange={(event) => onChange(event.currentTarget.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function PanelTextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <textarea
        className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
    </label>
  );
}

function CompanyMetaLines({ row }: { row: LeadManageRow }) {
  const location = row.location || row.address;
  const primaryContact = row.email
    ? {
        href: `mailto:${row.email}`,
        icon: "mail" as const,
        label: row.email,
        tone: "link" as const,
      }
    : row.contactFormUrl
      ? {
          href: row.contactFormUrl,
          icon: "link" as const,
          label: "お問い合わせフォーム",
          tone: "link" as const,
        }
      : {
          href: "",
          icon: "mail" as const,
          label: "連絡先未設定",
          tone: "missing" as const,
        };

  return (
    <div className="mt-0.5 min-w-0 space-y-0.5">
      <MetaLine
        href={primaryContact.href}
        icon={primaryContact.icon}
        label={primaryContact.label}
        tone={primaryContact.tone}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {row.phone ? (
          <MetaLine
            compact
            href={`tel:${row.phone}`}
            icon="phone"
            label={row.phone}
            tone="muted"
          />
        ) : null}
        {location ? (
          <MetaLine compact icon="pin" label={location} tone="muted" />
        ) : null}
        {!row.phone && !location ? (
          <MetaLine compact icon="phone" label="電話・所在地未設定" tone="missing" />
        ) : null}
      </div>
    </div>
  );
}

function MetaLine({
  compact = false,
  href = "",
  icon,
  label,
  tone,
}: {
  compact?: boolean;
  href?: string;
  icon: CompanyMetaIconName;
  label: string;
  tone: "link" | "muted" | "missing";
}) {
  const toneClass =
    tone === "link"
      ? "text-blue-700 hover:text-blue-800"
      : tone === "missing"
        ? "text-amber-700"
        : "text-slate-600";
  const className = `inline-flex min-w-0 max-w-full items-center gap-1.5 ${
    compact ? "text-xs" : "text-sm"
  } ${toneClass}`;
  const content = (
    <>
      <CompanyMetaIcon name={icon} />
      <span className="truncate">{label}</span>
    </>
  );

  if (!href) {
    return (
      <span className={className} title={label}>
        {content}
      </span>
    );
  }

  return (
    <a
      className={`${className} hover:text-blue-700 hover:underline`}
      href={href}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      target={href.startsWith("http") ? "_blank" : undefined}
      title={label}
    >
      {content}
    </a>
  );
}

type CompanyMetaIconName = "mail" | "link" | "phone" | "pin";

function CompanyMetaIcon({ name }: { name: CompanyMetaIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 text-current"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {name === "mail" ? (
        <>
          <rect height="16" rx="2" width="20" x="2" y="4" />
          <path d="m22 7-10 6L2 7" />
        </>
      ) : null}
      {name === "link" ? (
        <>
          <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
          <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
        </>
      ) : null}
      {name === "phone" ? (
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.31 1.85.53 2.81.66A2 2 0 0 1 22 16.92Z" />
      ) : null}
      {name === "pin" ? (
        <>
          <path d="M20 10c0 4.5-8 12-8 12S4 14.5 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </>
      ) : null}
    </svg>
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
      className={`h-9 w-28 cursor-pointer rounded-lg border px-2 text-center text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${contactStatusToneClass(
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

function LeadProgressCell({
  row,
  disabled,
  isWorking,
  onContactChange,
  onQualifyToggle,
}: {
  row: LeadManageRow;
  disabled?: boolean;
  isWorking?: boolean;
  onContactChange: (nextStatus: ContactStatusValue) => void;
  onQualifyToggle: () => void;
}) {
  return (
    <div className="grid min-w-[14.5rem] grid-cols-2 justify-center gap-2">
      <QualifyMarkButton
        disabled={disabled}
        onToggle={onQualifyToggle}
        status={row.status}
      />
      <ContactStatusSelect
        activity={row.contactActivity}
        disabled={disabled}
        isWorking={isWorking}
        onChange={onContactChange}
      />
    </div>
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
  if (status === "reply") return "border-[#6EE7B7] bg-[#D1FAE5] text-[#065F46]";
  if (status === "email") return "border-[#93C5FD] bg-[#DBEAFE] text-[#1D4ED8]";
  if (status === "phone") return "border-[#A5B4FC] bg-[#E0E7FF] text-[#3730A3]";
  return "border-[#FCD34D] bg-[#FEF3C7] text-[#92400E]";
}

function contactStatusLabel(status: ContactStatusValue) {
  if (status === "reply") return "返信あり";
  if (status === "email") return "メール済み";
  if (status === "phone") return "電話済み";
  return "未連絡";
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
  const label = kind === "qualified" ? "有望" : qualifyMarkLabel(kind);

  const toneClass =
    kind === "qualified"
      ? "border-[#86EFAC] bg-[#DCFCE7] text-[#166534] hover:bg-[#DCFCE7]"
      : kind === "passed"
        ? "border-[#D1D5DB] bg-[#E5E7EB] text-[#374151] hover:bg-[#E5E7EB]"
        : "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569] hover:bg-[#F1F5F9]";

  return (
    <button
      className={`inline-flex h-9 w-28 shrink-0 items-center justify-center rounded-lg border px-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      disabled={disabled}
      onClick={onToggle}
      title="クリックで 未確認 → 有望 → 見送り を切替"
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
      <label className="block text-sm md:col-span-2">
        <span className="font-medium text-slate-700">住所</span>
        <input
          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          onChange={(event) => update("address", event.currentTarget.value)}
          placeholder="詳細住所"
          value={form.address}
        />
      </label>
      <Field
        label="メール"
        onChange={(value) => update("email", value)}
        type="email"
        value={form.email}
      />
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
