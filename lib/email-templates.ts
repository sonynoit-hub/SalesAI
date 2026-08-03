import { EmailLanguage, EmailTone } from "@/lib/generated/prisma/client";

export type EmailTemplate = {
  id: string;
  name: string;
  description: string;
  subjectTemplate: string;
  bodyTemplate: string;
  tone: EmailTone;
  language: EmailLanguage;
};

export type EmailTemplateContext = {
  companyName: string;
  recipientFirstName: string;
  industry: string;
  location: string;
  websiteUrl: string;
  companyDescription: string;
  topPainPoint: string;
  topOpportunity: string;
};

export const emailTemplates: EmailTemplate[] = [
  {
    id: "intro-quick-audit",
    name: "Quick audit",
    description: "Short first-touch email offering a lightweight improvement review.",
    subjectTemplate: "Idea for {{companyName}}",
    bodyTemplate: [
      "Hello {{recipientFirstName}},",
      "",
      "I was reviewing {{companyName}} and noticed a possible opportunity around {{topOpportunity}}.",
      "",
      "We usually help {{industry}} teams simplify that kind of workflow without forcing a large system change.",
      "",
      "Would it be useful if I sent over a short audit with 2 or 3 practical ideas specific to {{companyName}}?",
      "",
      "Best regards,",
    ].join("\n"),
    tone: EmailTone.PROFESSIONAL,
    language: EmailLanguage.EN,
  },
  {
    id: "pain-point-follow-up",
    name: "Pain point follow-up",
    description: "Lead with a likely pain point from research and invite a short discussion.",
    subjectTemplate: "{{companyName}} and {{topPainPoint}}",
    bodyTemplate: [
      "Hello {{recipientFirstName}},",
      "",
      "I came across {{companyName}} while looking at {{industry}} companies in {{location}}.",
      "",
      "One thing that stood out was the chance that {{topPainPoint}} may be slowing internal sales or delivery work.",
      "",
      "If that is relevant, I can put together a very short note on how teams usually reduce that friction.",
      "",
      "Would you be open to that?",
      "",
      "Best regards,",
    ].join("\n"),
    tone: EmailTone.FRIENDLY,
    language: EmailLanguage.EN,
  },
  {
    id: "direct-value-prop",
    name: "Direct value prop",
    description: "More direct outreach for leads that already look qualified.",
    subjectTemplate: "{{companyName}} workflow suggestion",
    bodyTemplate: [
      "Hello {{recipientFirstName}},",
      "",
      "I am reaching out because {{companyName}} looks like a strong fit for a focused workflow improvement around {{topOpportunity}}.",
      "",
      "Based on your public company information, there may be room to improve speed, consistency, and follow-up visibility without adding a heavy process.",
      "",
      "If useful, I can send a one-page suggestion tailored to {{companyName}}.",
      "",
      "Regards,",
    ].join("\n"),
    tone: EmailTone.DIRECT,
    language: EmailLanguage.EN,
  },
];

export function getEmailTemplate(templateId: string) {
  return emailTemplates.find((template) => template.id === templateId) ?? null;
}

export function buildEmailTemplateContext({
  companyDescription,
  companyName,
  industry,
  location,
  painPoints,
  recipientName,
  salesOpportunities,
  websiteUrl,
}: {
  companyDescription?: string | null;
  companyName?: string | null;
  industry?: string | null;
  location?: string | null;
  painPoints?: string[];
  recipientName?: string | null;
  salesOpportunities?: string[];
  websiteUrl?: string | null;
}): EmailTemplateContext {
  const cleanedCompanyName = companyName?.trim() || "your team";
  const firstName = recipientName?.trim().split(/\s+/)[0] || "there";
  const cleanedIndustry = industry?.trim() || "B2B";
  const cleanedLocation = location?.trim() || "your market";
  const cleanedDescription =
    companyDescription?.trim() || `${cleanedCompanyName} appears to be an active company in ${cleanedIndustry}.`;
  const topPainPoint =
    painPoints?.find(Boolean)?.trim() ||
    "manual outreach coordination may be creating extra work";
  const topOpportunity =
    salesOpportunities?.find(Boolean)?.trim() ||
    companyDescription?.trim() ||
    "a small workflow improvement";

  return {
    companyName: cleanedCompanyName,
    recipientFirstName: firstName,
    industry: cleanedIndustry,
    location: cleanedLocation,
    websiteUrl: websiteUrl?.trim() || "the company website",
    companyDescription: cleanedDescription,
    topPainPoint,
    topOpportunity,
  };
}

export function renderEmailTemplate(
  template: EmailTemplate,
  context: EmailTemplateContext,
) {
  return {
    subject: renderTemplateString(template.subjectTemplate, context),
    body: renderTemplateString(template.bodyTemplate, context),
    tone: template.tone,
    language: template.language,
  };
}

function renderTemplateString(
  input: string,
  context: EmailTemplateContext,
) {
  return input.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_, key: string) => {
    const value = context[key as keyof EmailTemplateContext];
    return typeof value === "string" ? value : "";
  });
}
