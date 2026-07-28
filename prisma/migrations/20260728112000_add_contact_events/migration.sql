CREATE TABLE "contact_events" (
  "id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "event_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT,
  "note" TEXT,
  "reference_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contact_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_events_channel_check" CHECK ("channel" IN ('email', 'phone')),
  CONSTRAINT "contact_events_event_type_check" CHECK ("event_type" IN ('contacted', 'replied', 'attempt_failed'))
);

CREATE INDEX "contact_events_lead_id_idx" ON "contact_events"("lead_id");
CREATE INDEX "contact_events_event_at_idx" ON "contact_events"("event_at");
CREATE INDEX "contact_events_channel_event_type_idx" ON "contact_events"("channel", "event_type");
