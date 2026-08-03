import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCompanyEnrichmentUpdate,
  isGenericCompanyEmail,
} from "@/lib/company-enrichment";

describe("company enrichment", () => {
  it("fills missing company fields from enrichment without overwriting existing values", () => {
    const update = buildCompanyEnrichmentUpdate({
      company: {
        id: "company-1",
        name: "Example Systems",
        websiteUrl: "https://example.test",
        description: "Existing description",
        industry: null,
        location: "Tokyo",
        primaryEmail: null,
        contactFormUrl: null,
      },
      draft: {
        description: "Suggested description",
        industry: "ソフトウェア",
        location: "Osaka",
        primaryEmail: "info@example.test",
        contactFormUrl: "https://example.test/contact",
        personEmails: [],
        sources: ["https://example.test"],
        diagnostics: [],
      },
    });

    assert.deepEqual(update, {
      description: "Existing description",
      industry: "ソフトウェア",
      location: "Tokyo",
      primaryEmail: "info@example.test",
      contactFormUrl: "https://example.test/contact",
    });
  });

  it("separates generic company emails from person-like emails", () => {
    assert.equal(isGenericCompanyEmail("info@example.test"), true);
    assert.equal(isGenericCompanyEmail("sales@example.test"), true);
    assert.equal(isGenericCompanyEmail("aiko.tanaka@example.test"), false);
  });
});
