"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportResponse = {
  data?: {
    importedCount: number;
    failedCount: number;
    createdCompanyCount: number;
    createdLeadCount: number;
    failures: Array<{
      rowNumber: number;
      companyName?: string;
      message: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

export function LeadsExcelImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [failurePreview, setFailurePreview] = useState<string[]>([]);

  async function uploadFile(file: File) {
    if (isUploading) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFailurePreview([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/leads/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "Excelファイルをインポートできませんでした。",
        );
      }

      const { importedCount, failedCount, createdCompanyCount, createdLeadCount } =
        payload.data;

      setSuccessMessage(
        `${importedCount}件をインポートしました（新規会社 ${createdCompanyCount}件、新規リード ${createdLeadCount}件）。${
          failedCount > 0 ? ` ${failedCount}件は失敗しました。` : ""
        }`,
      );
      setFailurePreview(
        payload.data.failures.slice(0, 5).map((failure) => {
          const label = failure.companyName
            ? `${failure.rowNumber}行目（${failure.companyName}）`
            : `${failure.rowNumber}行目`;
          return `${label}: ${failure.message}`;
        }),
      );
      setIsOpen(true);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Excelファイルをインポートできませんでした。",
      );
      setIsOpen(true);
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    void uploadFile(file);
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">Excelインポート</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            .xlsx / .xls / .csv から会社・リードを一括追加
          </p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm">
          {isOpen ? "閉じる" : "開く"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-600">
            対応ヘッダー例：{" "}
            <span className="font-mono text-[11px] text-slate-700">
              公司名称 / 会社名, 官网 / URL, 都道府县 / 所在地, 地址 / 住所
            </span>
          </p>

          <div
            className={`mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-center transition ${
              isDragging
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-300 bg-slate-50 hover:border-slate-400"
            } ${isUploading ? "pointer-events-none opacity-70" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <p className="text-xs font-medium text-slate-900">
              {isUploading
                ? "インポート中…"
                : "ファイルをドロップ、またはクリックして選択"}
            </p>
            <input
              ref={inputRef}
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              type="file"
              onChange={(event) => handleFiles(event.target.files)}
            />
          </div>

          {successMessage ? (
            <p className="mt-2 text-xs text-emerald-700">{successMessage}</p>
          ) : null}
          {errorMessage ? (
            <p className="mt-2 text-xs text-rose-700">{errorMessage}</p>
          ) : null}
          {failurePreview.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] text-amber-800">
              {failurePreview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!isOpen && (successMessage || errorMessage) ? (
        <div className="mt-2 text-xs">
          {successMessage ? (
            <p className="text-emerald-700">{successMessage}</p>
          ) : null}
          {errorMessage ? <p className="text-rose-700">{errorMessage}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
