import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  signDownloadPath,
  signUploadPath,
  verifyDownloadToken,
  verifyUploadToken,
} from "@/lib/storage/signed-url";

/**
 * signed-url roundtrip + tamper-resistance tests.
 *
 * We exercise:
 *   - upload + download happy paths
 *   - expiry handling (now > expiresAt)
 *   - signature tampering (last-byte flip in the tag)
 *   - cross-secret verification (sign with one secret, verify with
 *     another — must fail)
 *   - wrong-action tokens (upload token fed into download verifier)
 *   - malformed inputs (no separator, non-JSON payload)
 *   - different expiry windows produce different tokens
 *
 * `UPLOAD_TOKEN_SECRET` is set in `beforeEach` to a known value so
 * the test is deterministic. The dev-only fallback in
 * `signed-url.ts` is only reached when the env var is missing.
 */

const TEST_SECRET = "a-very-long-test-secret-32-chars-min-padding!!";
const NOW = 1_700_000_000;

beforeEach(() => {
  process.env.UPLOAD_TOKEN_SECRET = TEST_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signUploadPath + verifyUploadToken roundtrip", () => {
  it("returns a token, expiresAt, and a relative path", () => {
    const signed = signUploadPath("ws-1", "logo", "png", { now: NOW });
    expect(signed.token).toBeTruthy();
    expect(signed.expiresAt).toBe(NOW + 300);
    expect(signed.path).toBe("ws-1/logo/png");
    expect(signed.token).toContain(".");
  });

  it("verifies a freshly-issued token", () => {
    const { token } = signUploadPath("ws-1", "logo", "png", { now: NOW });
    const result = verifyUploadToken(token, { now: NOW + 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toMatchObject({
        action: "upload",
        workspaceId: "ws-1",
        kind: "logo",
        ext: "png",
        expiresAt: NOW + 300,
      });
    }
  });

  it("rejects an expired token (now > expiresAt)", () => {
    const { token } = signUploadPath("ws-1", "logo", "png", { now: NOW, expiresInSeconds: 60 });
    const result = verifyUploadToken(token, { now: NOW + 61 });
    expect(result).toEqual({ ok: false, error: "Token expired" });
  });

  it("rejects a tampered token (last byte of the tag flipped)", () => {
    const { token } = signUploadPath("ws-1", "logo", "png", { now: NOW });
    const lastDot = token.lastIndexOf(".");
    const tag = token.slice(lastDot + 1);
    // Flip the last character to a different valid base64url char.
    const flipped = tag.endsWith("A") ? `${tag.slice(0, -1)}B` : `${tag.slice(0, -1)}A`;
    const tampered = `${token.slice(0, lastDot + 1)}${flipped}`;
    const result = verifyUploadToken(tampered, { now: NOW });
    expect(result.ok).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = signUploadPath("ws-1", "logo", "png", { now: NOW });
    process.env.UPLOAD_TOKEN_SECRET = "another-secret-also-32-chars-padding!!!";
    const result = verifyUploadToken(token, { now: NOW });
    expect(result).toEqual({ ok: false, error: "Signature mismatch" });
  });

  it("rejects a malformed token (no separator)", () => {
    const result = verifyUploadToken("not-a-valid-token", { now: NOW });
    expect(result).toEqual({ ok: false, error: "Malformed token" });
  });

  it("rejects a token whose payload is not valid JSON", () => {
    // Construct a token manually: a base64url-encoded non-JSON
    // payload with a correct HMAC tag (computed with the test
    // secret) so the signature check passes and the JSON.parse
    // branch is the one that throws.
    const payload = Buffer.from("not-json-at-all", "utf8").toString("base64url");
    const tag = createHmac("sha256", TEST_SECRET).update(payload).digest("base64url");
    const result = verifyUploadToken(`${payload}.${tag}`, { now: NOW });
    expect(result).toEqual({ ok: false, error: "Malformed payload" });
  });

  it("rejects a download token fed to the upload verifier (wrong action)", () => {
    const { token } = signDownloadPath("ws-1", "logo.png", { now: NOW });
    const result = verifyUploadToken(token, { now: NOW });
    expect(result).toEqual({ ok: false, error: "Wrong action: expected upload" });
  });

  it("produces a different token for a different expiry window", () => {
    const a = signUploadPath("ws-1", "logo", "png", { now: NOW, expiresInSeconds: 60 });
    const b = signUploadPath("ws-1", "logo", "png", { now: NOW, expiresInSeconds: 600 });
    expect(a.token).not.toBe(b.token);
    expect(a.expiresAt).not.toBe(b.expiresAt);
  });
});

describe("signDownloadPath + verifyDownloadToken roundtrip", () => {
  it("verifies a freshly-issued download token", () => {
    const { token } = signDownloadPath("ws-1", "ws-1/uuid.svg", { now: NOW });
    const result = verifyDownloadToken(token, { now: NOW + 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toMatchObject({
        action: "download",
        workspaceId: "ws-1",
        fileId: "ws-1/uuid.svg",
        expiresAt: NOW + 300,
      });
    }
  });

  it("rejects an expired download token", () => {
    const { token } = signDownloadPath("ws-1", "file", { now: NOW, expiresInSeconds: 30 });
    const result = verifyDownloadToken(token, { now: NOW + 31 });
    expect(result).toEqual({ ok: false, error: "Token expired" });
  });

  it("rejects a tampered download token", () => {
    const { token } = signDownloadPath("ws-1", "file", { now: NOW });
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const result = verifyDownloadToken(tampered, { now: NOW });
    expect(result.ok).toBe(false);
  });

  it("rejects an upload token fed to the download verifier (wrong action)", () => {
    const { token } = signUploadPath("ws-1", "logo", "png", { now: NOW });
    const result = verifyDownloadToken(token, { now: NOW });
    expect(result).toEqual({ ok: false, error: "Wrong action: expected download" });
  });
});

describe("secret configuration", () => {
  it("falls back to a dev secret when UPLOAD_TOKEN_SECRET is missing in development", () => {
    delete process.env.UPLOAD_TOKEN_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "development";
    const { token } = signUploadPath("ws-1", "logo", "png", { now: NOW });
    const result = verifyUploadToken(token, { now: NOW });
    expect(result.ok).toBe(true);
  });

  it("throws when UPLOAD_TOKEN_SECRET is missing in production", async () => {
    delete process.env.UPLOAD_TOKEN_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "production";
    // Force re-evaluation by re-importing the module after env change.
    vi.resetModules();
    await expect(async () => {
      const mod = await import("@/lib/storage/signed-url");
      mod.signUploadPath("ws-1", "logo", "png", { now: NOW });
    }).rejects.toThrow(/UPLOAD_TOKEN_SECRET/);
  });
});
