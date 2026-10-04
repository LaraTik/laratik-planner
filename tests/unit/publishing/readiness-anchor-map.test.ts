import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  KNOWN_BLOCKER_PATHS,
  isManualDispatchBlocker,
  normaliseBlockerPath,
  readinessAnchorForPath,
  resolveBlockerTarget,
} from "@/lib/publishing/blocker-targets";

/**
 * The blocker → control map is the mechanism behind acceptance
 * criterion #1: no readiness issue may offer a Fix link that lands
 * somewhere with no control that resolves it.
 *
 * This test reads the readiness service's own source to enumerate the
 * paths it can emit, so adding a `REQUIRED_FIELDS` entry without
 * mapping its anchor fails here rather than shipping a dead-end link.
 */
const READINESS_SOURCE = readFileSync(
  join(process.cwd(), "src/lib/publishing/readiness.ts"),
  "utf8",
);

/** Every `path: "..."` literal the service declares. */
function servicePaths(): string[] {
  return [...READINESS_SOURCE.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]!);
}

/** Paths the service builds by templating a `channels[N].` prefix. */
const TEMPLATED_SUFFIXES = [
  "disclosures.rightsConfirmed",
  "disclosures.syntheticMedia",
  "payload",
  "approvedDeliveryVersion",
];

describe("readiness blocker → control map", () => {
  it("maps every path the readiness service can emit", () => {
    const emitted = new Set(servicePaths());
    expect(emitted.size).toBeGreaterThan(0);

    for (const path of emitted) {
      // `payload.caption` and friends are appended to a channelPath
      // template, so look them up in their normalised form.
      const normalised = normaliseBlockerPath(path);
      expect(
        resolveBlockerTarget(path),
        `readiness path "${path}" has no entry in blocker-targets`,
      ).toBeDefined();
      expect(KNOWN_BLOCKER_PATHS, `readiness path "${normalised}" is unmapped`).toContain(
        normalised,
      );
    }
  });

  it("maps every templated channel-path suffix", () => {
    for (const suffix of TEMPLATED_SUFFIXES) {
      const path = `channels[0].${suffix}`;
      expect(resolveBlockerTarget(path), `"${path}" is unmapped`).toBeDefined();
    }
  });

  it("never resolves a fix link to the generic #publishing anchor", () => {
    // The old implementation returned "#publishing" for every path that
    // was not delivery- or approval-related, which sent the operator
    // back to the same page with no control to edit.
    for (const path of KNOWN_BLOCKER_PATHS) {
      const anchor = readinessAnchorForPath(path);
      expect(anchor, `"${path}" resolved to #publishing`).not.toBe("#publishing");
    }
  });

  it("returns no anchor for manual-dispatch blockers", () => {
    // facebook / linkedin / instagram_reel / other require a
    // selectedDestinationProfile resolved at channel-link time. There
    // is no control on the publish page, so the row renders an explicit
    // manual-dispatch state instead of a link.
    expect(isManualDispatchBlocker("payload.destinationProfile")).toBe(true);
    expect(isManualDispatchBlocker("channels[0].payload.destinationProfile")).toBe(true);
    expect(readinessAnchorForPath("payload.destinationProfile")).toBeUndefined();
  });

  it("returns no anchor for an unknown path rather than a guess", () => {
    expect(readinessAnchorForPath("payload.someFieldFromTheFuture")).toBeUndefined();
    expect(resolveBlockerTarget("payload.someFieldFromTheFuture")).toBeUndefined();
  });

  it("routes the required platform fields to the platform settings control", () => {
    // These are the fields whose absence previously made a YouTube or
    // Pinterest package unsaveable.
    for (const path of [
      "payload.title",
      "payload.pinTitle",
      "payload.boardId",
      "payload.privacy",
    ]) {
      expect(readinessAnchorForPath(path)).toBe("#publish-platform-settings");
    }
  });

  it("routes the rights confirmations to their own compliance anchors", () => {
    expect(readinessAnchorForPath("payload.audioRightsConfirmed")).toBe("#publish-audio-rights");
    expect(readinessAnchorForPath("payload.transcriptReviewed")).toBe(
      "#publish-transcript-reviewed",
    );
    expect(readinessAnchorForPath("payload.musicRightsConfirmed")).toBe("#publish-music-rights");
  });

  it("keeps delivery and approval issues on their owning panels", () => {
    expect(readinessAnchorForPath("channels[0].approvedDeliveryVersion")).toBe("#assets-versions");
    expect(readinessAnchorForPath("delivery.anything")).toBe("#assets-versions");
    expect(readinessAnchorForPath("approvals.openCount")).toBe("#workflow");
  });

  it("keeps cover and thumbnail on Assets, where the media lives", () => {
    expect(readinessAnchorForPath("payload.coverFrame")).toBe("#assets-versions");
    expect(readinessAnchorForPath("payload.thumbnail")).toBe("#assets-versions");
  });

  it("routes the editable copy fields to their own anchors", () => {
    expect(readinessAnchorForPath("payload.caption")).toBe("#publish-caption");
    expect(readinessAnchorForPath("payload.altText")).toBe("#publish-alt-text");
    expect(readinessAnchorForPath("payload.approval.finalCopyApproved")).toBe("#publish-approval");
    expect(readinessAnchorForPath("disclosures.rightsConfirmed")).toBe("#publish-disclosures");
    expect(readinessAnchorForPath("channels[0].disclosures.syntheticMedia")).toBe(
      "#publish-disclosures",
    );
  });
});
