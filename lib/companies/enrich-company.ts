import {
  buildCompanyEnrichmentDraft,
  buildCompanyEnrichmentUpdate,
  isGenericCompanyEmail,
} from "@/lib/company-enrichment";
import { prisma } from "@/lib/db/prisma";

export type EnrichCompanyResult = {
  companyId: string;
  companyName: string;
  ok: boolean;
  primaryEmail: string | null;
  contactFormUrl: string | null;
  newContactCount: number;
  message: string;
};

export async function enrichCompanyRecord(
  companyId: string,
): Promise<EnrichCompanyResult> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      contacts: true,
    },
  });

  if (!company) {
    return {
      companyId,
      companyName: "",
      ok: false,
      primaryEmail: null,
      contactFormUrl: null,
      newContactCount: 0,
      message: "会社が見つかりませんでした。",
    };
  }

  try {
    const draft = await buildCompanyEnrichmentDraft(company);
    const companyUpdate = buildCompanyEnrichmentUpdate({ company, draft });
    const updatedCompany = await prisma.company.update({
      where: { id: company.id },
      data: companyUpdate,
    });

    const existingEmails = new Set(
      company.contacts
        .map((contact) => contact.email?.toLowerCase())
        .filter((email): email is string => Boolean(email)),
    );
    const contactEmails = draft.personEmails.filter(
      (email) => !existingEmails.has(email) && !isGenericCompanyEmail(email),
    );
    const contacts =
      contactEmails.length > 0
        ? await prisma.contact.createManyAndReturn({
            data: contactEmails.map((email) => ({
              companyId: company.id,
              email,
              sourceUrl: draft.sources[0] ?? company.websiteUrl,
            })),
          })
        : [];

    const foundEmail =
      updatedCompany.primaryEmail || contacts[0]?.email || null;
    const foundContactForm = updatedCompany.contactFormUrl;
    const foundAnything = Boolean(foundEmail || foundContactForm);

    return {
      companyId: company.id,
      companyName: company.name,
      ok: true,
      primaryEmail: foundEmail,
      contactFormUrl: foundContactForm,
      newContactCount: contacts.length,
      message: foundAnything
        ? [
            foundEmail ? `メール: ${foundEmail}` : null,
            foundContactForm ? `フォーム: ${foundContactForm}` : null,
            contacts.length > 0 ? `担当者メール ${contacts.length}件追加` : null,
          ]
            .filter(Boolean)
            .join(" / ")
        : draft.diagnostics.length > 0
          ? `公開連絡先なし（${draft.diagnostics.slice(0, 2).join("; ")}）`
          : "公開メール・お問い合わせフォームは見つかりませんでした。",
    };
  } catch (error) {
    return {
      companyId: company.id,
      companyName: company.name,
      ok: false,
      primaryEmail: company.primaryEmail,
      contactFormUrl: company.contactFormUrl,
      newContactCount: 0,
      message:
        error instanceof Error
          ? error.message
          : "連絡先の自動取得に失敗しました。",
    };
  }
}

export async function enrichCompanyRecords(companyIds: string[]) {
  const results: EnrichCompanyResult[] = [];

  for (const companyId of companyIds) {
    results.push(await enrichCompanyRecord(companyId));
  }

  return results;
}
