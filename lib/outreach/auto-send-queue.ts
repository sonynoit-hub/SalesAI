import { existsSync, mkdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { EmailDraftStatus, SentEmailStatus } from "@/lib/generated/prisma/client";
import {
  type DeliveryProvider,
  getDefaultDeliveryProvider,
} from "@/lib/outreach/send-email";
import { sendApprovedDraft } from "@/lib/outreach/send-approved-draft";

const autoSendQueuePath = path.join(
  process.cwd(),
  "work",
  "auto-send-queue.json",
);

export type AutoSendQueueStatus =
  | "queued"
  | "paused"
  | "sending"
  | "sent"
  | "failed";

export type AutoSendQueueItem = {
  id: string;
  draftId: string;
  companyId: string;
  companyName: string;
  recipientEmail: string;
  subject: string;
  provider: DeliveryProvider;
  status: AutoSendQueueStatus;
  delayMinutes: number;
  nextSendAt: string;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
  sentEmailId: string | null;
};

type QueueFile = {
  items: AutoSendQueueItem[];
};

export async function getAutoSendQueue() {
  const queue = await readQueueFile();
  return [...queue.items].sort((a, b) => {
    const statusOrder = {
      queued: 0,
      sending: 1,
      paused: 2,
      failed: 3,
      sent: 4,
    } satisfies Record<AutoSendQueueStatus, number>;

    return (
      statusOrder[a.status] - statusOrder[b.status] ||
      new Date(a.nextSendAt).getTime() - new Date(b.nextSendAt).getTime()
    );
  });
}

export async function enqueueAutoSendDraft({
  draftId,
  provider = getDefaultDeliveryProvider(),
  delayMinutes,
}: {
  draftId: string;
  provider?: DeliveryProvider;
  delayMinutes: number;
}) {
  if (!Number.isFinite(delayMinutes) || delayMinutes < 0) {
    throw new Error("Please provide a valid delay in minutes.");
  }

  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    include: {
      contact: true,
      lead: {
        include: {
          company: true,
          contact: true,
        },
      },
    },
  });

  if (!draft) {
    throw new Error("Email draft was not found.");
  }

  if (draft.status !== EmailDraftStatus.APPROVED) {
    throw new Error("Only approved drafts can enter the auto-send queue.");
  }

  const recipientEmail =
    draft.contact?.email ??
    draft.lead.contact?.email ??
    draft.lead.company.primaryEmail;

  if (!recipientEmail) {
    throw new Error("This draft does not have a recipient email yet.");
  }

  const queue = await readQueueFile();
  const existingItem = queue.items.find(
    (item) =>
      item.draftId === draftId &&
      ["queued", "paused", "sending"].includes(item.status),
  );
  const now = new Date();
  const nextSendAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();

  if (existingItem) {
    existingItem.provider = provider;
    existingItem.delayMinutes = delayMinutes;
    existingItem.status = existingItem.status === "sending" ? "sending" : "queued";
    existingItem.nextSendAt = nextSendAt;
    existingItem.updatedAt = now.toISOString();
    existingItem.lastError = null;

    await writeQueueFile(queue);
    return existingItem;
  }

  const item: AutoSendQueueItem = {
    id: randomUUID(),
    draftId,
    companyId: draft.lead.companyId,
    companyName: draft.lead.company.name,
    recipientEmail,
    subject: draft.subject,
    provider,
    status: "queued",
    delayMinutes,
    nextSendAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastAttemptAt: null,
    lastError: null,
    sentEmailId: null,
  };

  queue.items.push(item);
  await writeQueueFile(queue);
  return item;
}

export async function pauseAutoSendQueueItem(itemId: string) {
  return mutateQueueItem(itemId, (item) => {
    if (item.status === "sending") {
      throw new Error("A send already in progress cannot be paused.");
    }

    item.status = "paused";
    item.updatedAt = new Date().toISOString();
  });
}

