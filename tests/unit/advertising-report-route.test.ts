import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  env: { ADVERTISING_REPORTING_ENABLED: true },
  load: vi.fn(),
}));

vi.mock("@/lib/validation/env", () => ({ serverEnv: mocks.env }));
vi.mock("@/lib/auth/current-actor", () => ({
  currentActor: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
}));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: vi.fn(async () => ({
    agencyId: "22222222-2222-4222-8222-222222222222",
  })),
}));
vi.mock("@/lib/advertising/reporting-query", () => ({
  loadAdvertisingReport: mocks.load,
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { GET } from "@/app/api/advertising/report/route";

const ids = {
  accountId: "33333333-3333-4333-8333-333333333333",
  workspaceId: "44444444-4444-4444-8444-444444444444",
};

function request(surface: string, withWorkspace = true) {
  const params = new URLSearchParams({
    accountId: ids.accountId,
    since: "2026-10-01",
    until: "2026-10-02",
    surface,
  });
  if (withWorkspace) params.set("workspaceId", ids.workspaceId);
  return new NextRequest(`http://localhost/api/advertising/report?${params}`);
}

describe("GET /api/advertising/report", () => {
  beforeEach(() => {
    mocks.env.ADVERTISING_REPORTING_ENABLED = true;
    mocks.load.mockReset();
  });

  it("fails closed while the reporting feature flag is off", async () => {
    mocks.env.ADVERTISING_REPORTING_ENABLED = false;
    const response = await GET(request("workspace_dashboard"));
    expect(response.status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("returns only the authorized projection for a JSON surface", async () => {
    mocks.load.mockResolvedValue({
      kind: "ok",
      account: { id: ids.accountId, name: "Shared", currency: "EUR", timezone: "UTC" },
      report: {
        authorized: true,
        reason: "allowed",
        surface: "workspace_dashboard",
        operation: "report_read",
        cacheKey: "grant-1:1",
        rows: [
          {
            accountId: ids.accountId,
            campaignId: "campaign-visible",
            adId: "ad-visible",
            date: "2026-10-01",
            spend: 10,
            impressions: 100,
            clicks: 5,
          },
        ],
        totals: { spend: 10, impressions: 100, clicks: 5, ctr: 0.05, cpc: 2, cpm: 100 },
      },
      objects: [{ objectType: "ad", externalObjectId: "ad-visible" }],
      audience: [{ breakdown: "age", dimensionValue: "25-34" }],
      lastSuccessfulSyncAt: "2026-10-02T00:00:00.000Z",
      syncStatus: "succeeded",
      partial: false,
      freshness: "fresh",
    });

    const response = await GET(request("workspace_dashboard"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      report: { rows: [{ campaignId: "campaign-visible" }], totals: { spend: 10 } },
      objects: [{ externalObjectId: "ad-visible" }],
      audience: [{ dimensionValue: "25-34" }],
      partial: false,
    });
    expect(mocks.load).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: ids.accountId,
        workspaceId: ids.workspaceId,
        surface: "workspace_dashboard",
      }),
    );
  });

  it("does not serialize denied report rows or reveal whether the account exists", async () => {
    mocks.load.mockResolvedValue({ kind: "forbidden" });
    const response = await GET(request("workspace_dashboard", false));
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "advertising_report_not_found" });
    expect(body).not.toContain("campaign");
  });

  it("uses the same hidden-resource response for an unknown account", async () => {
    mocks.load.mockResolvedValue({ kind: "not_found" });
    const response = await GET(request("workspace_dashboard", false));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "advertising_report_not_found" });
  });
});
