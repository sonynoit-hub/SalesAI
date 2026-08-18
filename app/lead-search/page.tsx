"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { workflowSteps } from "@/lib/navigation";
import { MAX_TARGET_COMPANY_COUNT } from "@/lib/search-analysis/constants";
import type {
  CompanyDatabaseStatus,
  OpportunityResult,
  SearchAnalyzeResponse,
} from "@/lib/search-analysis/types";

type SaveLeadResponse = {
  data?: {
    company?: {
      id: string;
      name?: string;
      websiteUrl?: string;
      description?: string | null;
      industry?: string | null;
      location?: string | null;
      seenCount?: number;
    };
    lead?: {
      id: string;
      status?: string;
    };
    createdCompany?: boolean;
    createdLead?: boolean;
  };
  error?: {
    message?: string;
  };
};

type SavedLeadReview = {
  companyId: string;
  companyName: string;
};

const FIXED_SEARCH_TARGET = {
  defaultReferenceKeyword: "中古メモリ ITAD PCリユース 法人パソコン買取",
  industry: "テクノロジー",
  location: "日本",
  searchRole: "buyer" as const,
  excludeKeywords:
    "求人, 採用, ニュース, 記事, ディレクトリ, ランキング, 比較サイト, 家電量販, Amazon, 楽天",
};

