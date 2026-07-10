export type AnalysisStrategy = {
  objective: string;
  signals: string[];
  sources: string[];
  confidence: "High" | "Medium" | "Low";
};

export type OpportunityResult = {
  id: string;
  companyName: string;
  websiteUrl: string;
  aboutUrl?: string;
  publicEmail?: string;
  contactFormUrl?: string;
  outreachChannelConfidence?: "High" | "Medium" | "Low";
  databaseStatus?: CompanyDatabaseStatus;
  description: string;
  salesBrief: SalesCompanyBrief;
  source: string;
  location: string;
  employees: string;
  industry: string;
  aiOpportunity: string;
  whyThisMatches: string[];
  evidence?: ResultEvidence;
};

export type CompanyDatabaseStatus = {
  state: "new" | "seen" | "saved";
  companyId?: string;
  leadId?: string;
  lastSeenAt?: string;
  seenCount?: number;
};

export type SalesCompanyBrief = {
  businessSummary: string;
  locationEvidence: string;
  industryEvidence: string;
  identityEvidence?: string;
  likelyNeed: string;
  salesAngle: string;
  contactNextStep: string;
  confidence: "High" | "Medium" | "Low";
};

export type CrawledPage = {
  url: string;
  title?: string;
  content: string;
  success: boolean;
  error?: string;
};

export type OpportunitySearchPlan = {
  intentSummary: string;
  targetCompanyProfile: string;
  searchIntent: SearchIntent;
  searchTerms: string[];
  excludeTerms: string[];
  signals: string[];
};

export type SearchIntent = {
  companyIdentity: string[];
  operatingLocation: string[];
  industry: string[];
  requiredEvidence: string[];
  exclude: string[];
};

export type ResultEvidence = {
  passed: string[];
  missing: string[];
  urlType: "homepage" | "about" | "company_profile" | "other";
  matchedIdentity: string[];
  matchedLocation: string[];
  matchedIndustry: string[];
  matchedOfficial: string[];
};

export type SearchAnalyzeResponse = {
  strategy: AnalysisStrategy;
  results: OpportunityResult[];
  meta: {
    analyzedAt: string;
    durationMs: number;
    diagnostics?: SearchDiagnostics;
    searchQueries: string[];
    searchPlan: OpportunitySearchPlan;
    candidateNames?: string[];
    officialLookupQueries?: string[];
    crawledPages: number;
    resultLimit: number;
    usedFallbackAnalysis: boolean;
    searchGoal?: {
      id: string;
      status: "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
      referenceKeyword: string;
      generatedAngles: string[];
      generatedQueries: string[];
      targetCompanyCount: number;
      foundCompanyCount: number;
      attemptCount: number;
      maxAttempts: number;
    };
  };
};

export type SearchDiagnostics = {
  requested: number;
  rawResults: number;
  officialCandidates: number;
  crawlAttempted: number;
  crawledPages: number;
  crawlFailed: number;
  crawlFiltered: number;
  crawlError?: string;
  passedEvidence: number;
  removedByEvidence: number;
  finalShown: number;
};
