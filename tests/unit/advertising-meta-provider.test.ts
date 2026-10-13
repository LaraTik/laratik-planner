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
      paging: { next: { after: "opaque-cursor" } },
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
