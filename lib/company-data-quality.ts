export type CompanyQualityInput = {
  name?: string | null;
  websiteUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  primaryEmail?: string | null;
  contactFormUrl?: string | null;
  contacts?: Array<{
    email?: string | null;
  }>;
};

export type CompanyDataQuality = {
  score: number;
  label: "Ready" | "Partial" | "Needs data";
  missingFields: string[];
  hasOutreachChannel: boolean;
};

const REQUIRED_FIELDS = [
  { key: "name", label: "Name" },
  { key: "websiteUrl", label: "Website" },
  { key: "description", label: "Description" },
  { key: "industry", label: "Industry" },
  { key: "location", label: "Location" },
] as const;

export function assessCompanyDataQuality(
  company: CompanyQualityInput,
): CompanyDataQuality {
  const missingFields: string[] = REQUIRED_FIELDS.filter(
    (field) => !hasText(company[field.key]),
  ).map((field) => field.label);
  const hasOutreachChannel =
    hasText(company.primaryEmail) ||
    hasText(company.contactFormUrl) ||
    Boolean(company.contacts?.some((contact) => hasText(contact.email)));

  if (!hasOutreachChannel) {
    missingFields.push("Email/contact form");
  }

  const totalFields = REQUIRED_FIELDS.length + 1;
  const score = Math.round(
    ((totalFields - missingFields.length) / totalFields) * 100,
  );

  return {
    score,
    label: score >= 100 ? "Ready" : score >= 67 ? "Partial" : "Needs data",
    missingFields,
    hasOutreachChannel,
  };
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}
