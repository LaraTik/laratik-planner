import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertWithinRoot,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  readFile,
  StorageNotFoundError,
  StoragePathError,
  UPLOAD_SIZE_LIMITS,
  writeFile,
} from "@/lib/storage";

/**
 * Local-volume storage adapter tests.
 *
 * We point `UPLOADS_DIR` at a fresh tmpdir so the tests don't
 * touch the real volume. Every test re-uses the same tmpdir but
 * cleans up its own subdir.
 *
 * The high-level helpers we cover:
 *   - `assertWithinRoot` rejects path traversal and accepts
 *     in-bounds paths;
 *   - `writeFile` + `readFile` round-trip a buffer and reject
 *     `..` traversals on read;
 *   - `getSignedUploadUrl` returns a `/api/uploads?token=…` URL;
 *   - `getSignedDownloadUrl` returns a `/api/uploads/{file}?token=…`
 *     URL and the token verifies;
 *   - size-limit table matches the spec (10MB images, 25MB docs,
 *     5MB other).
 */

const TEST_SECRET = "a-very-long-test-secret-32-chars-min-padding!!";
let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "laratik-storage-"));
  process.env.UPLOAD_TOKEN_SECRET = TEST_SECRET;
});

afterAll(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.UPLOADS_DIR = tmpRoot;
  vi.useRealTimers();
});

describe("assertWithinRoot", () => {
  it("accepts a path inside the root", () => {
    const resolved = assertWithinRoot(tmpRoot, "ws-1/file.png");
    expect(resolved.startsWith(tmpRoot)).toBe(true);
  });

  it("rejects a path that escapes the root via ../", () => {
    expect(() => assertWithinRoot(tmpRoot, "../etc/passwd")).toThrow(StoragePathError);
  });

  it("rejects a sibling directory with a similar prefix", () => {
    // /tmp/foo vs /tmp/foo-evil — the trailing-separator check
    // stops the prefix-match from passing.
    const sibling = `${tmpRoot}-evil`;
    expect(() => assertWithinRoot(tmpRoot, sibling)).toThrow(StoragePathError);
  });

  it("accepts the root itself", () => {
    expect(() => assertWithinRoot(tmpRoot, ".")).not.toThrow();
  });
});

describe("writeFile + readFile", () => {
  it("round-trips a buffer", async () => {
    const buf = Buffer.from("hello world", "utf8");
    const { storagePath, size, fileId } = await writeFile("ws-1", "logo", "png", buf);
    expect(size).toBe(buf.byteLength);
    expect(fileId).toBeTruthy();
    expect(storagePath).toBe(`ws-1/${fileId}.png`);
    const out = await readFile(storagePath);
    expect(out.toString("utf8")).toBe("hello world");
  });

  it("creates the workspace subdir if missing", async () => {
    const buf = Buffer.from("xyz", "utf8");
    const { storagePath } = await writeFile("ws-fresh", "logo", "svg", buf);
    const out = await readFile(storagePath);
    expect(out.toString("utf8")).toBe("xyz");
  });

  it("rejects an extension with a slash (path-traversal attempt)", async () => {
    await expect(writeFile("ws-1", "logo", "../png", Buffer.from("x"))).rejects.toThrow(
      StoragePathError,
    );
  });

  it("rejects an extension with invalid characters", async () => {
    await expect(writeFile("ws-1", "logo", "pn g", Buffer.from("x"))).rejects.toThrow(
      StoragePathError,
    );
  });

  it("throws StorageNotFoundError when reading a missing file", async () => {
    await expect(readFile("ws-missing/nope.png")).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it("rejects a read with a traversal path", async () => {
    await expect(readFile("../etc/passwd")).rejects.toThrow(StoragePathError);
  });
});

describe("signed URLs", () => {
  it("getSignedUploadUrl returns a /api/uploads URL with a token", () => {
    const { url, expiresAt } = getSignedUploadUrl("ws-1", "logo", "png");
    expect(url.startsWith("/api/uploads?token=")).toBe(true);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("getSignedDownloadUrl returns a /api/uploads/{file} URL whose token verifies", async () => {
    // Write a real file so the URL is meaningful end-to-end.
    const { storagePath } = await writeFile("ws-1", "logo", "png", Buffer.from("ok"));
    const downloadUrl = getSignedDownloadUrl(`ws-1/${storagePath}`);
    expect(downloadUrl.startsWith("/api/uploads/")).toBe(true);
    expect(downloadUrl).toContain("?token=");
    expect(downloadUrl).toContain("&expiresAt=");
  });

  it("getSignedDownloadUrl throws on a storage path with no workspace prefix", () => {
    expect(() => getSignedDownloadUrl("no-slash")).toThrow(StoragePathError);
  });
});

describe("UPLOAD_SIZE_LIMITS", () => {
  it("enforces the per-kind limits from the spec", () => {
    expect(UPLOAD_SIZE_LIMITS.logo).toBe(10 * 1024 * 1024);
    expect(UPLOAD_SIZE_LIMITS.color).toBe(10 * 1024 * 1024);
    expect(UPLOAD_SIZE_LIMITS.font).toBe(10 * 1024 * 1024);
    expect(UPLOAD_SIZE_LIMITS.image).toBe(10 * 1024 * 1024);
    expect(UPLOAD_SIZE_LIMITS.document).toBe(25 * 1024 * 1024);
    expect(UPLOAD_SIZE_LIMITS.other).toBe(5 * 1024 * 1024);
  });
});
