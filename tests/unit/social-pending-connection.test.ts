import { describe, expect, it, vi } from "vitest";
import { socialConnections } from "@/lib/db/schema/social-analytics";

type SocialConnection = typeof socialConnections.$inferSelect;

/**
 * M4 — `findPendingConnectionForWorkspace` unit contract.
 *
 * The function reads the most recent `pending_selection` connection
 * for a workspace and parses `metadata.discoveredProfiles` into the
 * `DiscoveredProfile` shape the picker consumes. Tokens are NEVER
 * in the profile list — they live on the sealed credentials
 * envelope and are only used by the sync worker.
 *
 * Test matrix:
 *   - returns null when no row is found
 *   - returns null when the row's `discoveredProfiles` is missing
 *   - returns null when the row's `discoveredProfiles` is empty
 *   - returns null when every entry is malformed (wrong platform,
 *     missing providerAccountId, etc.)
 *   - returns the parsed profiles when valid
 *   - coerces missing handle/profileUrl/avatarUrl/parentProviderAccountId
 *     to null
 *   - filters out invalid entries mixed in with valid ones
 */

// We test the parser by going through the full repository call. The
// real Drizzle `db` client is mocked at the surface that the
// repository uses (select().from().where().orderBy().limit()).
// Because the Drizzle mock surface is large, we mock the `db` module
// entirely and exercise the function with hand-rolled connection
// rows.

const mockSelect = vi.fn();
const mockDb = { select: mockSelect };

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// Import after the mock is registered so the module closes over it.
async function loadRepository() {
  vi.resetModules();
  return import("@/lib/social/repository");
}

function makeConnection(metadata: Record<string, unknown> = {}): SocialConnection {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    workspaceId: "ws-1",
    provider: "meta",
    providerSubjectId: "subject-hash",
    status: "pending_selection",
    scopes: ["pages_show_list"],
    credentialsCiphertext: "ct",
    credentialsIv: "iv",
    credentialsTag: "tag",
    credentialsKeyVersion: 1,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    metadata,
    connectedBy: "00000000-0000-0000-0000-000000000002",
    connectedAt: new Date("2026-08-27T10:00:00Z"),
    lastRefreshedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-08-27T10:00:00Z"),
    updatedAt: new Date("2026-08-27T10:00:00Z"),
  } as unknown as SocialConnection;
}

function setupSelectChain(row: SocialConnection | null) {
  // The repository's select().from().where().orderBy().limit() chain
  // resolves to an array. We hand-craft a chainable that ends in
  // limit() returning the row.
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(row ? [row] : []));
  mockSelect.mockReturnValueOnce(chain);
}

describe("findPendingConnectionForWorkspace", () => {
  it("returns null when there is no pending_selection connection", async () => {
    setupSelectChain(null);
    const repo = await loadRepository();
    const result = await repo.findPendingConnectionForWorkspace(mockDb as never, "ws-1");
    expect(result).toBeNull();
  });

  it("returns null when the row has no metadata.discoveredProfiles", async () => {
    setupSelectChain(makeConnection({}));
    const repo = await loadRepository();
    const result = await repo.findPendingConnectionForWorkspace(mockDb as never, "ws-1");
    expect(result).toBeNull();
  });

  it("returns null when metadata.discoveredProfiles is empty", async () => {
    setupSelectChain(makeConnection({ discoveredProfiles: [] }));
    const repo = await loadRepository();
    const result = await repo.findPendingConnectionForWorkspace(mockDb as never, "ws-1");
    expect(result).toBeNull();
  });

  it("parses a valid discoveredProfiles list and returns the connection + profiles", async () => {
    const discoveredProfiles = [
      {
        providerAccountId: "page-1",
        platform: "facebook",
        accountName: "Just Halal",
        handle: null,
        profileUrl: "https://facebook.com/justhalal",
        avatarUrl: "https://graph.facebook.com/p1.jpg",
        parentProviderAccountId: null,
      },
      {
        providerAccountId: "ig-1",
        platform: "instagram",
        accountName: "Just Halal tr",
        handle: "justhalal_tr",
        profileUrl: "https://instagram.com/justhalal_tr",
        avatarUrl: null,
        parentProviderAccountId: "page-1",
      },
    ];
    setupSelectChain(makeConnection({ discoveredProfiles }));
    const repo = await loadRepository();
    const result = await repo.findPendingConnectionForWorkspace(mockDb as never, "ws-1");
    expect(result).not.toBeNull();
    expect(result!.connection.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(result!.profiles).toHaveLength(2);
    expect(result!.profiles[0]).toEqual({
      providerAccountId: "page-1",
      platform: "facebook",
      accountName: "Just Halal",
      handle: null,
      profileUrl: "https://facebook.com/justhalal",
      avatarUrl: "https://graph.facebook.com/p1.jpg",
      parentProviderAccountId: null,
    });
    expect(result!.profiles[1]?.handle).toBe("justhalal_tr");
  });

  it("coerces non-string optional fields to null", async () => {
    const discoveredProfiles = [
      {
        providerAccountId: "page-1",
        platform: "facebook",
        accountName: "Just Halal",
        // handle / profileUrl / avatarUrl / parentProviderAccountId
        // missing entirely — should be coerced to null.
      },
    ];
    setupSelectChain(makeConnection({ discoveredProfiles }));
    const repo = await loadRepository();
    const result = await repo.findPendingConnectionForWorkspace(mockDb as never, "ws-1");
    expect(result).not.toBeNull();
    expect(result!.profiles[0]?.handle).toBeNull();
    expect(result!.profiles[0]?.profileUrl).toBeNull();
    expect(result!.profiles[0]?.avatarUrl).toBeNull();
    expect(result!.profiles[0]?.parentProviderAccountId).toBeNull();
  });

  it("filters out invalid entries (wrong platform) mixed in with valid ones", async () => {
    const discoveredProfiles = [
      {
        providerAccountId: "page-1",
        platform: "facebook",
        accountName: "Valid Page",
      },
      {
        providerAccountId: "page-2",
        platform: "myspace", // invalid
        accountName: "Invalid Page",
      },
      {
        platform: "instagram", // missing providerAccountId
        accountName: "No ID",
      },
      {
        providerAccountId: "ig-1",
        platform: "instagram",
        accountName: "Valid IG",
      },
    ];
    setupSelectChain(makeConnection({ discoveredProfiles }));
    const repo = await loadRepository();
    const result = await repo.findPendingConnectionForWorkspace(mockDb as never, "ws-1");
    expect(result).not.toBeNull();
    expect(result!.profiles).toHaveLength(2);
    expect(result!.profiles.map((p) => p.providerAccountId)).toEqual(["page-1", "ig-1"]);
  });

  it("returns null when every entry is malformed", async () => {
    const discoveredProfiles = [
      { platform: "facebook", accountName: "No ID" },
      { providerAccountId: "x", platform: "myspace", accountName: "Bad platform" },
    ];
    setupSelectChain(makeConnection({ discoveredProfiles }));
    const repo = await loadRepository();
    const result = await repo.findPendingConnectionForWorkspace(mockDb as never, "ws-1");
    expect(result).toBeNull();
  });
});
