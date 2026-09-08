import { describe, expect, it } from "vitest";
import {
  createMediaShareToken,
  hashMediaShareToken,
  MEDIA_SHARE_TTL_MS,
} from "@/lib/media/share-token";

describe("media public share tokens", () => {
  it("creates URL-safe tokens and stores only their hash", () => {
    const token = createMediaShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashMediaShareToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashMediaShareToken(token)).not.toBe(token);
  });

  it("hashes the same token deterministically and uses a 30-day default", () => {
    expect(hashMediaShareToken("known-token")).toBe(hashMediaShareToken("known-token"));
    expect(MEDIA_SHARE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("does not reuse generated tokens", () => {
    expect(createMediaShareToken()).not.toBe(createMediaShareToken());
  });
});
