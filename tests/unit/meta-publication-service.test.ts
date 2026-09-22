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
  });
});
