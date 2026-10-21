import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  resolvedResults: [] as unknown[],
  equalityValues: [] as unknown[],
  adminAgencies: [] as string[],
  keyAgencies: [] as string[],
  activeApiKey: null as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((left, right) => {
      mocks.equalityValues.push(right);
      return actual.eq(left, right);
    }),
  };
});
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => {
          const result = mocks.selectResults.shift() ?? [];
          mocks.resolvedResults.push(result);
          return result;
        },
      };
      return query;
    },
  },
}));
vi.mock("@/lib/auth/policy", () => ({
  isAgencyAdmin: async (_actor: unknown, agencyId: string) => {
    mocks.adminAgencies.push(agencyId);
    return true;
  },
}));
vi.mock("@/lib/ai", () => ({
  getActiveApiKey: async (agencyId: string) => {
    mocks.keyAgencies.push(agencyId);
    return mocks.activeApiKey;
  },
}));

import { getWorkspaceAiSettings } from "@/features/ai/server";

describe("getWorkspaceAiSettings", () => {
  beforeEach(() => {
    mocks.selectResults = [
      [{ enabled: true, enabledCapabilities: ["caption_drafts"] }],
      [{ value: 7 }],
    ];
    mocks.resolvedResults = [];
    mocks.equalityValues = [];
    mocks.adminAgencies = [];
    mocks.keyAgencies = [];
    mocks.activeApiKey = "test-key";
  });

  it("scopes provider configuration, access, and usage to the workspace agency", async () => {
    const result = await getWorkspaceAiSettings(
      { id: "manager-b" },
      { id: "workspace-b", agencyId: "agency-b" },
    );

    expect(mocks.adminAgencies).toEqual(["agency-b"]);
    expect(mocks.keyAgencies).toEqual(["agency-b"]);
    expect(mocks.equalityValues).toContain("agency-b");
    expect(mocks.equalityValues).toContain("workspace-b");
    expect(mocks.resolvedResults).toEqual([
      [{ enabled: true, enabledCapabilities: ["caption_drafts"] }],
      [{ value: 7 }],
    ]);
    expect(result).toMatchObject({
      requestCount: 7,
      isAdmin: true,
      hasActiveApiKey: true,
      effectiveEnabled: true,
      enabledCapabilities: ["caption_drafts"],
    });
  });

  it("reports that the provider key is unavailable when no active key exists", async () => {
    mocks.activeApiKey = null;

    const result = await getWorkspaceAiSettings(
      { id: "manager-b" },
      { id: "workspace-b", agencyId: "agency-b" },
    );

    expect(result.hasActiveApiKey).toBe(false);
    expect(result.effectiveEnabled).toBe(false);
  });
});
