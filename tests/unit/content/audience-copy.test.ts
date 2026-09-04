import { describe, expect, it } from "vitest";
import {
  audienceCopyFromPayload,
  audienceCopyFingerprint,
  channelCopyStatus,
  mergeAudienceCopy,
} from "@/lib/content/audience-copy";

describe("canonical audience copy", () => {
  it("merges copy without changing strategy or creative fields", () => {
    const current = {
      schemaVersion: 1,
      caption: "Old",
      hook: "Strategy hook",
      hashtags: ["old"],
    };
    const next = mergeAudienceCopy("static_post", current, {
      caption: "New",
      hashtags: ["new"],
    });
    expect(next.caption).toBe("New");
    expect(next.hashtags).toEqual(["new"]);
    expect(next.hook).toBe("Strategy hook");
  });

  it("exposes only audience-facing keys to shared consumers", () => {
    expect(
      audienceCopyFromPayload({ caption: "x", hook: "y", location: { name: "Dubai" } }),
    ).toEqual({
      caption: "x",
      location: { name: "Dubai" },
    });
    expect(audienceCopyFingerprint({ caption: "x", hook: "y" })).toBe(
      audienceCopyFingerprint({ caption: "x", hook: "ignored" }),
    );
  });

  it("detects stale custom channel overrides from source revision metadata", () => {
    expect(channelCopyStatus({ hasOverride: false, sourceRevision: 1, currentRevision: 2 })).toBe(
      "inherited",
    );
    expect(channelCopyStatus({ hasOverride: true, sourceRevision: 2, currentRevision: 2 })).toBe(
      "custom",
    );
    expect(channelCopyStatus({ hasOverride: true, sourceRevision: 1, currentRevision: 2 })).toBe(
      "stale",
    );
  });
});
