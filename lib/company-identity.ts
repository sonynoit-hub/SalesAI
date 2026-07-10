export type CompanyIdentity = {
  canonicalWebsiteUrl: string;
  normalizedDomain: string;
  companyKey: string;
};

const DOMAIN_PREFIX_PATTERN = /^(www|m|corp|corporate)\./i;

export function buildCompanyIdentity(value: string): CompanyIdentity | null {
  try {
    const url = new URL(value);
    const normalizedDomain = normalizeDomain(url.hostname);

    if (!normalizedDomain) {
      return null;
    }

    return {
      canonicalWebsiteUrl: `${url.protocol}//${normalizedDomain}`,
      normalizedDomain,
      companyKey: normalizedDomain.replace(/\.(co|ne|or|com)\.jp$/i, "").replace(/\.[^.]+$/i, ""),
    };
  } catch {
    return null;
  }
}

export function normalizeCompanyWebsiteUrl(value: string) {
  const identity = buildCompanyIdentity(value);
  return identity?.canonicalWebsiteUrl ?? value;
}

function normalizeDomain(value: string) {
  return value
    .toLowerCase()
    .replace(DOMAIN_PREFIX_PATTERN, "")
    .replace(/\.$/, "")
    .trim();
}
