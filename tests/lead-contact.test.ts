import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeadStatus } from "@/lib/generated/prisma/client";
import {
  latestLeadProgressAt,
  leadMatchesProgressFilter,
  leadMatchesQualifyFilter,
  leadMatchesStatusFilter,
  leadProgressEventLabel,
  leadStatusLabelJa,
  nextQualifiedMarkStatus,
  qualifyMarkLabel,
  resolveLeadProgressStatus,
  resolveLeadStatusAfterContact,
  resolveQualifyMark,
} from "@/lib/leads/status";

describe("lead status helpers", () => {
  it("maps lead statuses to Japanese labels", () => {
    assert.equal(leadStatusLabelJa("NEW"), "新規");
    assert.equal(leadStatusLabelJa("contacted"), "連絡済み");
    assert.equal(leadStatusLabelJa("MEETING"), "商談中");
    assert.equal(leadStatusLabelJa("NOT_CONTACTED"), "未連絡");
    assert.equal(leadStatusLabelJa("RESEARCHED"), "見送り");
  });

  it("keeps Confirm marks when logging outreach contact", () => {
    assert.equal(resolveLeadStatusAfterContact(LeadStatus.NEW), LeadStatus.NEW);
    assert.equal(
      resolveLeadStatusAfterContact(LeadStatus.QUALIFIED),
      LeadStatus.QUALIFIED,
    );
    assert.equal(
      resolveLeadStatusAfterContact(LeadStatus.RESEARCHED),
      LeadStatus.RESEARCHED,
    );
  });

  it("still maps unknown pre-pipeline statuses to contacted", () => {
    assert.equal(resolveLeadStatusAfterContact("SOURCED"), "CONTACTED");
  });

  it("does not downgrade replied or later statuses", () => {
    assert.equal(
      resolveLeadStatusAfterContact(LeadStatus.REPLIED),
      LeadStatus.REPLIED,
    );
    assert.equal(
      resolveLeadStatusAfterContact(LeadStatus.WON),
      LeadStatus.WON,
    );
  });

  it("filters rows by status groups", () => {
    assert.equal(leadMatchesStatusFilter("NEW", "not_yet"), true);
    assert.equal(leadMatchesStatusFilter("CONTACTED", "not_yet"), false);
    assert.equal(leadMatchesStatusFilter("CONTACTED", "contacted"), true);
    assert.equal(leadMatchesStatusFilter("REPLIED", "replied"), true);
    assert.equal(leadMatchesStatusFilter("WON", "closed"), true);
    assert.equal(leadMatchesStatusFilter("NEW", "all"), true);
  });
});

describe("lead progress helpers", () => {
  const none = {
    hasEmailContact: false,
    hasPhoneContact: false,
    hasEmailReply: false,
  };

  it("derives outreach progress from channel activity with legacy status fallback", () => {
    assert.equal(resolveLeadProgressStatus("NEW", none), "NOT_CONTACTED");
    assert.equal(resolveLeadProgressStatus("QUALIFIED", none), "NOT_CONTACTED");
    assert.equal(resolveLeadProgressStatus("CONTACTED", none), "CONTACTED");
    assert.equal(resolveLeadProgressStatus("REPLIED", none), "REPLIED");
    assert.equal(
      resolveLeadProgressStatus("NEW", { ...none, hasEmailContact: true }),
      "CONTACTED",
    );
    assert.equal(
      resolveLeadProgressStatus("NEW", { ...none, hasPhoneContact: true }),
      "CONTACTED",
    );
    assert.equal(
      resolveLeadProgressStatus("CONTACTED", { ...none, hasEmailReply: true }),
      "REPLIED",
    );
    assert.equal(
      resolveLeadProgressStatus("WON", { ...none, hasEmailReply: true }),
      "WON",
    );
  });

  it("filters by derived progress, not only stored status", () => {
    assert.equal(
      leadMatchesProgressFilter("NEW", { ...none, hasEmailContact: true }, "contacted"),
      true,
    );
    assert.equal(
      leadMatchesProgressFilter("NEW", { ...none, hasEmailContact: true }, "not_yet"),
      false,
    );
    assert.equal(
      leadMatchesProgressFilter("NEW", { ...none, hasEmailReply: true }, "replied"),
      true,
    );
    assert.equal(
      leadMatchesProgressFilter(
        "REPLIED",
        { ...none, hasEmailContact: true, hasEmailReply: true },
        "contacted",
      ),
      false,
    );
  });

  it("picks latest progress date and event label", () => {
    const emailAt = new Date("2026-08-01T10:00:00Z");
    const callAt = new Date("2026-08-02T10:00:00Z");
    const replyAt = new Date("2026-08-03T10:00:00Z");
    const fallback = new Date("2026-07-01T10:00:00Z");

    const latest = latestLeadProgressAt(
      {
        emailContactedAt: emailAt,
        phoneContactedAt: callAt,
        emailRepliedAt: replyAt,
      },
      fallback,
    );
    assert.equal(latest.getTime(), replyAt.getTime());
    assert.equal(
      leadProgressEventLabel(
        {
          emailContactedAt: emailAt,
          phoneContactedAt: callAt,
          emailRepliedAt: replyAt,
        },
        latest,
      ),
      "返信",
    );
  });
});

describe("qualify mark helpers", () => {
  it("resolves three mark states", () => {
    assert.equal(resolveQualifyMark("NEW"), "unconfirmed");
    assert.equal(resolveQualifyMark("QUALIFIED"), "qualified");
    assert.equal(resolveQualifyMark("RESEARCHED"), "passed");
    assert.equal(resolveQualifyMark("CONTACTED"), "qualified");
    assert.equal(resolveQualifyMark("LOST"), "passed");
    assert.equal(qualifyMarkLabel("passed"), "見送り");
  });

  it("cycles 未確認 → 見込み → 見送り → 未確認", () => {
    assert.equal(nextQualifiedMarkStatus("NEW"), "QUALIFIED");
    assert.equal(nextQualifiedMarkStatus("QUALIFIED"), "RESEARCHED");
    assert.equal(nextQualifiedMarkStatus("RESEARCHED"), "NEW");
    assert.equal(nextQualifiedMarkStatus("CONTACTED"), "RESEARCHED");
    assert.equal(nextQualifiedMarkStatus("LOST"), "NEW");
  });

  it("filters by qualify mark including 見送り", () => {
    assert.equal(leadMatchesQualifyFilter("NEW", "unconfirmed"), true);
    assert.equal(leadMatchesQualifyFilter("QUALIFIED", "qualified"), true);
    assert.equal(leadMatchesQualifyFilter("RESEARCHED", "passed"), true);
    assert.equal(leadMatchesQualifyFilter("NEW", "passed"), false);
  });
});

describe("manual email contact helper", () => {
  it("exports markManualEmailContact", async () => {
    const contactModule = await import("@/lib/leads/mark-manual-email-contact");
    assert.equal(typeof contactModule.markManualEmailContact, "function");
  });
});
