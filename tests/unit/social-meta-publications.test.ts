import { describe, expect, it } from "vitest";
import {
  mergeMetaPublicationCandidates,
  normalizeMetaPublication,
  rankMetaPublicationCandidates,
} from "@/lib/social/meta-publications";

describe("Meta publication candidates", () => {
  it("normalizes a scheduled Facebook post without treating it as published", () => {
    const candidate = normalizeMetaPublication(
      "facebook",
      {
        id: "page_123_456",
        message: "Launch day",
        created_time: "2026-09-20T08:00:00+0000",
        scheduled_publish_time: "2026-09-25T09:30:00+0000",
        is_published: false,
        permalink_url: "https://www.facebook.com/page/posts/456",
      },
      new Date("2026-09-22T10:00:00.000Z"),
    );

    expect(candidate).toMatchObject({
      id: "page_123_456",
      platform: "facebook",
      status: "scheduled",
      caption: "Launch day",
      permalink: "https://www.facebook.com/page/posts/456",
    });
    expect(candidate.scheduledAt?.toISOString()).toBe("2026-09-25T09:30:00.000Z");
    expect(candidate.publishedAt).toBeNull();
  });

  it("normalizes Instagram reels and rejects unsafe provider URLs", () => {
    const candidate = normalizeMetaPublication("instagram", {
      id: "ig_789",
      caption: "Behind the scenes",
      media_type: "VIDEO",
      media_product_type: "REELS",
      timestamp: "2026-09-21T12:00:00+0000",
      permalink: "http://instagram.com/reel/unsafe",
      thumbnail_url: "https://cdn.example/reel.jpg",
    });

    expect(candidate).toMatchObject({
      id: "ig_789",
      platform: "instagram",
      status: "published",
      mediaType: "reel",
      permalink: null,
      thumbnailUrl: "https://cdn.example/reel.jpg",
    });
    expect(candidate.publishedAt?.toISOString()).toBe("2026-09-21T12:00:00.000Z");
  });

  it("normalizes Facebook attachment previews from the nested Graph shape", () => {
    const candidate = normalizeMetaPublication("facebook", {
      id: "fb-attachment-1",
      message: "Attachment",
      created_time: "2026-09-21T09:00:00Z",
      attachments: {
        data: [
          {
            media_type: "video",
            thumbnail_url: "https://cdn.example.test/thumb.jpg",
          },
        ],
      },
    });

    expect(candidate.mediaType).toBe("video");
    expect(candidate.thumbnailUrl).toBe("https://cdn.example.test/thumb.jpg");
  });

  it("deduplicates candidates and sorts scheduled posts before newer published posts", () => {
    const scheduled = normalizeMetaPublication("facebook", {
      id: "scheduled-1",
      scheduled_publish_time: "2026-09-30T09:00:00Z",
      is_published: false,
    });
    const published = normalizeMetaPublication("facebook", {
      id: "published-1",
      created_time: "2026-09-21T09:00:00Z",
      is_published: true,
    });

    const result = mergeMetaPublicationCandidates([
      published,
      scheduled,
      { ...published, caption: "updated duplicate" },
    ]);

    expect(result.map((item) => item.id)).toEqual(["scheduled-1", "published-1"]);
  });

  it("ranks a date and caption match first without auto-linking it", () => {
    const targetDate = new Date("2026-09-25T09:00:00.000Z");
    const candidates = [
      normalizeMetaPublication("facebook", {
        id: "weak",
        message: "Other content",
        created_time: "2026-09-10T09:00:00Z",
        is_published: true,
      }),
      normalizeMetaPublication("facebook", {
        id: "strong",
        message: "Launch day campaign",
        scheduled_publish_time: "2026-09-25T09:30:00Z",
        is_published: false,
      }),
    ];

    expect(
      rankMetaPublicationCandidates(candidates, {
        targetDate,
        searchText: "Launch day",
      })[0]?.id,
    ).toBe("strong");
  });
});

describe("Meta Story publications", () => {
  it("identifies a Story via media_product_type instead of its reported media_type", () => {
    // Meta reports Stories with media_type IMAGE or VIDEO, so before the
    // STORY branch this rendered as "Image"/"Video" and was indistinguishable
    // from a feed post.
    const candidate = normalizeMetaPublication("instagram", {
      id: "ig-story-1",
      caption: "Behind the scenes",
      media_type: "VIDEO",
      media_product_type: "STORY",
      timestamp: "2026-09-21T12:00:00+0000",
    });

    expect(candidate.mediaType).toBe("story");
    expect(candidate.publishedAt?.toISOString()).toBe("2026-09-21T12:00:00.000Z");
    expect(candidate.expiresAt?.toISOString()).toBe("2026-09-22T12:00:00.000Z");
  });

  it("keeps a Story permalink and still stamps the expiry window", () => {
    const candidate = normalizeMetaPublication("instagram", {
      id: "ig-story-2",
      media_type: "IMAGE",
      media_product_type: "STORY",
      timestamp: "2026-09-21T08:00:00+0000",
      permalink: "https://instagram.com/stories/acme/1234",
    });

    expect(candidate.permalink).toBe("https://instagram.com/stories/acme/1234");
    expect(candidate.expiresAt?.toISOString()).toBe("2026-09-22T08:00:00.000Z");
  });

  it("still stamps an expiry when Meta omits every timestamp", () => {
    // The `?? now` fallback is what guarantees a linkless Story can satisfy
    // `publication_published_needs_url_time_publisher`.
    const now = new Date("2026-09-21T10:00:00.000Z");
    const candidate = normalizeMetaPublication(
      "instagram",
      { id: "ig-story-3", media_type: "VIDEO", media_product_type: "STORY" },
      now,
    );

    expect(candidate.expiresAt?.toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });

  it("leaves permanent media without an expiry window", () => {
    for (const raw of [
      { media_type: "IMAGE" },
      { media_type: "VIDEO" },
      { media_type: "VIDEO", media_product_type: "FEED" },
      { media_type: "CAROUSEL_ALBUM", media_product_type: "FEED" },
      { media_type: "VIDEO", media_product_type: "REELS" },
    ]) {
      expect(
        normalizeMetaPublication("instagram", { id: `x-${JSON.stringify(raw)}`, ...raw }).expiresAt,
      ).toBeNull();
    }
  });

  it("stamps the window from publish time for a scheduled Story that is not live yet", () => {
    const candidate = normalizeMetaPublication(
      "instagram",
      {
        id: "ig-story-scheduled",
        media_type: "VIDEO",
        media_product_type: "STORY",
        timestamp: "2026-09-25T09:00:00+0000",
        scheduled_publish_time: "2026-09-26T09:00:00+0000",
        is_published: false,
      },
      new Date("2026-09-24T10:00:00.000Z"),
    );

    expect(candidate.status).toBe("scheduled");
    // Window is measured from the object's own timestamp; the service is what
    // decides not to persist it until the record is actually published.
    expect(candidate.expiresAt?.toISOString()).toBe("2026-09-26T09:00:00.000Z");
  });
});
