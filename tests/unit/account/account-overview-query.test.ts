import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { loadAccountOverviewIdentity } from "@/features/account/server";

function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_target, property) {
      if (property === "then") {
        return (onFulfilled?: (value: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

function queueResults(profileRows: unknown[], agencyRows: unknown[]) {
  dbMock.select
    .mockReturnValueOnce(makeChain(profileRows))
    .mockReturnValueOnce(makeChain(agencyRows));
}

describe("account overview query", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the missing-profile state when the session user no longer exists", async () => {
    queueResults([], []);

    await expect(loadAccountOverviewIdentity("user-1")).resolves.toEqual({
      profile: null,
      hasPassword: null,
      agencyRows: [],
    });
  });

  it("derives password state from the profile query without returning the hash", async () => {
    queueResults(
      [
        {
          id: "user-1",
          email: "user@example.test",
          name: "User",
          displayName: "Studio User",
          image: null,
          locale: "en",
          themePreference: "dark",
          passwordHash: "never-return-this",
        },
      ],
      [{ agencyId: "agency-1", agencyName: "Northwind", isAgencyAdmin: true, workspaceCount: 2 }],
    );

    const result = await loadAccountOverviewIdentity("user-1");

    expect(result).toEqual({
      profile: {
        id: "user-1",
        email: "user@example.test",
        name: "User",
        displayName: "Studio User",
        image: null,
        locale: "en",
        themePreference: "dark",
      },
      hasPassword: true,
      agencyRows: [
        { agencyId: "agency-1", agencyName: "Northwind", isAgencyAdmin: true, workspaceCount: 2 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("never-return-this");
    expect(dbMock.select).toHaveBeenCalledTimes(2);
  });
});
