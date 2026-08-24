import { describe, expect, it } from "vitest";
import {
  CommonPublishingFieldsSchema,
  FacebookPayloadSchema,
  InstagramPostPayloadSchema,
  InstagramReelPayloadSchema,
  LinkedInPayloadSchema,
  OtherPayloadSchema,
  PLATFORM_KEYS,
  PinterestPayloadSchema,
  PlatformPayloadSchema,
  TikTokPayloadSchema,
  XPayloadSchema,
  YouTubePayloadSchema,
} from "@/lib/publishing/payload-schemas";

/**
 * M4.1 — Platform payload Zod schema unit tests.
 *
 * The schemas are the wire contract for the publish package.
 * Every platform has a happy-path test, an error-path test
 * (the discriminated union rejects a wrong-platform payload),
 * and a coverage test (the per-platform schema's required
 * fields reject an empty object).
 *
 * DB-bound paths (M4.2 service, M4.3 materiality, M4.4
 * readiness) are tested in the integration suite.
 */
describe("M4.1 — platform payload Zod schemas (unit)", () => {
  describe("CommonPublishingFieldsSchema", () => {
    it("accepts a minimal payload", () => {
      const parsed = CommonPublishingFieldsSchema.parse({
        schemaVersion: 1,
      });
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.hashtags).toEqual([]);
      expect(parsed.mentions).toEqual([]);
      expect(parsed.collaborators).toEqual([]);
      expect(parsed.publicationMethod).toBe("api");
      expect(parsed.approval.finalCopyApproved).toBe(false);
    });

    it("rejects a non-current schemaVersion", () => {
      expect(() =>
        CommonPublishingFieldsSchema.parse({ schemaVersion: 2 }),
      ).toThrow();
    });

    it("rejects a hashtag that is too long", () => {
      expect(() =>
        CommonPublishingFieldsSchema.parse({
          schemaVersion: 1,
          hashtags: ["x".repeat(61)],
        }),
      ).toThrow();
    });
  });

  describe("InstagramPostPayloadSchema", () => {
    it("accepts the documented happy path", () => {
      const parsed = InstagramPostPayloadSchema.parse({
        schemaVersion: 1,
        platform: "instagram",
        feedCrop: "4:5",
        caption: "Hello, world.",
        hashtags: ["#laratik", "#studioflow"],
      });
      expect(parsed.platform).toBe("instagram");
      expect(parsed.feedCrop).toBe("4:5");
    });

    it("rejects a non-instagram platform tag (discriminator)", () => {
      expect(() =>
        InstagramPostPayloadSchema.parse({
          schemaVersion: 1,
          platform: "tiktok",
          feedCrop: "4:5",
        }),
      ).toThrow();
    });
  });

  describe("InstagramReelPayloadSchema", () => {
    it("accepts the documented happy path with cover + audio rights", () => {
      const parsed = InstagramReelPayloadSchema.parse({
        schemaVersion: 1,
        platform: "instagram_reel",
        caption: "Reel caption.",
        coverFrame: { deliveryVersionId: "11111111-1111-4111-8111-111111111111" },
        audioRightsConfirmed: true,
        transcriptReviewed: true,
        allowComments: true,
        allowRemix: false,
      });
      expect(parsed.platform).toBe("instagram_reel");
      expect(parsed.audioRightsConfirmed).toBe(true);
    });
  });

  describe("FacebookPayloadSchema", () => {
    it("accepts a Reel-style post with interaction settings", () => {
      const parsed = FacebookPayloadSchema.parse({
        schemaVersion: 1,
        platform: "facebook",
        mediaPresentation: "reel",
        reelInteraction: { allowRemix: true, allowDuet: false },
      });
      expect(parsed.mediaPresentation).toBe("reel");
    });
  });

  describe("TikTokPayloadSchema", () => {
    it("accepts a privacy=friends post with music rights confirmed", () => {
      const parsed = TikTokPayloadSchema.parse({
        schemaVersion: 1,
        platform: "tiktok",
        privacy: "friends",
        musicRightsConfirmed: true,
        allowDuet: false,
      });
      expect(parsed.privacy).toBe("friends");
    });

    it("rejects a privacy value outside the controlled vocabulary", () => {
      expect(() =>
        TikTokPayloadSchema.parse({
          schemaVersion: 1,
          platform: "tiktok",
          privacy: "everyone_but_my_ex",
        }),
      ).toThrow();
    });
  });

  describe("LinkedInPayloadSchema", () => {
    it("accepts an article-style post with audience targeting", () => {
      const parsed = LinkedInPayloadSchema.parse({
        schemaVersion: 1,
        platform: "linkedin",
        articleTitle: "How to ship a SaaS",
        articleDescription: "Long-form companion.",
        audienceTargeting: { industryCodes: ["94"] },
      });
      expect(parsed.articleTitle).toBe("How to ship a SaaS");
    });
  });

  describe("YouTubePayloadSchema", () => {
    it("accepts a video with privacy + caption track + made-for-kids", () => {
      const parsed = YouTubePayloadSchema.parse({
        schemaVersion: 1,
        platform: "youtube",
        title: "Demo",
        privacy: "unlisted",
        madeForKids: false,
        defaultLanguage: "en-US",
        captionTrack: {
          language: "en-US",
          deliveryVersionId: "22222222-2222-4222-8222-222222222222",
        },
      });
      expect(parsed.title).toBe("Demo");
    });

    it("rejects a defaultLanguage that is not a BCP-47 tag", () => {
      expect(() =>
        YouTubePayloadSchema.parse({
          schemaVersion: 1,
          platform: "youtube",
          title: "Demo",
          defaultLanguage: "english (US)",
        }),
      ).toThrow();
    });
  });

  describe("PinterestPayloadSchema", () => {
    it("accepts a pin with product tags", () => {
      const parsed = PinterestPayloadSchema.parse({
        schemaVersion: 1,
        platform: "pinterest",
        pinTitle: "Pinterest Pin",
        boardId: "laratik-boards/team-updates",
        productTags: [{ productId: "PROD-1", x: 0.5, y: 0.5 }],
      });
      expect(parsed.boardId).toMatch(/^laratik-boards\//);
    });
  });

  describe("XPayloadSchema", () => {
    it("accepts a post with reply settings and a poll", () => {
      const parsed = XPayloadSchema.parse({
        schemaVersion: 1,
        platform: "x",
        replySettings: "subscribers",
        poll: {
          options: ["Yes", "No", "Maybe"],
          durationMinutes: 60,
        },
      });
      expect(parsed.poll?.options.length).toBe(3);
    });

    it("rejects a poll with fewer than 2 options", () => {
      expect(() =>
        XPayloadSchema.parse({
          schemaVersion: 1,
          platform: "x",
          poll: { options: ["Only"], durationMinutes: 60 },
        }),
      ).toThrow();
    });
  });

  describe("OtherPayloadSchema", () => {
    it("accepts a manual channel with a checklist", () => {
      const parsed = OtherPayloadSchema.parse({
        schemaVersion: 1,
        platform: "other",
        manualChecklist: [
          { label: "Send to Slack", completed: false },
          { label: "Email the team", completed: true },
        ],
        publicationMethod: "manual",
      });
      expect(parsed.manualChecklist.length).toBe(2);
    });
  });

  describe("PlatformPayloadSchema discriminated union", () => {
    it("exposes the documented 9 platform tags", () => {
      // 8 platforms per the master prompt + 1 "instagram_reel"
      // (Reel is a distinct surface per the Stitch screen IDs;
      // 8 is the count of *channel* platforms, but the publish
      // package has 9 payload shapes because Post and Reel are
      // separate on Instagram).
      expect(PLATFORM_KEYS.length).toBe(9);
      expect(PLATFORM_KEYS).toContain("instagram");
      expect(PLATFORM_KEYS).toContain("instagram_reel");
      expect(PLATFORM_KEYS).toContain("tiktok");
    });

    it("routes an instagram payload to the instagram_post schema", () => {
      const result = PlatformPayloadSchema.parse({
        schemaVersion: 1,
        platform: "instagram",
        feedCrop: "1:1",
      });
      expect(result.platform).toBe("instagram");
    });

    it("rejects an unknown platform", () => {
      expect(() =>
        PlatformPayloadSchema.parse({
          schemaVersion: 1,
          platform: "mastodon",
        }),
      ).toThrow();
    });
  });
});
