import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  buildEmailTemplateContext,
  getEmailTemplate,
  renderEmailTemplate,
} from "@/lib/email-templates";
import {
  EmailDraftStatus,
  EmailLanguage,
  EmailTone,
  LeadPriority,
  LeadStatus,
  SentEmailStatus,
} from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const createDraftSchema = z.object({
  companyId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createDraftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "会社IDを指定してください。",
          },
        },
        { status: 400 },
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: parsed.data.companyId },
      include: {
        contacts: {
          orderBy: { updatedAt: "desc" },
          take: 5,
        },
        leads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            contact: true,
            emailDrafts: {
              where: {
                status: {
                  in: [EmailDraftStatus.DRAFT, EmailDraftStatus.APPROVED],
                },
              },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
            sentEmails: {
              where: { status: SentEmailStatus.SENT },
              orderBy: { sentAt: "desc" },
              take: 1,
            },
          },
        },
        research: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!company) {
      return NextResponse.json(
        {
          error: {
            code: "COMPANY_NOT_FOUND",
            message: "会社が見つかりませんでした。",
          },
        },
        { status: 404 },
      );
    }

    const existingLead = company.leads[0];
    const lead =
      existingLead ??
      (await prisma.lead.create({
        data: {
          companyId: company.id,
          contactId: company.contacts[0]?.id,
          status: LeadStatus.NEW,
          priority: LeadPriority.MEDIUM,
          notes: "Created during draft generation.",
        },
      }));

    if (existingLead?.emailDrafts[0]) {
      return NextResponse.json({ data: existingLead.emailDrafts[0] });
    }

    const contact = lead.contact ?? company.contacts[0];
    const research = company.research[0];
    const previousSent = existingLead?.sentEmails[0] ?? null;
    const recipientName = contact?.name?.split(/\s+/)[0] ?? "ご担当者";
    const isFollowUp = Boolean(previousSent);

    const draftContent = buildDraftContent({
      companyName: company.name,
      recipientName,
      industry: company.industry,
      location: company.location,
      websiteUrl: company.websiteUrl,
      companyDescription: company.description,
      painPoints: research?.painPoints,
      salesOpportunities: research?.salesOpportunities,
      researchSummary: research?.summary,
      isFollowUp,
      previousSubject: previousSent?.subject,
    });

    const draft = await prisma.emailDraft.create({
      data: {
        leadId: lead.id,
        contactId: contact?.id,
        subject: draftContent.subject,
        body: draftContent.body,
        tone: draftContent.tone,
        language: draftContent.language,
        status: EmailDraftStatus.DRAFT,
      },
    });

    return NextResponse.json({ data: draft });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CREATE_DRAFT_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "下書きを作成できませんでした。",
        },
      },
      { status: 500 },
    );
  }
}

function buildDraftContent({
  companyName,
  recipientName,
  industry,
  location,
  websiteUrl,
  companyDescription,
  painPoints,
  salesOpportunities,
  researchSummary,
  isFollowUp,
  previousSubject,
}: {
  companyName: string;
  recipientName: string;
  industry?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  companyDescription?: string | null;
  painPoints?: string[];
  salesOpportunities?: string[];
  researchSummary?: string | null;
  isFollowUp: boolean;
  previousSubject?: string | null;
}) {
  if (isFollowUp) {
    const name = companyName.trim() || "御社";
    return {
      subject: `【ご連絡】${name} フォローアップ`,
      body: [
        `${recipientName} 様`,
        "",
        "先日お送りしたメールの件で、改めてご連絡いたしました。",
        ...(previousSubject ? [`（件名: ${previousSubject}）`, ""] : []),
        "ご都合のよいタイミングで、短くご確認いただけますと幸いです。",
        "",
        researchSummary?.trim()
          ? `補足メモ:\n${researchSummary.trim()}`
          : "必要であれば、具体的な改善ポイントを短くお送りします。",
        "",
        "何卒よろしくお願いいたします。",
      ].join("\n"),
      tone: EmailTone.PROFESSIONAL,
      language: EmailLanguage.JA,
    };
  }

  const template = getEmailTemplate("intro-quick-audit");
  if (template) {
    const rendered = renderEmailTemplate(
      template,
      buildEmailTemplateContext({
        companyName,
        recipientName,
        industry,
        location,
        websiteUrl,
        companyDescription,
        painPoints,
        salesOpportunities,
      }),
    );
    return rendered;
  }

  const name = companyName.trim() || "御社";
  return {
    subject: `${name}についてご相談`,
    body: [
      `${recipientName} 様`,
      "",
      `${name}について、業務改善のご提案がありご連絡しました。`,
      "",
      "短いご提案をお送りしてもよろしいでしょうか。",
      "",
      "何卒よろしくお願いいたします。",
    ].join("\n"),
    tone: EmailTone.PROFESSIONAL,
    language: EmailLanguage.JA,
  };
}
