"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  LeadTrackingActions,
  type LeadContactActivitySummary,
} from "@/components/lead-tracking-actions";
import { formatIndustryJa } from "@/lib/industries";
import {
  LEAD_PRIORITY_OPTIONS,
  LEAD_STATUS_OPTIONS,
  normalizeLocationLabel,
} from "@/lib/leads/constants";
import {
  leadMatchesProgressFilter,
  leadMatchesQualifyFilter,
  leadStatusLabelJa,
  nextQualifiedMarkStatus,
  priorityLabelJa,
  qualifyMarkLabel,
  resolveQualifyMark,
  type LeadStatusFilterGroup,
  type QualifyFilterGroup,
} from "@/lib/leads/status";

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

type StatusFilter = LeadStatusFilterGroup;
type QualifyFilter = QualifyFilterGroup;

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

export function LeadsManager({ rows }: { rows: LeadManageRow[] }) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<LeadFormState>(emptyForm);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LeadFormState>(emptyForm);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [qualifyFilter, setQualifyFilter] = useState<QualifyFilter>("unconfirmed");
  const [localStatusByLeadId, setLocalStatusByLeadId] = useState<
    Record<string, string>
  >({});
  const [stickyQualifyFilterByLeadId, setStickyQualifyFilterByLeadId] =
    useState<Record<string, QualifyFilter>>({});
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{
    done: number;
    total: number;
    found: number;
  } | null>(null);

  const locationOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => normalizeLocationLabel(row.location))
          .filter((location) => Boolean(location) && !/^[a-z]/i.test(location)),
      ),
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [rows]);

  const displayRows = useMemo(() => {
    return rows.map((row) => {
      const localStatus = localStatusByLeadId[row.leadId];
      if (!localStatus) return row;
      return {
        ...row,
        status: localStatus,
      };
    });
  }, [rows, localStatusByLeadId]);

  const filteredRows = useMemo(() => {
    return displayRows.filter((row) => {
      if (
        locationFilter !== "all" &&
        normalizeLocationLabel(row.location) !== locationFilter
      ) {
        return false;
      }
      if (
        statusFilter !== "all" &&
        !leadMatchesProgressFilter(row.status, row.contactActivity, statusFilter)
      ) {
        return false;
      }
      if (
        qualifyFilter !== "all" &&
        !leadMatchesQualifyFilter(row.status, qualifyFilter) &&
        stickyQualifyFilterByLeadId[row.leadId] !== qualifyFilter
      ) {
        return false;
      }
      return true;
    });
  }, [
    displayRows,
    locationFilter,
    statusFilter,
    qualifyFilter,
    stickyQualifyFilterByLeadId,
  ]);

  const missingContactRows = useMemo(() => {
    return filteredRows.filter((row) => !row.hasOutreachChannel);
  }, [filteredRows]);

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
      setIsCreateOpen(false);
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

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLeadId || isWorking) return;

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/leads/${editingLeadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "リードを更新できませんでした。");
      }

      setEditingLeadId(null);
      setSuccessMessage("リードを更新しました。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "リードを更新できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function deleteLead(leadId: string, companyName: string) {
    if (isWorking) return;
    if (!window.confirm(`${companyName} のリードを削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setIsWorking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "リードを削除できませんでした。");
      }

      if (editingLeadId === leadId) {
        setEditingLeadId(null);
      }
      setSuccessMessage(`${companyName} を削除しました。`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "リードを削除できませんでした。",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function toggleQualifyMark(row: LeadManageRow) {
    if (isWorking) return;

    const nextStatus = nextQualifiedMarkStatus(row.status);
    if (!nextStatus) {
      setErrorMessage(
        "連絡開始後のリードは「編集」からステータスを変更してください。",
      );
      return;
    }

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
      setLocalStatusByLeadId((current) => ({
        ...current,
        [row.leadId]: nextStatus,
      }));
      if (qualifyFilter !== "all") {
        setStickyQualifyFilterByLeadId((current) => ({
          ...current,
          [row.leadId]: qualifyFilter,
        }));
      }
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

  return (
    <div className="space-y-2">
      <section className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <button
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setIsCreateOpen((open) => !open)}
          type="button"
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-950">リード追加</h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              会社・担当者・ステータスを直接登録
            </p>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm">
            {isCreateOpen ? "閉じる" : "開く"}
          </span>
        </button>
        {isCreateOpen ? (
          <form className="mt-3 space-y-3 border-t border-slate-100 pt-3" onSubmit={createLead}>
            <LeadFormFields form={createForm} onChange={setCreateForm} />
            <button
              className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isWorking}
              type="submit"
            >
              {isWorking ? "保存中…" : "リードを作成"}
            </button>
          </form>
        ) : null}
      </section>

      {(errorMessage || successMessage) && (
        <div className="text-sm">
          {errorMessage ? <p className="text-rose-700">{errorMessage}</p> : null}
          {successMessage ? (
            <p className="text-emerald-700">{successMessage}</p>
          ) : null}
        </div>
      )}

      <section className="rounded-md border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">リード一覧</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {rows.length}件中 {filteredRows.length}件を表示
              {missingContactRows.length > 0
                ? `（連絡先未設定 ${missingContactRows.length}件）`
                : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-xs">
                <span className="font-medium text-slate-700">所在地</span>
                <select
                  className="mt-1 h-8 w-full min-w-36 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900"
                  onChange={(event) => setLocationFilter(event.currentTarget.value)}
                  value={locationFilter}
                >
                  <option value="all">すべての所在地</option>
                  {locationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="font-medium text-slate-700">見込み</span>
                <select
                  className="mt-1 h-8 w-full min-w-36 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900"
                  onChange={(event) =>
                    setQualifyFilter(event.currentTarget.value as QualifyFilter)
                  }
                  value={qualifyFilter}
                >
                  <option value="all">すべて</option>
                  <option value="unconfirmed">未確認</option>
                  <option value="qualified">見込み</option>
                  <option value="passed">見送り</option>
                </select>
              </label>
              <label className="block text-xs">
                <span className="font-medium text-slate-700">連絡進捗</span>
                <select
                  className="mt-1 h-8 w-full min-w-36 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900"
                  onChange={(event) =>
                    setStatusFilter(event.currentTarget.value as StatusFilter)
                  }
                  value={statusFilter}
                >
                  <option value="all">すべて</option>
                  <option value="not_yet">未連絡</option>
                  <option value="contacted">連絡済み</option>
                  <option value="replied">返信あり</option>
                  <option value="closed">完了</option>
                </select>
              </label>
            </div>
            <button
              className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              disabled={isWorking || isEnriching || missingContactRows.length === 0}
              onClick={() => void enrichMissingContacts()}
              type="button"
            >
              {isEnriching
                ? `連絡先検索中… ${enrichProgress?.done ?? 0}/${enrichProgress?.total ?? 0}`
                : `連絡先を一括検索（未設定 ${missingContactRows.length}社）`}
            </button>
            {enrichProgress ? (
              <p className="text-xs text-slate-500">
                進捗 {enrichProgress.done}/{enrichProgress.total} ・ 取得成功{" "}
                {enrichProgress.found}社
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100/50 p-1.5">
          <div className="min-w-[720px] space-y-1">
            {filteredRows.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                {rows.length === 0
                  ? "リードがありません。上のフォームかExcelから追加してください。"
                  : "選択した条件に一致するリードがありません。"}
              </p>
            ) : null}
            {filteredRows.map((row, rowIndex) => {
              const isEditing = editingLeadId === row.leadId;
              const isEvenRow = rowIndex % 2 === 0;

              return (
                <article
                  className={`rounded border px-2 py-1 ${
                    isEvenRow
                      ? "border-slate-200 bg-white"
                      : "border-sky-200/80 bg-sky-50/70"
                  }`}
                  key={row.leadId}
                >
                  {isEditing ? (
                    <form className="space-y-3 py-1" onSubmit={saveEdit}>
                      <LeadFormFields form={editForm} onChange={setEditForm} />
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                          disabled={isWorking}
                          type="submit"
                        >
                          {isWorking ? "保存中…" : "変更を保存"}
                        </button>
                        <button
                          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white"
                          disabled={isWorking}
                          onClick={() => setEditingLeadId(null)}
                          type="button"
                        >
                          キャンセル
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1.5fr)_auto_minmax(11rem,1fr)] items-center gap-x-2 text-[10px] leading-4">
                      {/* Col 1: company — 2 lines */}
                      <div className="min-w-0">
                        <Link
                          className="block truncate text-[11px] font-semibold text-slate-950 hover:text-blue-600"
                          href={`/companies/${row.companyId}`}
                          title={row.companyName || "未命名の会社"}
                        >
                          {row.companyName || "未命名の会社"}
                        </Link>
                        <p className="mt-0.5 truncate text-slate-600">
                          <CompanyMetaLine row={row} />
                        </p>
                      </div>

                      {/* Col 2: mark */}
                      <div className="flex justify-center self-center">
                        <QualifyMarkButton
                          disabled={isWorking}
                          onToggle={() => void toggleQualifyMark(row)}
                          status={row.status}
                        />
                      </div>

                      {/* Col 3: outreach — 2 lines */}
                      <div className="min-w-0">
                        <div className="flex flex-nowrap items-center justify-end gap-0.5">
                          <span
                            className={`inline-flex h-5 items-center whitespace-nowrap rounded border px-1.5 text-[10px] font-medium ${leadListStatusToneClass(
                              row.progressStatus,
                            )}`}
                          >
                            {leadStatusLabelJa(row.progressStatus)}
                          </span>
                          <LeadTrackingActions
                            contactActivity={row.contactActivity}
                            disabled={isWorking}
                            leadId={row.leadId}
                            onError={setErrorMessage}
                            onSuccess={setSuccessMessage}
                            size="compact"
                          />
                        </div>
                        <div className="mt-0.5 flex flex-nowrap items-center justify-end gap-0.5">
                          <span className="truncate text-[9px] text-slate-500">
                            {row.progressAtLabel}
                          </span>
                          <button
                            className="inline-flex h-5 items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                            disabled={isWorking}
                            onClick={() => {
                              setEditingLeadId(row.leadId);
                              setEditForm(rowToForm(row));
                              setErrorMessage(null);
                              setSuccessMessage(null);
                            }}
                            type="button"
                          >
                            編集
                          </button>
                          <button
                            className="inline-flex h-5 items-center justify-center rounded border border-rose-200 bg-rose-50 px-1.5 text-[10px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-rose-50"
                            disabled={isWorking}
                            onClick={() =>
                              deleteLead(
                                row.leadId,
                                row.companyName || "この会社",
                              )
                            }
                            type="button"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function CompanyMetaLine({ row }: { row: LeadManageRow }) {
  const person = [row.contactName, row.contactTitle].filter(Boolean).join(" · ");
  const parts: React.ReactNode[] = [];

  if (row.address) {
    parts.push(
      <span className="text-slate-500" key="address">
        {row.address}
      </span>,
    );
  }
  if (row.websiteUrl) {
    parts.push(
      <a
        className="text-blue-600 hover:text-blue-800"
        href={row.websiteUrl}
        key="website"
        rel="noreferrer"
        target="_blank"
      >
        サイト
      </a>,
    );
  }
  if (row.contactFormUrl) {
    parts.push(
      <a
        className="text-blue-600 hover:text-blue-800"
        href={row.contactFormUrl}
        key="form"
        rel="noreferrer"
        target="_blank"
      >
        フォーム
      </a>,
    );
  }
  if (person) parts.push(<span key="person">{person}</span>);
  if (row.email) parts.push(<span key="email">{row.email}</span>);
  if (row.phone) parts.push(<span key="phone">{row.phone}</span>);

  if (parts.length === 0) {
    return <span className="text-slate-400">連絡先なし</span>;
  }

  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? <span className="text-slate-300"> · </span> : null}
          {part}
        </span>
      ))}
    </>
  );
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
  const canToggle = nextQualifiedMarkStatus(status) !== null;

  const toneClass =
    kind === "qualified"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : kind === "passed"
        ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50";

  if (!canToggle) {
    return (
      <span
        className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10px] font-semibold ${
          kind === "qualified"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : kind === "passed"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-300 bg-white text-slate-600"
        }`}
      >
        {label}
      </span>
    );
  }

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

function leadListStatusToneClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "LOST") return "border-rose-200 bg-rose-50 text-rose-700";
  if (
    normalized === "WON" ||
    normalized === "REPLIED" ||
    normalized === "CONTACTED"
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (
    normalized === "FOLLOW_UP" ||
    normalized === "MEETING" ||
    normalized === "QUALIFIED" ||
    normalized === "RESEARCHED"
  ) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (normalized === "NEW" || normalized === "NOT_CONTACTED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
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
