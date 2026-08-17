"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { formatIndustryJa } from "@/lib/industries";
import { workflowSteps } from "@/lib/navigation";
import { MAX_TARGET_COMPANY_COUNT } from "@/lib/search-analysis/constants";
import type {
  CompanyDatabaseStatus,
  OpportunityResult,
  SearchAnalyzeResponse,
  SearchDiagnostics,
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
  leadId?: string;
  companyName: string;
  companyUrl?: string;
  leadStatus?: string;
  createdCompany?: boolean;
  createdLead?: boolean;
};

export default function LeadSearchPage() {
  const [referenceKeyword, setReferenceKeyword] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState(
    "求人, 採用, ニュース, 記事, ディレクトリ",
  );
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
  const parsedExcludeKeywords = excludeKeywords
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const canAnalyze = referenceKeyword.trim().length >= 2;
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

    if (!canAnalyze || isAnalyzing) {
      setErrorMessage("Please enter a reference keyword or search goal.");
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
          referenceKeyword: referenceKeyword.trim(),
          industry: industry.trim(),
          location: location.trim(),
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
        query: referenceKeyword.trim(),
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
        leadId: payload.data?.lead?.id,
        companyName: payload.data?.company?.name ?? result.companyName,
        companyUrl: payload.data?.company?.websiteUrl ?? result.websiteUrl,
        leadStatus: payload.data?.lead?.status,
        createdCompany: payload.data?.createdCompany,
        createdLead: payload.data?.createdLead,
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
              Company Search
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Describe the market and find real company websites.
            </p>
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
          <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr_0.7fr_0.8fr_120px_210px] lg:items-start">
            <label className="block text-sm lg:col-span-2">
              <span className="font-semibold text-slate-800">
                Reference keyword / goal
              </span>
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900"
                maxLength={500}
                minLength={2}
                onChange={(event) => setReferenceKeyword(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void handleAnalyze();
                  }
                }}
                placeholder="例: 手作業の帳票作成やExcel運用が多そうな日本の製造業"
                value={referenceKeyword}
              />
              <span className="mt-1 block text-right text-xs text-slate-500">
                {referenceKeyword.length}/500
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Industry</span>
              <div className="mt-2 flex h-11 items-center justify-between rounded-md border border-slate-300 bg-white px-3">
                <input
                  className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none"
                  onChange={(event) => setIndustry(event.currentTarget.value)}
                  value={industry}
                />
                <span className="text-slate-400">v</span>
              </div>
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Location</span>
              <div className="mt-2 flex h-11 items-center justify-between rounded-md border border-slate-300 bg-white px-3">
                <input
                  className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none"
                  onChange={(event) => setLocation(event.currentTarget.value)}
                  value={location}
                />
                <span className="text-slate-400">v</span>
              </div>
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Exclude</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 outline-none"
                onChange={(event) => setExcludeKeywords(event.currentTarget.value)}
                placeholder="求人, ニュース, 会社概要"
                value={excludeKeywords}
              />
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Target companies</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 outline-none"
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
              <p className="mt-2 text-xs text-slate-500">
                Larger searches can take longer. Current max: {MAX_TARGET_COMPANY_COUNT}.
              </p>
            </label>

            <div className="pt-7">
              <button
                className="h-11 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                disabled={isAnalyzing}
                type="submit"
              >
                {isAnalyzing ? "Searching..." : "Search Companies"}
              </button>
              <p className="mx-auto mt-3 max-w-44 text-center text-xs leading-5 text-slate-500">
                {isAnalyzing
                  ? `${analysisStatus ?? "Working..."} ${analysisElapsedSeconds}s`
                  : analysisStatus ??
                    "Search will keep company pages and filter non-company junk"}
              </p>
            </div>
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
              <p className="mt-1 text-xs text-emerald-700">
                {saveReview.createdCompany ? "New company" : "Existing company updated"} ·{" "}
                {saveReview.createdLead ? "new lead" : "existing lead"} · status{" "}
                {saveReview.leadStatus?.toLowerCase() ?? "new"}
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

        {analysisMeta ? (
          <details className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-base font-semibold text-slate-950">
              Search details
            </summary>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr_1.2fr]">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Generated Plan
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {analysisMeta.searchPlan.intentSummary}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-800">
                  {analysisMeta.searchPlan.targetCompanyProfile}
                </p>
                <div className="mt-4 space-y-3 text-xs leading-5">
                  <IntentGroup
                    label="Company identity"
                    values={analysisMeta.searchPlan.searchIntent.companyIdentity}
                  />
                  <IntentGroup
                    label="Operating location"
                    values={analysisMeta.searchPlan.searchIntent.operatingLocation}
                  />
                  <IntentGroup
                    label="Industry"
                    values={analysisMeta.searchPlan.searchIntent.industry}
                  />
                  <IntentGroup
                    label="Required evidence"
                    values={analysisMeta.searchPlan.searchIntent.requiredEvidence}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Keyword Script
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {analysisMeta.searchPlan.searchTerms.map((term) => (
                    <span
                      className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                      key={term}
                    >
                      {term}
                    </span>
                  ))}
                </div>
                {analysisMeta.searchPlan.excludeTerms.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {analysisMeta.searchPlan.excludeTerms.map((term) => (
                      <span
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500"
                        key={term}
                      >
                        -{term}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Search Queries
                </h3>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                  {analysisMeta.searchQueries.map((query) => (
                    <li
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                      key={query}
                    >
                      <span className="font-mono">{query}</span>
                    </li>
                  ))}
                </ul>
                {analysisMeta.candidateNames?.length ? (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Candidate names
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {analysisMeta.candidateNames.map((name) => (
                        <span
                          className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                          key={name}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {analysisMeta.officialLookupQueries?.length ? (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Official lookup
                    </h4>
                    <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
                      {analysisMeta.officialLookupQueries.map((query) => (
                        <li
                          className="rounded-md border border-slate-200 bg-white px-3 py-2"
                          key={query}
                        >
                          <span className="font-mono">{query}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </details>
        ) : null}

        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-950">
                {visibleResults.length} Companies Found
              </h2>
              <Badge tone="emerald">Company pages only</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>
                {analysisMeta
                  ? `Analyzed in ${(analysisMeta.durationMs / 1000).toFixed(1)} seconds`
                  : "Run a search to find live company results"}
              </span>
              {analysisMeta?.usedFallbackAnalysis ? (
                <Badge tone="amber">Fallback analysis</Badge>
              ) : null}
              {analysisMeta ? (
                <Badge tone="slate">Target {analysisMeta.resultLimit}</Badge>
              ) : null}
              {analysisMeta?.searchGoal ? (
                <Badge tone="slate">
                  {analysisMeta.searchGoal.foundCompanyCount}/
                  {analysisMeta.searchGoal.targetCompanyCount}
                </Badge>
              ) : null}
            </div>
          </div>

          {analysisMeta?.diagnostics ? (
            <div className="mb-3 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
                <Metric label="Requested" value={analysisMeta.diagnostics.requested} />
                <Metric label="Raw results" value={analysisMeta.diagnostics.rawResults} />
                <Metric
                  label="Official candidates"
                  value={analysisMeta.diagnostics.officialCandidates}
                />
                <Metric
                  label="Verify tried"
                  value={analysisMeta.diagnostics.crawlAttempted}
                />
                <Metric label="Verified" value={analysisMeta.diagnostics.crawledPages} />
                <Metric
                  label="Passed evidence"
                  value={analysisMeta.diagnostics.passedEvidence}
                />
                <Metric
                  label="Removed"
                  value={analysisMeta.diagnostics.removedByEvidence}
                />
                <Metric
                  label="Already known"
                  value={analysisMeta.diagnostics.skippedKnownDomains ?? 0}
                />
                <Metric label="Final shown" value={analysisMeta.diagnostics.finalShown} />
              </div>
              <p className="mt-2 text-slate-500">
                {resolveSearchDiagnosticMessage(analysisMeta.diagnostics)}
              </p>
            </div>
          ) : null}

          {visibleResults.length > 0 ? (
            <div className="space-y-3">
              {visibleResults.map((result) => (
              <article
                className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_150px]"
                key={result.id}
              >
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-slate-950">
                    {result.companyName}
                  </h3>

                  <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                    <div className="sm:col-span-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Overview
                      </p>
                      <p className="mt-1 leading-6">
                        {result.salesBrief.businessSummary || result.description}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Address
                      </p>
                      <p className="mt-1">{result.location || "Unknown"}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Industry
                      </p>
                      <p className="mt-1">{formatIndustryJa(result.industry) || "未設定"}</p>
                    </div>

                    <div className="sm:col-span-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Homepage URL
                      </p>
                      <a
                        className="mt-1 block break-all text-blue-700 hover:text-blue-800"
                        href={result.websiteUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {result.websiteUrl || "Unknown"}
                      </a>
                    </div>

                    <div className="sm:col-span-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Outreach Channel
                      </p>
                      <div className="mt-2 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-3">
                        <div>
                          <p className="font-semibold text-slate-600">Public email</p>
                          {result.publicEmail ? (
                            <a
                              className="mt-1 block break-all text-blue-700 hover:text-blue-800"
                              href={`mailto:${result.publicEmail}`}
                            >
                              {result.publicEmail}
                            </a>
                          ) : (
                            <p className="mt-1 text-slate-500">None</p>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-600">
                            Contact page/form
                          </p>
                          {result.contactFormUrl ? (
                            <a
                              className="mt-1 block break-all text-blue-700 hover:text-blue-800"
                              href={result.contactFormUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {result.contactFormUrl}
                            </a>
                          ) : (
                            <p className="mt-1 text-slate-500">None</p>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-600">Confidence</p>
                          <p className="mt-1 text-slate-700">
                            {result.outreachChannelConfidence ?? "Low"}
                          </p>
                        </div>
                      </div>
                    </div>
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
                No live company results yet
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Run a search to show verified company websites here. If a search
                returns nothing, adjust the identity, industry, or location terms
                and try again.
              </p>
            </div>
          )}
        </section>
        </div>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="font-semibold text-slate-900">{value}</p>
      <p className="mt-1 leading-4">{label}</p>
    </div>
  );
}

function resolveSearchDiagnosticMessage(diagnostics: SearchDiagnostics) {
  if (diagnostics.rawResults === 0) {
    return "Search returned no raw results, so there were no company URLs to verify.";
  }

  if (diagnostics.officialCandidates === 0) {
    return "Search returned raw results, but none looked like official company homepage or about pages.";
  }

  if (
    diagnostics.finalShown === 0 &&
    (diagnostics.skippedKnownDomains ?? 0) > 0
  ) {
    return `${diagnostics.skippedKnownDomains} matching company pages were already known, so they were skipped. Try a broader product hint or increase the return count to dig deeper.`;
  }

  if (diagnostics.crawlAttempted === 0) {
    return "No verified candidate URLs were available for homepage metadata verification.";
  }

  if (diagnostics.crawledPages === 0) {
    return diagnostics.crawlError
      ? `Homepage verification did not return usable pages: ${diagnostics.crawlError}`
      : "Homepage verification ran, but the pages were empty, blocked, or too short to use.";
  }

  if (diagnostics.crawlFailed > 0 || diagnostics.crawlFiltered > 0) {
    return `${diagnostics.crawledPages} homepage pages were usable; ${diagnostics.crawlFailed} could not be verified.`;
  }

  return "Homepage metadata verification improved the company page content for this search.";
}

function IntentGroup({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-700"
            key={value}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
