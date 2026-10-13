import { describe, expect, it } from "vitest";
import {
  buildScopedAdvertisingReport,
  advertisingReportCacheKey,
} from "@/lib/advertising/reporting-service";
import { createAdvertisingIsolationFixture } from "@/lib/advertising/fixtures";

describe("advertising reporting authorization seam", () => {
  it("filters facts before totals for two tenants sharing one account", () => {
    const fixture = createAdvertisingIsolationFixture();
    const accountA = fixture.accounts[0]!;
    const connectionA = fixture.connections[0]!;
    const principalA = fixture.principals[0]!;
    const visibilityGrantA = fixture.grants[0]!;
    const facts = [
      {
        accountId: accountA.id,
        campaignId: "campaign-a",
        adId: "ad-1",
        date: "2026-10-01",
        spend: 10,
        impressions: 100,
        clicks: 5,
      },
      {
        accountId: accountA.id,
        campaignId: "campaign-b",
        adId: "ad-2",
        date: "2026-10-01",
        spend: 90,
        impressions: 900,
        clicks: 90,
      },
    ];
    const report = buildScopedAdvertisingReport(
      {
        principal: principalA,
        account: accountA,
        connection: connectionA,
        visibilityGrants: [visibilityGrantA],
        financialAuthorities: [],
      },
      facts,
      { operation: "report_read", now: "2026-10-02T00:00:00.000Z" },
    );
    expect(report.authorized).toBe(true);
    expect(report.rows.map((row) => row.campaignId)).toEqual(["campaign-a"]);
    expect(report.totals).toMatchObject({
      spend: 10,
      impressions: 100,
      clicks: 5,
      ctr: 0.05,
      cpc: 2,
      cpm: 100,
    });
  });

  it("returns an indistinguishable empty projection when the tenant is denied", () => {
    const fixture = createAdvertisingIsolationFixture();
    const accountA = fixture.accounts[0]!;
    const connectionA = fixture.connections[0]!;
    const principalB = fixture.principals[1]!;
    const report = buildScopedAdvertisingReport(
      {
        principal: principalB,
        account: accountA,
        connection: connectionA,
        visibilityGrants: [],
        financialAuthorities: [],
      },
      [
        {
          accountId: accountA.id,
          campaignId: "campaign-a",
          date: "2026-10-01",
          spend: 90,
          impressions: 900,
          clicks: 90,
        },
      ],
      { operation: "report_read", now: "2026-10-02T00:00:00.000Z" },
    );
    expect(report).toEqual({
      authorized: false,
      reason: "visibility_grant_missing",
      rows: [],
      totals: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        results: null,
        ctr: null,
        cpc: null,
        cpm: null,
      },
    });
  });

  it("changes cache identity when a grant revision is revoked", () => {
    const common = {
      agencyId: "agency",
      workspaceId: "workspace",
      accountId: "account",
      since: "2026-10-01",
      until: "2026-10-02",
    };
    expect(advertisingReportCacheKey({ ...common, grantRevision: 1 })).not.toBe(
      advertisingReportCacheKey({ ...common, grantRevision: 2 }),
    );
  });
});
