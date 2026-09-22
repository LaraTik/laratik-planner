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