export async function resumeAutoSendQueueItem(itemId: string) {
  return mutateQueueItem(itemId, (item) => {
    item.status = "queued";
    item.nextSendAt = new Date(
      Date.now() + item.delayMinutes * 60_000,
    ).toISOString();
    item.updatedAt = new Date().toISOString();
    item.lastError = null;
  });
}

export async function removeAutoSendQueueItem(itemId: string) {
  const queue = await readQueueFile();
  const nextItems = queue.items.filter((item) => item.id !== itemId);

  if (nextItems.length === queue.items.length) {
    throw new Error("Queue item was not found.");
  }

  queue.items = nextItems;
  await writeQueueFile(queue);
}

export async function processDueAutoSendQueue(limit = 1) {
  const queue = await readQueueFile();
  const dueItems = queue.items
    .filter(
      (item) =>
        item.status === "queued" &&
        new Date(item.nextSendAt).getTime() <= Date.now(),
    )
    .slice(0, limit);

  const results: Array<{
    item: AutoSendQueueItem;
    ok: boolean;
    message: string;
  }> = [];

  for (const dueItem of dueItems) {
    const sendingItem = updateInMemoryItem(queue, dueItem.id, (item) => {
      item.status = "sending";
      item.lastAttemptAt = new Date().toISOString();
      item.updatedAt = new Date().toISOString();
      item.lastError = null;
    });
    await writeQueueFile(queue);

    try {
      const result = await sendApprovedDraft({
        draftId: dueItem.draftId,
        provider: dueItem.provider,
      });

      if (result.delivery.status === SentEmailStatus.FAILED) {
        const failedItem = updateInMemoryItem(queue, dueItem.id, (item) => {
          item.status = "failed";
          item.sentEmailId = result.sentEmail.id;
          item.updatedAt = new Date().toISOString();
          item.lastError =
            result.delivery.errorMessage ?? "Auto send delivery failed.";
        });
        await writeQueueFile(queue);
        results.push({
          item: failedItem,
          ok: false,
          message:
            result.delivery.errorMessage ?? "Auto send delivery failed.",
        });
      } else {
        const finishedItem = updateInMemoryItem(queue, dueItem.id, (item) => {
          item.status = "sent";
          item.sentEmailId = result.sentEmail.id;
          item.updatedAt = new Date().toISOString();
          item.lastError = null;
        });
        await writeQueueFile(queue);
        results.push({
          item: finishedItem,
          ok: true,
          message: result.delivery.messageId ?? "sent",
        });
      }
    } catch (error) {
      const failedItem = updateInMemoryItem(queue, dueItem.id, (item) => {
        item.status = "failed";
        item.updatedAt = new Date().toISOString();
        item.lastError =
          error instanceof Error ? error.message : "Auto send failed.";
      });
      await writeQueueFile(queue);
      results.push({
        item: failedItem,
        ok: false,
        message:
          error instanceof Error ? error.message : "Auto send failed.",
      });
    }

    void sendingItem;
  }

  return results;
}

async function mutateQueueItem(
  itemId: string,
  mutate: (item: AutoSendQueueItem) => void,
) {
  const queue = await readQueueFile();
  const item = updateInMemoryItem(queue, itemId, mutate);
  await writeQueueFile(queue);
  return item;
}

function updateInMemoryItem(
  queue: QueueFile,
  itemId: string,
  mutate: (item: AutoSendQueueItem) => void,
) {
  const item = queue.items.find((entry) => entry.id === itemId);

  if (!item) {
    throw new Error("Queue item was not found.");
  }

  mutate(item);
  return item;
}

async function readQueueFile(): Promise<QueueFile> {
  if (!existsSync(autoSendQueuePath)) {
    return { items: [] };
  }

  try {
    const raw = await fs.readFile(autoSendQueuePath, "utf8");
    const parsed = JSON.parse(raw) as QueueFile;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { items: [] };
  }
}

async function writeQueueFile(queue: QueueFile) {
  mkdirSync(path.dirname(autoSendQueuePath), { recursive: true });
  await fs.writeFile(autoSendQueuePath, JSON.stringify(queue, null, 2), "utf8");
}
