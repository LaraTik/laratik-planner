import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `safeGetSignedDownloadUrl` is the defensive wrapper around
 * `getSignedDownloadUrl` for UI render paths. A single legacy
 * `brand_assets.storagePath` row that lacks the workspace prefix
 * (e.g. just-halal workspace, surfaced in production as digest
 * `1922858633` / `1276527957`) used to crash the Brand Kit
 * overview + logos page via `StoragePathError`. These tests pin
 * the new contract: every UI render path returns `null` on bad
 * input, never throws, and emits at most one warning.
 */

// Mock @/lib/storage so we don't pull in the actual signing + r2
// config (which depends on env vars we don't want to set in unit
// tests). The mock reproduces `StoragePathError`'s behaviour
// exactly so the safe wrapper sees the same shape.
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...actual,
    getSignedDownloadUrl: vi.fn((path: string) => {
      const slash = path.indexOf("/");
      if (slash < 0) {
        const err = new Error(`Storage path missing workspace prefix: ${path}`);
        err.name = "StoragePathError";
        throw err;
      }
      return `/api/uploads/${encodeURIComponent(path.slice(slash + 1))}?token=t&expiresAt=0`;
    }),
  };
});

async function loadStorage() {
  return await import("@/lib/storage");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("safeGetSignedDownloadUrl", () => {
  it("returns null on null input without logging", async () => {
    const { safeGetSignedDownloadUrl } = await loadStorage();
    expect(safeGetSignedDownloadUrl(null)).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null on undefined input without logging", async () => {
    const { safeGetSignedDownloadUrl } = await loadStorage();
    expect(safeGetSignedDownloadUrl(undefined)).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null on empty-string input without logging", async () => {
    const { safeGetSignedDownloadUrl } = await loadStorage();
    expect(safeGetSignedDownloadUrl("")).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null on non-string input without logging", async () => {
    const { safeGetSignedDownloadUrl } = await loadStorage();
    expect(safeGetSignedDownloadUrl(42 as unknown as string)).toBeNull();
    expect(safeGetSignedDownloadUrl({} as unknown as string)).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns the signed URL when the path has a workspace prefix", async () => {
    const { safeGetSignedDownloadUrl } = await loadStorage();
    const url = safeGetSignedDownloadUrl("ws-abc/logos/x.png");
    expect(url).toMatch(/^\/api\/uploads\//);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null + warns when the path is missing the workspace prefix (the production bug)", async () => {
    const { safeGetSignedDownloadUrl } = await loadStorage();
    // A legacy row with `storage_path = "legacy-no-prefix"` used to
    // throw StoragePathError; the safe wrapper now degrades to a
    // broken-image fallback and logs one warning per render.
    expect(safeGetSignedDownloadUrl("legacy-no-prefix")).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("safeGetSignedDownloadUrl"));
  });

  it("does NOT throw on any malformed input — UI render paths must never crash", async () => {
    const { safeGetSignedDownloadUrl } = await loadStorage();
    const inputs: Array<string | null | undefined | number> = [
      null,
      undefined,
      "",
      "no-slash",
      "workspace-with-trailing/",
      "/leading-slash",
      42,
    ];
    for (const input of inputs) {
      expect(() => safeGetSignedDownloadUrl(input as unknown as string)).not.toThrow();
    }
  });
});
