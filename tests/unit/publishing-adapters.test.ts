import { describe, expect, it } from "vitest";

/**
 * FEAT-17 (GAP-FULL-REVIEW-2026-08-25) — per-platform publishing
 * adapter slot. The M4.5 dispatcher will call
 * `publishingAdapterRegistry[platform].publish(...)` for every
 * platform with a wired adapter. Today only LinkedIn and X have a
 * slot, and both return `unsupported` so the cron surfaces the gap
 * instead of silently no-oping.
 *
 * These tests pin the contract:
 *
 *  1. The registry exposes both adapters under the canonical
 *     platform keys ("linkedin", "x").
 *  2. `isSupportedPlatform` accepts only the platforms that have an
 *     adapter wired today.
 *  3. Each adapter's `publish` returns a typed `PublishResult` with
 *     `ok: false` and `reason: "unsupported"`. The result is
 *     never thrown — the dispatcher relies on the typed result so it
 *     can record the failure and move on.
 *  4. The adapter's `platform` field matches the registry key so a
 *     future "look up by platform" call cannot mis-route.
 */

import {
  LinkedInPublishingAdapter,
  XPublishingAdapter,
  isSupportedPlatform,
  publishingAdapterRegistry,
} from "@/lib/publishing/adapters";

describe("publishing adapters (FEAT-17)", () => {
  it("registers the LinkedIn + X adapters under the canonical platform keys", () => {
    expect(publishingAdapterRegistry.linkedin).toBe(LinkedInPublishingAdapter);
    expect(publishingAdapterRegistry.x).toBe(XPublishingAdapter);
    expect(Object.keys(publishingAdapterRegistry).sort()).toEqual(["linkedin", "x"]);
  });

  it("matches the platform field on each adapter to the registry key", () => {
    expect(LinkedInPublishingAdapter.platform).toBe("linkedin");
    expect(XPublishingAdapter.platform).toBe("x");
  });

  it("isSupportedPlatform accepts only the wired platforms", () => {
    expect(isSupportedPlatform("linkedin")).toBe(true);
    expect(isSupportedPlatform("x")).toBe(true);
    // Platforms without a slot today must NOT claim support.
    expect(isSupportedPlatform("instagram")).toBe(false);
    expect(isSupportedPlatform("facebook")).toBe(false);
    expect(isSupportedPlatform("tiktok")).toBe(false);
    expect(isSupportedPlatform("youtube")).toBe(false);
    expect(isSupportedPlatform("pinterest")).toBe(false);
    expect(isSupportedPlatform("threads")).toBe(false);
    expect(isSupportedPlatform("snapchat")).toBe(false);
    expect(isSupportedPlatform("other")).toBe(false);
    expect(isSupportedPlatform("not-a-platform")).toBe(false);
  });

  it("returns 'unsupported' for the LinkedIn adapter", async () => {
    const result = await LinkedInPublishingAdapter.publish({
      actorId: "00000000-0000-0000-0000-000000000001",
      // The adapter never reads the payload (it always returns
      // unsupported), but we pass a valid shape so the contract
      // matches what the M4.5 dispatcher will send.
      payload: {
        platform: "linkedin",
        // CommonPublishingFields minimum required fields.
        destinationProfileId: "fake",
        caption: "hello",
        hashtags: [],
      } as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("unsupported");
      // Detail is a human-readable string; we just assert it's set
      // so the dispatcher / audit row can surface it.
      expect(typeof result.detail).toBe("string");
    }
  });

  it("returns 'unsupported' for the X adapter", async () => {
    const result = await XPublishingAdapter.publish({
      actorId: "00000000-0000-0000-0000-000000000001",
      payload: {
        platform: "x",
        destinationProfileId: "fake",
        caption: "hello",
        hashtags: [],
      } as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("unsupported");
      expect(typeof result.detail).toBe("string");
    }
  });

  it("never throws — the dispatcher relies on the typed result to record the failure", async () => {
    // The adapters must not throw on any input. Even a malformed
    // payload (which the service layer would have rejected before
    // the dispatcher fires) must resolve with a failure result so
    // the cron tick can move on.
    await expect(
      LinkedInPublishingAdapter.publish({ actorId: "x", payload: {} as never }),
    ).resolves.toBeDefined();
    await expect(
      XPublishingAdapter.publish({ actorId: "x", payload: {} as never }),
    ).resolves.toBeDefined();
  });
});
