import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

export type ContactEventChannel = "email" | "phone";
export type ContactEventType = "contacted" | "replied" | "attempt_failed";

type DbExecutor = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

type ContactEventRow = {
  leadId: string;
  channel: ContactEventChannel;
  eventType: ContactEventType;
  eventAt: Date;
};

export type LeadContactEvents = {
  emailContactedAt: Date | null;
  phoneContactedAt: Date | null;
  emailRepliedAt: Date | null;
};

export async function logContactEvent(
  db: DbExecutor,
  {
    leadId,
    channel,
    eventType,
    eventAt = new Date(),
    source,
    note,
    referenceId,
  }: {
    leadId: string;
    channel: ContactEventChannel;
    eventType: ContactEventType;
    eventAt?: Date;
    source?: string | null;
    note?: string | null;
    referenceId?: string | null;
  },
) {
  await db.$executeRaw`
    INSERT INTO "contact_events"
      ("id", "lead_id", "channel", "event_type", "event_at", "source", "note", "reference_id", "created_at")
    VALUES
      (${randomUUID()}, ${leadId}, ${channel}, ${eventType}, ${eventAt}, ${source ?? null}, ${note ?? null}, ${referenceId ?? null}, NOW())
  `;
}

export async function getLatestContactEventsByLeadIds(leadIds: string[]) {
  if (leadIds.length === 0) {
    return new Map<string, LeadContactEvents>();
  }

  const placeholders = leadIds.map((_, index) => `$${index + 1}`).join(", ");
  const map = new Map<string, LeadContactEvents>();
  for (const leadId of leadIds) {
    map.set(leadId, {
      emailContactedAt: null,
      phoneContactedAt: null,
      emailRepliedAt: null,
    });
  }

  let rows: ContactEventRow[] = [];
  try {
    rows = await prisma.$queryRawUnsafe<ContactEventRow[]>(
      `
        SELECT DISTINCT ON ("lead_id", "channel", "event_type")
          "lead_id" AS "leadId",
          "channel" AS "channel",
          "event_type" AS "eventType",
          "event_at" AS "eventAt"
        FROM "contact_events"
        WHERE "lead_id" IN (${placeholders})
        ORDER BY "lead_id", "channel", "event_type", "event_at" DESC, "created_at" DESC
      `,
      ...leadIds,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      /relation "contact_events" does not exist/i.test(message) ||
      /tabledoesnotexist/i.test(message)
    ) {
      return map;
    }
    throw error;
  }

  for (const row of rows) {
    const current = map.get(row.leadId);
    if (!current) continue;

    if (row.channel === "email" && row.eventType === "contacted") {
      current.emailContactedAt = row.eventAt;
      continue;
    }

    if (row.channel === "phone" && row.eventType === "contacted") {
      current.phoneContactedAt = row.eventAt;
      continue;
    }

    if (row.channel === "email" && row.eventType === "replied") {
      current.emailRepliedAt = row.eventAt;
    }
  }

  return map;
}
