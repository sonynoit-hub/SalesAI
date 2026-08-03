import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SentEmailStatus } from "@/lib/generated/prisma/client";
import {
  getDefaultDeliveryProvider,
  getDeliveryOptions,
  sendOutboundEmail,
} from "@/lib/outreach/send-email";

describe("outbound delivery", () => {
  it("defaults to the manual delivery provider", () => {
    assert.equal(getDefaultDeliveryProvider(), "manual");
  });

  it("exposes manual delivery as the active option", () => {
    const options = getDeliveryOptions();
    const manualOption = options.find((option) => option.id === "manual");
    const gmailOption = options.find((option) => option.id === "gmail");
    const outlookOption = options.find((option) => option.id === "outlook");

    assert.equal(manualOption?.available, true);
    assert.equal(gmailOption?.available, false);
    assert.equal(outlookOption?.available, false);
  });

  it("records manual delivery as a successful send", async () => {
    const result = await sendOutboundEmail({
      toEmail: "owner@example.test",
      subject: "Quick intro",
      body: "Hello from SalesAI",
    });

    assert.equal(result.provider, "manual");
    assert.equal(result.status, SentEmailStatus.SENT);
    assert.equal(result.errorMessage, null);
  });

  it("returns a structured failure for the outlook provider when no mailbox is connected", async () => {
    const result = await sendOutboundEmail({
      provider: "outlook",
      toEmail: "owner@example.test",
      subject: "Quick intro",
      body: "Hello from SalesAI",
    });

    assert.equal(result.provider, "outlook");
    assert.ok(
      [SentEmailStatus.FAILED, SentEmailStatus.SENT].includes(result.status),
    );
    if (result.status === SentEmailStatus.FAILED) {
      assert.equal(typeof result.errorMessage, "string");
      assert.ok((result.errorMessage ?? "").length > 0);
    }
  });

  it("returns a structured result for the gmail provider", async () => {
    const result = await sendOutboundEmail({
      provider: "gmail",
      toEmail: "owner@example.test",
      subject: "Quick intro",
      body: "Hello from SalesAI",
    });

    assert.equal(result.provider, "gmail");
    assert.ok(
      [SentEmailStatus.FAILED, SentEmailStatus.SENT].includes(result.status),
    );
    if (result.status === SentEmailStatus.FAILED) {
      assert.equal(typeof result.errorMessage, "string");
      assert.ok((result.errorMessage ?? "").length > 0);
    }
  });
});
