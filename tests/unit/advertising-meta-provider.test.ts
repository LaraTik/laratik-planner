import { describe, expect, it, vi } from "vitest";
import { createMetaAdvertisingProvider } from "@/lib/advertising/providers/meta";

const connection = {
  id: "00000000-0000-4000-8000-000000000201",
  provider: "meta" as const,
  agencyId: "00000000-0000-4000-8000-000000000202",
  credentialRef: "advertising:credential",
  status: "active" as const,
  lastValidatedAt: null,
};

describe("Meta advertising provider", () => {
  it("normalizes Graph collection responses into canonical account identities", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ id: "act_123", name: "Example account", currency: "EUR", timezone_name: "UTC" }],
    });
    const provider = createMetaAdvertisingProvider(
      { resolve: vi.fn().mockResolvedValue({ accessToken: "secret-token" }) },
      () => ({ get }),
    );

    await expect(provider.discoverAccounts(connection)).resolves.toEqual([
      {
        id: "act_123",
        provider: "meta",
        externalAccountId: "act_123",
        agencyId: connection.agencyId,
        name: "Example account",
        currency: "EUR",
        timezone: "UTC",
        connectionId: connection.id,
        status: "active",
      },
    ]);
    expect(get).toHaveBeenCalledWith("me/adaccounts", {
      fields: "id,name,currency,timezone_name",
    });
  });

  it("follows at most three provider pages and preserves the query", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "act_123", name: "First", currency: "EUR", timezone_name: "UTC" }],
        paging: { next: { after: "cursor-1" } },
      })
      .mockResolvedValueOnce({
        data: [{ id: "act_456", name: "Second", currency: "USD", timezone_name: "UTC" }],
      });
    const provider = createMetaAdvertisingProvider(
      { resolve: vi.fn().mockResolvedValue({ accessToken: "secret-token" }) },
      () => ({ get }),
    );

    await expect(provider.discoverAccounts(connection)).resolves.toHaveLength(2);
    expect(get).toHaveBeenNthCalledWith(2, "me/adaccounts", {
      fields: "id,name,currency,timezone_name",
      after: "cursor-1",
    });
  });

  it("requests the correct read-only grain for ad-level insights", async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const provider = createMetaAdvertisingProvider(
      { resolve: vi.fn().mockResolvedValue({ accessToken: "secret-token" }) },
      () => ({ get }),
    );

    await provider.readDailyInsights(
      connection,
      {
        id: "account-row",
        provider: "meta",
        externalAccountId: "act_123",
        agencyId: connection.agencyId,
        name: "Example account",
        currency: "EUR",
        timezone: "UTC",
        connectionId: connection.id,
        status: "active",
      },
      {
        definitionVersion: "meta-read-v1",
        provider: "meta",
        accountId: "act_123",
        currency: "EUR",
        timezone: "UTC",
        dateRange: { since: "2026-10-01", until: "2026-10-02" },
        attributionWindow: null,
        actionReportTime: "impression",
        breakdowns: [],
        grain: "ad_day",
      },
    );
    expect(get).toHaveBeenCalledWith("act_123/insights", {
      fields:
        "ad_id,adset_id,campaign_id,date_start,spend,impressions,clicks,reach,actions,ctr,cpc,cpm",
      time_range: JSON.stringify({ since: "2026-10-01", until: "2026-10-02" }),
      time_increment: "1",
      level: "ad",
    });
  });

  it("keeps the provider surface read-only and bounded to the approved probes", async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const provider = createMetaAdvertisingProvider(
      { resolve: vi.fn().mockResolvedValue({ accessToken: "secret-token" }) },
      () => ({ get }),
    );

    await provider.readPages(connection);
    await provider.readInstagramAccounts(connection, "page_123");
    await provider.readCampaigns(connection, {
      id: "account-row",
      provider: "meta",
      externalAccountId: "act_123",
      agencyId: connection.agencyId,
      name: "Example account",
      currency: "EUR",
      timezone: "UTC",
      connectionId: connection.id,
      status: "active",
    });

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "me/accounts",
      "page_123",
      "act_123/campaigns",
    ]);
  });
});
