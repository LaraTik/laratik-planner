import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));

const { getTrendSourceAdminView } = await import("@/features/trends/server");

function query(rows: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(async () => rows),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return builder;
}

describe("trend source admin view", () => {
  beforeEach(() => mocks.select.mockReset());

  it("returns safe source and health fields without provider error details or key references", async () => {
    mocks.select
      .mockReturnValueOnce(
        query([
          {
            sourceKey: "public-rss",
            displayName: "Public RSS",
            enabled: true,
            tier: "free",
            tosClass: "clean",
            cadenceOverride: null,
            tosAcknowledgedAt: null,
            apiKeyRef: "agency/secret/path",
          },
        ]),
      )
      .mockReturnValueOnce(
        query([
          {
            sourceKey: "public-rss",
            circuitState: "open",
            lastSuccessAt: new Date("2026-10-21T12:00:00Z"),
            lastError: { code: "provider_error", message: "token=private", at: "now" },
          },
        ]),
      );

    const result = await getTrendSourceAdminView("agency-1");

    expect(result.sources).toEqual([
      {
        key: "public-rss",
        displayName: "Public RSS",
        enabled: true,
        tier: "free",
        tosClass: "clean",
        cadence: "—",
        tosAcknowledgedAt: null,
        hasApiKey: true,
      },
    ]);
    expect(result.health).toEqual([
      {
        sourceKey: "public-rss",
        circuitState: "open",
        lastSuccessAt: "2026-10-21T12:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("agency/secret/path");
  });
});
