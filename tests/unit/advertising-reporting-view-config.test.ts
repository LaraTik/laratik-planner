import { describe, expect, it } from "vitest";
import {
  advertisingReportViewConfigFromSearch,
  advertisingReportViewConfigToSearchParams,
} from "@/lib/advertising/reporting-view-config";

describe("advertising report view configuration", () => {
  it("serializes URL-driven filters and chart settings without tenant data", () => {
    const config = advertisingReportViewConfigFromSearch({
      params: new URLSearchParams(
        "section=campaigns&compare=custom&compareSince=2026-09-01&compareUntil=2026-09-30&search=retargeting&trendMetricA=impressions&trendMetricB=clicks&trendGranularity=week&sort=results&visibleColumns=results,ctr",
      ),
      accountId: "act_123",
      since: "2026-10-01",
      until: "2026-10-30",
    });

    expect(config).toMatchObject({
      surface: "advertising-reporting",
      version: 1,
      accountId: "act_123",
      section: "campaigns",
      compare: "custom",
      search: "retargeting",
      trendMetricA: "impressions",
      trendMetricB: "clicks",
      trendGranularity: "week",
      sort: "results",
      visibleColumns: ["results", "ctr"],
    });
    expect(config).not.toHaveProperty("workspaceId");
    expect(config).not.toHaveProperty("agencyId");
  });

  it("round-trips a saved view back into URL parameters", () => {
    const config = advertisingReportViewConfigFromSearch({
      params: new URLSearchParams("section=audience&audiencePage=2"),
      accountId: "act_456",
      since: "2026-10-01",
      until: "2026-10-30",
    });

    const params = advertisingReportViewConfigToSearchParams(config);
    expect(params.get("accountId")).toBe("act_456");
    expect(params.get("section")).toBe("audience");
    expect(params.get("audiencePage")).toBe("2");
    expect(params.get("visibleColumns")).toBeNull();
    expect(params.get("surface")).toBeNull();
    expect(params.get("version")).toBeNull();
  });

  it("rejects malformed saved values instead of silently changing meaning", () => {
    expect(() =>
      advertisingReportViewConfigFromSearch({
        params: new URLSearchParams("section=unsupported"),
        accountId: "act_789",
        since: "2026-10-01",
        until: "2026-10-30",
      }),
    ).toThrow();
  });
});