export default function LeadSearchPage() {
  const [referenceKeyword, setReferenceKeyword] = useState("");
  const [resultLimit, setResultLimit] = useState(20);
  const [results, setResults] = useState<OpportunityResult[]>([]);
  const [analysisMeta, setAnalysisMeta] = useState<SearchAnalyzeResponse["meta"] | null>(
    null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingResultId, setSavingResultId] = useState<string | null>(null);
  const [savedResultIds, setSavedResultIds] = useState<string[]>([]);
  const [saveReview, setSaveReview] = useState<SavedLeadReview | null>(null);
  const parsedExcludeKeywords = FIXED_SEARCH_TARGET.excludeKeywords
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const searchKeyword =
    referenceKeyword.trim() || FIXED_SEARCH_TARGET.defaultReferenceKeyword;
  const canAnalyze = !isAnalyzing;
  const visibleResults = results;

  useEffect(() => {
    if (!isAnalyzing) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setAnalysisElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  async function handleAnalyze(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!canAnalyze) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysisElapsedSeconds(0);
    setAnalysisStatus("Searching company websites...");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/search/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          referenceKeyword: searchKeyword,
          industry: FIXED_SEARCH_TARGET.industry,
          location: FIXED_SEARCH_TARGET.location,
          searchRole: FIXED_SEARCH_TARGET.searchRole,
          excludeKeywords: parsedExcludeKeywords,
          targetCompanyCount: resultLimit,
        }),
      });

      setAnalysisStatus("Analyzing company fit...");

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "Search analysis failed. Please try again.",
        );
      }

      const data = payload.data as SearchAnalyzeResponse;
      setResults(data.results);
      setAnalysisMeta(data.meta);
      setAnalysisStatus(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Search analysis failed. Please try again.",
      );
      setAnalysisStatus(null);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSaveResult(result: OpportunityResult) {
    if (savingResultId || savedResultIds.includes(result.id)) {
      return;
    }

    setSavingResultId(result.id);
    setSaveReview(null);
    setErrorMessage(null);

    try {
      await saveSearchResult(result, { showReview: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save this company as a lead.",
      );
    } finally {
      setSavingResultId(null);
    }
  }

  async function saveSearchResult(
    result: OpportunityResult,
    { showReview }: { showReview: boolean },
  ) {
    const response = await fetch("/api/leads/from-search-result", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: searchKeyword,
        companyName: result.companyName,
        websiteUrl: result.websiteUrl,
        description: result.description,
        source: result.source,
        sourceUrl: result.aboutUrl ?? result.websiteUrl,
        industry: result.industry,
        location: result.location,
        size: result.employees,
        publicEmail: result.publicEmail,
        contactFormUrl: result.contactFormUrl,
        aiOpportunity: result.salesBrief.salesAngle,
        whyThisMatches: [
          result.salesBrief.businessSummary,
          result.salesBrief.likelyNeed,
          result.salesBrief.contactNextStep,
          ...(result.evidence?.passed ?? []),
        ],
      }),
    });

    const payload = (await response.json()) as SaveLeadResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? "Could not save this company as a lead.",
      );
    }

    const databaseStatus: CompanyDatabaseStatus = {
      state: "saved",
      companyId: payload.data?.company?.id,
      leadId: payload.data?.lead?.id,
      lastSeenAt: new Date().toISOString(),
      seenCount: payload.data?.company?.seenCount,
    };
    const companyId = payload.data?.company?.id;

    setSavedResultIds((current) =>
      current.includes(result.id) ? current : [...current, result.id],
    );
    setResults((current) =>
      current.map((item) =>
        item.id === result.id ? { ...item, databaseStatus } : item,
      ),
    );

    if (showReview && companyId) {
      setSaveReview({
        companyId,
        companyName: payload.data?.company?.name ?? result.companyName,
      });
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 border-r border-slate-200 bg-white px-5 py-6 md:block">
          <Link href="/" className="block">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              SalesAI
            </p>
            <h1 className="mt-2 text-xl font-semibold text-slate-950">
              IT sales workspace
            </h1>
          </Link>
          <nav className="mt-8 space-y-1">
            {workflowSteps.map((item) => (
              <Link
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="flex-1 space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">
              Customer Search
            </h1>
          </div>
          <Link
            className="h-10 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href="/leads"
          >
            Open leads
          </Link>
        </header>

        <form
          className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={handleAnalyze}
        >
          <div className="grid gap-5 md:grid-cols-[1fr_180px] md:items-end">
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">
                Search keyword
              </span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                maxLength={120}
                onChange={(event) => setReferenceKeyword(event.currentTarget.value)}
                placeholder="DDR4, memory, server parts"
                value={referenceKeyword}
              />
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Count</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                max={MAX_TARGET_COMPANY_COUNT}
                min={1}
                onChange={(event) =>
                  setResultLimit(
                    Math.max(
                      1,
                      Math.min(
                        MAX_TARGET_COMPANY_COUNT,
                        Number(event.currentTarget.value) || 1,
                      ),
                    ),
                  )
                }
                placeholder={`1-${MAX_TARGET_COMPANY_COUNT}`}
                step={1}
                type="number"
                value={resultLimit}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              className="h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isAnalyzing}
              type="submit"
            >
              {isAnalyzing ? "Searching..." : "Find Customers"}
            </button>
            {isAnalyzing ? (
              <p className="text-xs leading-5 text-slate-500">
                {analysisStatus ?? "Working..."} {analysisElapsedSeconds}s
              </p>
            ) : null}
          </div>
        </form>

        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {saveReview ? (
          <div className="flex flex-col gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                {saveReview.companyName} saved as a lead.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="inline-flex h-9 items-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                href={`/companies/${saveReview.companyId}`}
              >
                Review company
              </Link>
              <Link
                className="inline-flex h-9 items-center rounded-md border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                href="/leads"
              >
                View leads
              </Link>
            </div>
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-950">
                {visibleResults.length} Potential Customers Found
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>
                {analysisMeta
                  ? `Analyzed in ${(analysisMeta.durationMs / 1000).toFixed(1)} seconds`
                  : "Run a search to find potential customers"}
              </span>
            </div>
          </div>

          {visibleResults.length > 0 ? (
            <div className="space-y-3">
              {visibleResults.map((result) => (
                <article
                  className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_150px]"
                  key={result.id}
                >
                  <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Company
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {result.companyName}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        URL
                      </p>
                      {result.websiteUrl ? (
                        <a
                          className="mt-1 block break-all text-blue-700 hover:text-blue-800"
                          href={result.websiteUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {result.websiteUrl}
                        </a>
                      ) : (
                        <p className="mt-1 text-slate-500">Unknown</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Address
                      </p>
                      <p className="mt-1">{result.location || "Unknown"}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Email
                      </p>
                      {result.publicEmail ? (
                        <a
                          className="mt-1 block break-all text-blue-700 hover:text-blue-800"
                          href={`mailto:${result.publicEmail}`}
                        >
                          {result.publicEmail}
                        </a>
                      ) : result.contactFormUrl ? (
                        <a
                          className="mt-1 block break-all text-blue-700 hover:text-blue-800"
                          href={result.contactFormUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {result.contactFormUrl}
                        </a>
                      ) : (
                        <p className="mt-1 text-slate-500">Unknown</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start lg:justify-end">
                    <button
                      className="h-10 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      disabled={
                        savingResultId === result.id ||
                        savedResultIds.includes(result.id) ||
                        result.databaseStatus?.state === "saved" ||
                        !result.websiteUrl
                      }
                      onClick={() => void handleSaveResult(result)}
                      type="button"
                    >
                      {savingResultId === result.id
                        ? "Saving..."
                        : result.databaseStatus?.state === "saved" ||
                            savedResultIds.includes(result.id)
                          ? "Saved"
                          : "Add to CRM"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
              <h3 className="text-sm font-semibold text-slate-900">
                No potential customers yet
              </h3>
            </div>
          )}
        </section>
        </div>
      </div>
    </main>
  );
}
