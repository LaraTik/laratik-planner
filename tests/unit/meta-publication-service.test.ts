import { describe, expect, it } from "vitest";
import {
  externalPublicationSnapshot,
  externalPublicationStatusFromCandidate,
  isMetaPublicationUniqueViolation,
} from "@/lib/social/meta-publication-service";
import { normalizeMetaPublication } from "@/lib/social/meta-publications";

describe("Meta publication persistence helpers", () => {
  it("maps the external identity unique constraint to a duplicate-link conflict", () => {
    expect(
      isMetaPublicationUniqueViolation({
        code: "23505",
        constraint: "publication_record_external_post_unique",
      }),
    ).toBe(true);
    expect(
      isMetaPublicationUniqueViolation({
        code: "23505",
        constraint: "publication_record_channel_unique",
      }),
    ).toBe(false);
  });

  it("keeps scheduled external state separate from Planner publication state", () => {
    const candidate = normalizeMetaPublication("facebook", {
      id: "scheduled-1",
      message: "Scheduled",
      scheduled_publish_time: "2026-09-30T09:00:00Z",
      is_published: false,
      permalink_url: "https://facebook.com/page/posts/scheduled-1",
    });

    expect(externalPublicationStatusFromCandidate(candidate)).toBe("scheduled");
    expect(externalPublicationSnapshot(candidate)).toEqual({
      id: "scheduled-1",
      platform: "facebook",
      status: "scheduled",
      caption: "Scheduled",
      mediaType: "unknown",
      permalink: "https://facebook.com/page/posts/scheduled-1",
      thumbnailUrl: null,
      createdAt: null,
      scheduledAt: "2026-09-30T09:00:00.000Z",
      publishedAt: null,
      expiresAt: null,
    });
  });

  it("maps a live external candidate to the existing published outcome", () => {
    const candidate = normalizeMetaPublication("instagram", {
      id: "ig-1",
      caption: "Live",
      timestamp: "2026-09-21T12:00:00Z",
      permalink: "https://instagram.com/p/ig-1",
      media_type: "IMAGE",
    });

    expect(externalPublicationStatusFromCandidate(candidate)).toBe("published");
    expect(externalPublicationSnapshot(candidate).publishedAt).toBe("2026-09-21T12:00:00.000Z");
    expect(externalPublicationSnapshot(candidate).expiresAt).toBeNull();
  });

  it("snapshots a Story as a story with a nullable permalink and an expiry", () => {
    // This is the record that used to fail the whole link transaction: a
    // published candidate with `permalink === null` violated
    // `publication_published_needs_url_time_publisher`.
    const candidate = normalizeMetaPublication("instagram", {
      id: "ig-story-1",
      caption: "Launch teaser",
      media_type: "VIDEO",
      media_product_type: "STORY",
      timestamp: "2026-09-21T12:00:00Z",
    });

    expect(candidate.mediaType).toBe("story");
    expect(candidate.permalink).toBeNull();
    expect(candidate.status).toBe("published");

    const snapshot = externalPublicationSnapshot(candidate);
    expect(snapshot.mediaType).toBe("story");
    expect(snapshot.permalink).toBeNull();
    expect(snapshot.expiresAt).toBe("2026-09-22T12:00:00.000Z");
  });
});
