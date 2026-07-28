import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { LeadPriority, LeadStatus } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const createContactSchema = z.object({
  companyId: z.string().trim().min(1),
  name: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(80).optional().default(""),
  sourceUrl: z.string().trim().max(500).optional().default(""),
});

const activateContactSchema = z.object({
  action: z.literal("activate").optional().default("activate"),
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
});

const updateContactSchema = z.object({
  action: z.literal("update"),
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
  name: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(80).optional().default(""),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please provide a valid company id and contact info.",
          },
        },
        { status: 400 },
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const phone = parsed.data.phone.trim();
    const hasEmail = email.length > 0;
    const hasPhone = phone.length > 0;

    if (!hasEmail && !hasPhone) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "メールまたは電話番号のどちらかを入力してください。",
          },
        },
        { status: 400 },
      );
    }

    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "有効なメールアドレスを入力してください。",
          },
        },
        { status: 400 },
      );
    }
    const company = await prisma.company.findUnique({
      where: { id: parsed.data.companyId },
      include: {
        leads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!company) {
      return NextResponse.json(
        {
          error: {
            code: "COMPANY_NOT_FOUND",
            message: "Company was not found.",
          },
        },
        { status: 404 },
      );
    }

    const existingContact = hasEmail
      ? await prisma.contact.findFirst({
          where: {
            companyId: company.id,
            email,
          },
        })
      : null;

    const contact = existingContact
      ? await prisma.contact.update({
          where: { id: existingContact.id },
          data: {
            name: parsed.data.name || existingContact.name,
            title: parsed.data.title || existingContact.title,
            phone: phone || existingContact.phone,
            sourceUrl: parsed.data.sourceUrl || existingContact.sourceUrl,
          },
        })
      : await prisma.contact.create({
          data: {
            companyId: company.id,
            name: parsed.data.name || null,
            title: parsed.data.title || null,
            email: email || null,
            phone: phone || null,
            sourceUrl: parsed.data.sourceUrl || company.websiteUrl || null,
          },
        });

    const shouldActivateContact =
      !company.leads[0]?.contactId || company.leads[0]?.contactId === contact.id;
    const lead = company.leads[0]
      ? shouldActivateContact
        ? await prisma.lead.update({
            where: { id: company.leads[0].id },
            data: {
              contactId: contact.id,
            },
          })
        : company.leads[0]
      : await prisma.lead.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            status: LeadStatus.NEW,
            priority: LeadPriority.MEDIUM,
            notes: "Created during manual contact entry.",
          },
        });

    return NextResponse.json({
      data: {
        contact,
        lead,
        activated: shouldActivateContact || !company.leads[0],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CREATE_CONTACT_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not save this contact.",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === "update") {
      return updateContact(body);
    }

    return activateContact(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CONTACT_PATCH_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "担当者の更新に失敗しました。",
        },
      },
      { status: 500 },
    );
  }
}

async function activateContact(body: unknown) {
  const parsed = activateContactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please provide a valid company id and contact id.",
        },
      },
      { status: 400 },
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: parsed.data.companyId },
    include: {
      leads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      contacts: {
        where: { id: parsed.data.contactId },
        take: 1,
      },
    },
  });

  if (!company || company.contacts.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "CONTACT_NOT_FOUND",
          message: "The contact was not found for this company.",
        },
      },
      { status: 404 },
    );
  }

  const lead = company.leads[0]
    ? await prisma.lead.update({
        where: { id: company.leads[0].id },
        data: {
          contactId: parsed.data.contactId,
        },
      })
    : await prisma.lead.create({
        data: {
          companyId: company.id,
          contactId: parsed.data.contactId,
          status: LeadStatus.NEW,
          priority: LeadPriority.MEDIUM,
          notes: "Created while setting the active outreach contact.",
        },
      });

  return NextResponse.json({
    data: {
      lead,
      contact: company.contacts[0],
    },
  });
}

async function updateContact(body: unknown) {
  const parsed = updateContactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "担当者の更新内容が不正です。",
        },
      },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const phone = parsed.data.phone.trim();
  const hasEmail = email.length > 0;
  const hasPhone = phone.length > 0;

  if (!hasEmail && !hasPhone) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "メールまたは電話番号のどちらかを入力してください。",
        },
      },
      { status: 400 },
    );
  }

  if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "有効なメールアドレスを入力してください。",
        },
      },
      { status: 400 },
    );
  }

  const existing = await prisma.contact.findFirst({
    where: {
      id: parsed.data.contactId,
      companyId: parsed.data.companyId,
    },
  });

  if (!existing) {
    return NextResponse.json(
      {
        error: {
          code: "CONTACT_NOT_FOUND",
          message: "担当者が見つかりませんでした。",
        },
      },
      { status: 404 },
    );
  }

  if (hasEmail) {
    const conflict = await prisma.contact.findFirst({
      where: {
        companyId: parsed.data.companyId,
        email,
        id: { not: existing.id },
      },
    });

    if (conflict) {
      return NextResponse.json(
        {
          error: {
            code: "EMAIL_CONFLICT",
            message: "このメールアドレスは別の担当者ですでに使われています。",
          },
        },
        { status: 400 },
      );
    }
  }

  const contact = await prisma.contact.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name || null,
      title: parsed.data.title || null,
      email: email || null,
      phone: phone || null,
    },
  });

  return NextResponse.json({ data: { contact } });
}
