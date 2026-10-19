import { describe, expect, it } from "vitest";
import {
  advertisingAiContextFromReport,
  advertisingCsvFromReport,
  advertisingXlsxFromReport,
  buildAdvertisingSurfaceReport,
} from "@/lib/advertising/reporting-boundary";
import { createAdvertisingIsolationFixture } from "@/lib/advertising/fixtures";

function baseArgs(surface: Parameters<typeof buildAdvertisingSurfaceReport>[0]) {
  return {
    ...surface,
    now: "2026-10-02T00:00:00.000Z",
    cache: surface.cache ?? {
      agencyId: "agency-a",
      workspaceId: "workspace-a1",
      since: "2026-10-01",
      until: "2026-10-02",
      grantRevision: 1,
    },
  };
}

describe("advertising reporting boundary", () => {
  it("authorizes before aggregation for dashboard, detail, and background surfaces", () => {
    const fixture = createAdvertisingIsolationFixture();
    const facts = [
      {
        accountId: "shared-account",
        campaignId: "campaign-a",
        adId: "ad-visible",
        date: "2026-10-01",
        spend: 10,
        impressions: 100,
        clicks: 5,
      },
      {
        accountId: "shared-account",
        campaignId: "campaign-b",
        adId: "ad-hidden",
        date: "2026-10-01",
        spend: 90,
        impressions: 900,
        clicks: 90,
      },
    ];
    const scope = {
      principal: fixture.principals[0]!,
      account: fixture.accounts[0]!,
      connection: fixture.connections[0]!,
      visibilityGrants: [fixture.grants[0]!, fixture.grants[1]!],
      financialAuthorities: [],
    };
    for (const surface of [
      "workspace_dashboard",
      "campaign_detail",
      "background_report",
    ] as const) {
      const report = buildAdvertisingSurfaceReport(baseArgs({ surface, scope, facts }));
      expect(report.rows.map((row) => row.adId)).toEqual(["ad-visible"]);
      expect(report.totals.spend).toBe(10);
      expect(report.cacheKey).toContain("1");
    }
  });

  it("does not leak denied rows through exports or AI context", () => {
    const fixture = createAdvertisingIsolationFixture();
    const facts = [
      {
        accountId: "shared-account",
        campaignId: "campaign-a",
        adId: "secret-ad",
        date: "2026-10-01",
        spend: 100,
        impressions: 1000,
        clicks: 10,
      },
    ];
    const deniedScope = {
      principal: fixture.principals[1]!,
      account: fixture.accounts[0]!,
      connection: fixture.connections[0]!,
      visibilityGrants: [],
      financialAuthorities: [],
    };
    const csv = buildAdvertisingSurfaceReport(
      baseArgs({ surface: "csv_export", scope: deniedScope, facts }),
    );
    const ai = buildAdvertisingSurfaceReport(
      baseArgs({ surface: "ai_context", scope: deniedScope, facts }),
    );
    expect(csv).toMatchObject({ authorized: false, rows: [], cacheKey: null });
    expect(advertisingCsvFromReport(csv)).toBe("");
    expect(advertisingAiContextFromReport(ai)).toBeNull();
    expect(JSON.stringify(csv)).not.toContain("secret-ad");
  });

  it("does not expose spend to AI context without financial authority", () => {
    const fixture = createAdvertisingIsolationFixture();
    const report = buildAdvertisingSurfaceReport(
      baseArgs({
        surface: "ai_context",
        scope: {
          principal: fixture.principals[0]!,
          account: fixture.accounts[0]!,
          connection: fixture.connections[0]!,
          visibilityGrants: [
            {
              ...fixture.grants[0]!,
              capability: "use_ai_context",
            },
          ],
          financialAuthorities: [],
        },
        facts: [
          {
            accountId: "shared-account",
            campaignId: "campaign-a",
            date: "2026-10-01",
            spend: 10,
            impressions: 100,
            clicks: 5,
          },
        ],
      }),
    );
    expect(report.authorized).toBe(false);
    expect(advertisingAiContextFromReport(report)).toBeNull();
  });

  it("requires financial authority for financial surfaces and invalidates cache on grant revision", () => {
    const fixture = createAdvertisingIsolationFixture();
    const scope = {
      principal: fixture.principals[0]!,
      account: fixture.accounts[0]!,
      connection: fixture.connections[0]!,
      visibilityGrants: [fixture.grants[0]!, fixture.grants[1]!],
      financialAuthorities: [],
    };
    const facts = [
      {
        accountId: "shared-account",
        campaignId: "campaign-a",
        date: "2026-10-01",
        spend: 10,
        impressions: 100,
        clicks: 5,
      },
    ];
    const denied = buildAdvertisingSurfaceReport(
      baseArgs({ surface: "financial_dashboard", scope, facts }),
    );
    expect(denied.authorized).toBe(false);
    const allowedScope = { ...scope, financialAuthorities: [fixture.financialAuthorities[0]!] };
    const allowed = buildAdvertisingSurfaceReport(
      baseArgs({ surface: "financial_dashboard", scope: allowedScope, facts }),
    );
    const changed = buildAdvertisingSurfaceReport(
      baseArgs({
        surface: "financial_dashboard",
        scope: allowedScope,
        facts,
        cache: {
          agencyId: "agency-a",
          workspaceId: "workspace-a1",
          since: "2026-10-01",
          until: "2026-10-02",
          grantRevision: 2,
        },
      }),
    );
    expect(allowed.authorized).toBe(true);
    expect(allowed.cacheKey).not.toBe(changed.cacheKey);
  });

  it("serializes only authorized export rows and escapes cells", () => {
    const fixture = createAdvertisingIsolationFixture();
    const report = buildAdvertisingSurfaceReport(
      baseArgs({
        surface: "csv_export",
        scope: {
          principal: fixture.principals[0]!,
          account: fixture.accounts[0]!,
          connection: fixture.connections[0]!,
          visibilityGrants: [
            {
              ...fixture.grants[0]!,
              capability: "export_reports",
              campaignIds: null,
            },
          ],
          financialAuthorities: [fixture.financialAuthorities[0]!],
        },
        facts: [
          {
            accountId: "shared-account",
            campaignId: 'campaign,"visible"',
            date: "2026-10-01",
            spend: 1,
            impressions: 2,
            clicks: 1,
          },
        ],
      }),
    );
    expect(advertisingCsvFromReport(report)).toContain('"campaign,""visible"""');
  });

  it("serializes report context before authorized export rows", () => {
    const fixture = createAdvertisingIsolationFixture();
    const report = buildAdvertisingSurfaceReport(
      baseArgs({
        surface: "csv_export",
        scope: {
          principal: fixture.principals[0]!,
          account: fixture.accounts[0]!,
          connection: fixture.connections[0]!,
          visibilityGrants: [
            {
              ...fixture.grants[0]!,
              capability: "export_reports",
              campaignIds: null,
            },
          ],
          financialAuthorities: [fixture.financialAuthorities[0]!],
        },
        facts: [
          {
            accountId: "shared-account",
            campaignId: "campaign-visible",
            date: "2026-10-01",
            spend: 1,
            impressions: 2,
            clicks: 1,
          },
        ],
      }),
    );
    const csv = advertisingCsvFromReport(report, {
      accountId: "shared-account",
      accountName: "Shared account",
      since: "2026-10-01",
      until: "2026-10-02",
      timezone: "Europe/Berlin",
      currency: "EUR",
      filters: { section: "campaigns", objective: null },
      dataHealth: {
        state: "partial",
        coverage: "partial",
        syncStatus: "partial",
        freshness: "stale",
        lastSuccessfulSyncAt: "2026-10-02T00:00:00.000Z",
        since: "2026-10-01",
        until: "2026-10-02",
        timezone: "Europe/Berlin",
        currency: "EUR",
        issues: ["partial_coverage"],
      },
      attributionSettings: "provider resultType",
    });
    expect(csv).toContain("# timezone,Europe/Berlin");
    expect(csv).toContain("# filter_section,campaigns");
    expect(csv).toContain("# metric_definitions,");
    expect(csv).toContain("campaign_id,ad_set_id,ad_id,date,spend,impressions,clicks");
    expect(csv).toContain("campaign-visible");
  });

  it("exports the same authorized projection as XLSX with local-label columns", () => {
    const fixture = createAdvertisingIsolationFixture();
    const report = buildAdvertisingSurfaceReport(
      baseArgs({
        surface: "xlsx_export",
        scope: {
          principal: fixture.principals[0]!,
          account: fixture.accounts[0]!,
          connection: fixture.connections[0]!,
          visibilityGrants: [
            { ...fixture.grants[0]!, capability: "export_reports", campaignIds: null },
          ],
          financialAuthorities: [fixture.financialAuthorities[0]!],
        },
        facts: [
          {
            accountId: "shared-account",
            campaignId: "campaign-visible",
            date: "2026-10-01",
            spend: 1,
            impressions: 2,
            clicks: 1,
          },
        ],
      }),
    );
    const xlsx = advertisingXlsxFromReport(report, {
      accountId: "shared-account",
      accountName: "Shared account",
      since: "2026-10-01",
      until: "2026-10-02",
      timezone: "Europe/Berlin",
      currency: "EUR",
      filters: {},
      dataHealth: {
        state: "complete",
        coverage: "complete",
        syncStatus: "succeeded",
        freshness: "fresh",
        lastSuccessfulSyncAt: "2026-10-02T00:00:00.000Z",
        since: "2026-10-01",
        until: "2026-10-02",
        timezone: "Europe/Berlin",
        currency: "EUR",
        issues: [],
      },
      attributionSettings: "provider resultType",
      localTagsByEntity: { "campaign:campaign-visible": ["Boundaries"] },
    });
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
});
