import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { EmailDraftStatus } from "@/lib/generated/prisma/client";
import { sendApprovedDraft } from "@/lib/outreach/send-approved-draft";

const testTargets = [
  {
    companyName: "GEM Japan",
    recipientEmail: "nguyendangsony121@gmail.com",
  },
  {
    companyName: "FPTコンサルティングジャパン株式会社",
    recipientEmail: "sonys.vnwa@gmail.com",
  },
  {
    companyName: "TECHVIFY JAPAN",
    recipientEmail: "sonynoit@gmail.com",
  },
  {
    companyName: "株式会社リッケイ",
    recipientEmail: "nystechcoltd@gmail.com",
  },
] as const;

async function main() {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=");
      return [key, value];
    }),
  );
  const provider = args.get("provider") ?? "gmail";
  const dryRun = args.get("dry-run") === "true";
  const delaySeconds = Number(args.get("delay-seconds") ?? "300");

  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) {
    throw new Error("delay-seconds must be a non-negative number.");
  }

  if (provider !== "gmail" && provider !== "manual" && provider !== "outlook") {
    throw new Error("provider must be one of: gmail, manual, outlook.");
  }

  console.log(
    [
      "Starting test batch send",
      `provider=${provider}`,
      `delaySeconds=${delaySeconds}`,
      `dryRun=${dryRun}`,
      `targets=${testTargets.length}`,
    ].join(" | "),
  );

  for (let index = 0; index < testTargets.length; index += 1) {
    const target = testTargets[index];
    const draft = await findApprovedDraft(target.companyName, target.recipientEmail);

    if (!draft) {
      const latestDraft = await findLatestDraft(target.companyName, target.recipientEmail);
      console.log(
        [
          `skip ${index + 1}/${testTargets.length}`,
          target.companyName,
          target.recipientEmail,
          latestDraft
            ? `latestStatus=${latestDraft.status.toLowerCase()}`
            : "no draft found",
        ].join(" | "),
      );
      continue;
    }

    console.log(
      [
        `ready ${index + 1}/${testTargets.length}`,
        target.companyName,
        target.recipientEmail,
        `draftId=${draft.id}`,
        `subject=${draft.subject}`,
      ].join(" | "),
    );

    if (!dryRun) {
      const result = await sendApprovedDraft({
        draftId: draft.id,
        provider,
      });

      console.log(
        [
          `sent ${index + 1}/${testTargets.length}`,
          target.companyName,
          target.recipientEmail,
          `status=${result.delivery.status.toLowerCase()}`,
          `messageId=${result.delivery.messageId ?? "none"}`,
        ].join(" | "),
      );
    }

    if (index < testTargets.length - 1 && delaySeconds > 0) {
      console.log(`waiting ${delaySeconds}s before next send...`);
      await sleep(delaySeconds * 1000);
    }
  }
}

async function findApprovedDraft(companyName: string, recipientEmail: string) {
  const drafts = await prisma.emailDraft.findMany({
    where: {
      status: EmailDraftStatus.APPROVED,
      lead: {
        company: {
          name: companyName,
        },
      },
    },
    include: {
      contact: true,
      lead: {
        include: {
          company: true,
          contact: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return (
    drafts.find((draft) => resolveRecipientEmail(draft)?.toLowerCase() === recipientEmail.toLowerCase()) ??
    null
  );
}

async function findLatestDraft(companyName: string, recipientEmail: string) {
  const drafts = await prisma.emailDraft.findMany({
    where: {
      lead: {
        company: {
          name: companyName,
        },
      },
    },
    include: {
      contact: true,
      lead: {
        include: {
          company: true,
          contact: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return (
    drafts.find((draft) => resolveRecipientEmail(draft)?.toLowerCase() === recipientEmail.toLowerCase()) ??
    null
  );
}

function resolveRecipientEmail(draft: {
  contact: { email: string | null } | null;
  lead: {
    contact: { email: string | null } | null;
    company: { primaryEmail: string | null };
  };
}) {
  return (
    draft.contact?.email ??
    draft.lead.contact?.email ??
    draft.lead.company.primaryEmail
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
