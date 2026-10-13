import { describe, expect, it } from "vitest";
import { authorizeAdvertising } from "@/lib/advertising/authorization";
import { createAdvertisingIsolationFixture } from "@/lib/advertising/fixtures";
import {
  ADVERTISING_METRIC_DEFINITIONS,
  assertCompatibleReportContexts,
} from "@/lib/advertising/metrics";
import { classifyMetaError } from "@/lib/advertising/providers/meta";
describe("advertising authorization boundary", () => {
  const fixture = createAdvertisingIsolationFixture();
  const account = fixture.accounts[0]!;
  const connection = fixture.connections[0]!;
  const base = {
    account,
    connection,
    visibilityGrants: fixture.grants,
    financialAuthorities: fixture.financialAuthorities,
    now: "2026-10-13T00:00:00.000Z",
  } as const;
  it("allows only the explicitly granted workspace", () => {
    expect(
      authorizeAdvertising({ ...base, principal: fixture.principals[0]!, operation: "report_read" })
        .allowed,
    ).toBe(true);
    expect(
      authorizeAdvertising({
        ...base,
        principal: fixture.principals[1]!,
        operation: "report_read",
      }),
    ).toMatchObject({ allowed: false, reason: "visibility_grant_missing" });
  });

  it("separates account discovery from account data visibility", () => {
    expect(
      authorizeAdvertising({
        ...base,
        account: null,
        principal: {
          ...fixture.principals[0]!,
          capabilities: ["discover_accounts"],
        },
        operation: "account_discovery",
      }),
    ).toMatchObject({ allowed: true, reason: "allowed" });
  });
  it("does not let a shared account cross an agency boundary", () => {
    expect(
      authorizeAdvertising({
        ...base,
        principal: fixture.principals[2]!,
        operation: "report_read",
      }),
    ).toMatchObject({ allowed: false, reason: "agency_mismatch" });
  });
  it("requires the connection to be linked to the account", () => {
    expect(
      authorizeAdvertising({
        ...base,
        connection: { ...connection, id: "connection-not-linked" },
        principal: fixture.principals[0]!,
        operation: "report_read",
      }),
    ).toMatchObject({ allowed: false, reason: "connection_account_mismatch" });
  });
  it("requires separate financial authority", () => {
    expect(
      authorizeAdvertising({
        ...base,
        principal: fixture.principals[1]!,
        operation: "financial_read",
      }),
    ).toMatchObject({ allowed: false, reason: "visibility_grant_missing" });
    expect(
      authorizeAdvertising({
        ...base,
        principal: fixture.principals[0]!,
        operation: "financial_read",
      }).allowed,
    ).toBe(true);
  });

  it("does not leak an unallocated campaign through a shared-account read", () => {
    expect(
      authorizeAdvertising({
        ...base,
        principal: fixture.principals[0]!,
        operation: "campaign_read",
        resource: { campaignId: "campaign-b" },
      }),
    ).toMatchObject({ allowed: false, reason: "capability_missing" });
    expect(
      authorizeAdvertising({
        ...base,
        principal: fixture.principals[0]!,
        operation: "report_read",
        resource: { campaignId: "campaign-b" },
      }),
    ).toMatchObject({ allowed: false, reason: "visibility_grant_missing" });
  });
});
describe("advertising metric contract", () => {
  it("marks only safe base measures as additive", () => {
    expect(ADVERTISING_METRIC_DEFINITIONS.spend.additivity).toBe("additive");
    expect(ADVERTISING_METRIC_DEFINITIONS.reach.additivity).toBe("non_additive");
    expect(ADVERTISING_METRIC_DEFINITIONS.ctr.additivity).toBe("non_additive");
  });
  it("rejects aggregation across incompatible attribution contexts", () => {
    const context = {
      definitionVersion: "v1",
      provider: "meta" as const,
      accountId: "a",
      currency: "EUR",
      timezone: "Europe/Berlin",
      dateRange: { since: "2026-01-01", until: "2026-01-02" },
      attributionWindow: "7d_click",
      actionReportTime: "conversion",
      breakdowns: [],
      grain: "ad_day" as const,
    };
    expect(() =>
      assertCompatibleReportContexts([context, { ...context, attributionWindow: "1d_view" }]),
    ).toThrow("incompatible_advertising_report_context");
  });
});
describe("Meta read-only error classification", () => {
  it("classifies provider failures", () => {
    expect(classifyMetaError(403)).toBe("permission_denied");
    expect(classifyMetaError(429)).toBe("rate_limited");
  });
});
