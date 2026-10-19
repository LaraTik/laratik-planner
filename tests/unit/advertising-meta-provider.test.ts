import { describe, expect, it, vi } from "vitest";
import {
  createMetaAdvertisingProvider,
  readMetaCollectionComplete,
} from "@/lib/advertising/providers/meta";

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

  it("follows production collections beyond the diagnostic page limit", async () => {
    const get = vi.fn();
    for (let page = 1; page <= 5; page += 1) {
      get.mockResolvedValueOnce({
        data: [{ id: `campaign-${page}` }],
        ...(page < 5 ? { paging: { next: { after: `cursor-${page}` } } } : {}),
      });
    }
    const result = await readMetaCollectionComplete({ get }, "act_123/campaigns", {
      fields: "id",
    });
    expect(result).toMatchObject({
      data: [
        { id: "campaign-1" },
        { id: "campaign-2" },
        { id: "campaign-3" },
        { id: "campaign-4" },
        { id: "campaign-5" },
      ],
      complete: true,
      pages: 5,
    });
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("resumes production collection reads from a validated cursor and rejects foreign paging hosts", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "campaign-2" }],
        paging: { next: { after: "cursor-3" } },
      })
      .mockResolvedValueOnce({ data: [{ id: "campaign-3" }] });
    const result = await readMetaCollectionComplete(
      { get },
      "act_123/campaigns",
      { fields: "id" },
      { cursor: { path: "act_123/campaigns", params: { fields: "id", after: "cursor-2" } } },
    );
    expect(result.complete).toBe(true);
    expect(get).toHaveBeenNthCalledWith(1, "act_123/campaigns", {
      fields: "id",
      after: "cursor-2",
    });

    const foreignHost = vi.fn().mockResolvedValue({
      data: [{ id: "campaign-1" }],
      paging: { next: "https://evil.example/v20.0/act_123/campaigns?after=bad" },
    });
    await expect(
      readMetaCollectionComplete({ get: foreignHost }, "act_123/campaigns", { fields: "id" }),
    ).resolves.toMatchObject({ complete: true, pages: 1 });
    expect(foreignHost).toHaveBeenCalledTimes(1);
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

  it("reads bounded creative presentation fields through the configured Graph API version", async () => {
    const get = vi.fn().mockResolvedValue({ id: "creative_123" });
    const provider = createMetaAdvertisingProvider(
      { resolve: vi.fn().mockResolvedValue({ accessToken: "secret-token" }) },
      () => ({ get }),
    );

    await provider.readCreatives(connection, "creative_123");

    expect(get).toHaveBeenCalledWith("creative_123", {
      fields:
        "id,name,title,body,link_url,thumbnail_url,image_url,video_id,call_to_action_type,object_story_spec,asset_feed_spec",
    });
  });

  it("requests the nested creative identity from ad reads", async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const provider = createMetaAdvertisingProvider(
      { resolve: vi.fn().mockResolvedValue({ accessToken: "secret-token" }) },
      () => ({ get }),
    );

    await provider.readAds(connection, "adset_123");

    expect(get).toHaveBeenCalledWith("adset_123/ads", {
      fields: "id,name,status,adset_id,creative{id}",
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
