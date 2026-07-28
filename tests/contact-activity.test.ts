import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addOrReplaceLeadEventTag,
  LEAD_TAG_EMAIL_CONTACTED,
  LEAD_TAG_EMAIL_REPLIED,
  LEAD_TAG_PHONE_CONTACTED,
} from "@/lib/leads/constants";
import { deriveLeadContactActivity } from "@/lib/leads/contact-activity";

describe("contact activity derivation", () => {
  it("derives channel flags and timestamps from event-tag values", () => {
    const base = new Date("2026-07-28T10:00:00.000Z");
    let tags: string[] = [];
    tags = addOrReplaceLeadEventTag(tags, LEAD_TAG_EMAIL_CONTACTED, base);
    tags = addOrReplaceLeadEventTag(
      tags,
      LEAD_TAG_PHONE_CONTACTED,
      new Date("2026-07-28T11:00:00.000Z"),
    );
    tags = addOrReplaceLeadEventTag(
      tags,
      LEAD_TAG_EMAIL_REPLIED,
      new Date("2026-07-28T12:00:00.000Z"),
    );

    const activity = deriveLeadContactActivity({ tags });

    assert.equal(activity.hasEmailContact, true);
    assert.equal(activity.hasPhoneContact, true);
    assert.equal(activity.hasEmailReply, true);
    assert.equal(activity.emailContactedAt?.toISOString(), base.toISOString());
    assert.equal(
      activity.phoneContactedAt?.toISOString(),
      "2026-07-28T11:00:00.000Z",
    );
    assert.equal(
      activity.emailRepliedAt?.toISOString(),
      "2026-07-28T12:00:00.000Z",
    );
  });

  it("prefers structured event timestamps over legacy tags", () => {
    const activity = deriveLeadContactActivity({
      tags: [`${LEAD_TAG_EMAIL_CONTACTED}@2026-01-01T00:00:00.000Z`],
      events: {
        emailContactedAt: new Date("2026-02-02T00:00:00.000Z"),
        phoneContactedAt: null,
        emailRepliedAt: null,
      },
    });

    assert.equal(
      activity.emailContactedAt?.toISOString(),
      "2026-02-02T00:00:00.000Z",
    );
    assert.equal(activity.hasEmailContact, true);
  });
});
