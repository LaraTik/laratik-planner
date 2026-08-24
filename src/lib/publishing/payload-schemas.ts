import { z } from "zod";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 4) — Versioned
 * `platformPayload` Zod schemas for every supported channel.
 *
 * Per the master prompt:
 *
 *   "Define and document a versioned `platformPayload` schema. Do
 *    not duplicate JSON fields into new top-level `content_item`
 *    columns. Create typed Zod schemas for every payload and
 *    derive form controls and server validation from the schemas."
 *
 * Three layers:
 *
 *   1. **Common** — the fields every Post / Reel / other format
 *      shares (destination profile, schedule override, caption,
 *      hashtags, first comment, CTA, UTM, mentions, location,
 *      language, alt text, disclosures, publication method,
 *      approval state, delivery references). Documented as
 *      `CommonPublishingFieldsSchema`.
 *
 *   2. **Per-platform** — Instagram Post, Instagram Reel,
 *      Facebook, TikTok, LinkedIn, YouTube, Pinterest, X, and a
 *      catch-all "Other/manual" for manual channels. Each
 *      platform schema is a `z.object` that includes the common
 *      fields (via `.merge()`) and adds the platform-specific
 *      fields from the master prompt's "Platform payloads must
 *      support" section.
 *
 *   3. **Discriminated union** — `PlatformPayloadSchema` is a
 *      `z.discriminatedUnion` keyed on `platform`. The service
 *      layer (M4.2) uses it to validate the channel row's
 *      `platform_payload` JSONB column on every write.
 *
 * The schemas are stable across the lifecycle. New fields are
 * additive and versioned via `schemaVersion: 1` in the JSONB
 * payload. A migration to `schemaVersion: 2` would add a
 * `z.union` branch and a transform from v1 → v2.
 *
 * Why a single discriminated union and not a per-platform file:
 *   - The form-builder / service layer needs one import to
 *     handle every channel.
 *   - The discriminated union is the source of truth for the
 *     `platform_payload` JSONB schema; the service-layer Zod
 *     parse IS the database constraint.
 *   - Adding a 9th platform is a one-row change in this file.
 *
 * Style note: the schemas intentionally use `z.string().min(1)`
 * instead of `z.string().nonempty()` so the "this field is
 * required" message is uniform across the read-side and the
 * server-side. The first-comment / alt-text / language fields
 * are optional everywhere except where the readiness service
 * (M4.4) declares a blocker — the schema's `optional()` is the
 * shape; the readiness service is the rule.
 */

const PLATFORM_VERSION = 1 as const;

// ─── Common fields (every channel) ────────────────────────────────────

/**
 * A delivery-version reference is just the version ID, scoped to
 * the content item. The channel row joins to the
 * `delivery_version` row by `id` and asserts the
 * `approvedDeliveryVersionId` on the `content_item` matches.
 */
export const DeliveryReferenceSchema = z.object({
  deliveryVersionId: z.string().uuid(),
  role: z.enum(["primary", "thumbnail", "carousel", "transcript", "subtitle"]),
});

/**
 * UTM parameters — the five documented parameters. The
 * readiness service (M4.4) requires `utm_source` + `utm_medium`
 * when `destinationUrl` is set; the schema accepts them
 * optionally so a draft can save without them.
 */
export const UtmParametersSchema = z.object({
  utmSource: z.string().min(1).max(120).optional(),
  utmMedium: z.string().min(1).max(120).optional(),
  utmCampaign: z.string().min(1).max(120).optional(),
  utmTerm: z.string().min(1).max(120).optional(),
  utmContent: z.string().min(1).max(120).optional(),
});

/**
 * Account handle (e.g. "@laratik") is a free-text string; the
 * channel service resolves it to a `social_channel` row at
 * save time. We don't FK-constrain because channels are
 * multi-tenant and the handle can change without the row
 * being recreated.
 */
export const MentionSchema = z.object({
  handle: z.string().min(1).max(80),
  displayName: z.string().min(1).max(120).optional(),
});

/**
 * A collaborator is a co-author of the post on platforms that
 * support it (Instagram, Reels, etc.). Collaborators must be
 * invited via the platform's invite flow before they appear in
 * the published post; the readiness service treats the
 * collaborator *invite* as a recommendation, not a blocker.
 */
export const CollaboratorSchema = z.object({
  handle: z.string().min(1).max(80),
  role: z.enum(["co_author", "invited", "tagged"]).default("tagged"),
});

/**
 * Disclosures — three orthogonal flags the readiness service
 * (M4.4) inspects. `paidPartnership` implies the platform will
 * show the "Paid partnership" label. `aiGenerated` is the
 * metadata tag for synthetic / AI-generated content. The
 * `rightsConfirmed` flag is the agency-side attestation that
 * every media asset in the package has cleared rights.
 */
export const DisclosuresSchema = z.object({
  paidPartnership: z.boolean().default(false),
  aiGenerated: z.boolean().default(false),
  syntheticMedia: z.boolean().default(false),
  rightsConfirmed: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

/**
 * Publication method — the actual deployment channel. Most
 * channels go through the platform API (`api`), but agencies
 * with a manual workflow can use `manual` (which surfaces a
 * checklist in the publish UI). `scheduled` is the
 * read-side view of "the system holds this and will publish
 * at the scheduled time"; the API and the manual path both
 * end up in this state.
 */
export const PublicationMethodSchema = z.enum(["api", "manual", "scheduled", "draft_only"]);

/**
 * Approval state for the final copy. The publish UI writes
 * `finalCopyApproved = true` only when the agency admin (or
 * the platform owner on a self-service plan) has reviewed the
 * complete package. The readiness service treats this as a
 * hard blocker for `Ready for publishing`.
 */
export const ApprovalStateSchema = z.object({
  finalCopyApproved: z.boolean().default(false),
  approvedByUserId: z.string().uuid().nullable().default(null),
  approvedAt: z.string().datetime().nullable().default(null),
});

/**
 * The common shape every platform shares. Merged into the
 * per-platform schemas via `z.object({}).merge(...)`. Field
 * names match the master prompt's "Common publishing package"
 * list.
 */
export const CommonPublishingFieldsSchema = z.object({
  schemaVersion: z.literal(PLATFORM_VERSION),
  selectedDestinationProfile: z
    .object({
      socialChannelId: z.string().uuid(),
    })
    .optional(),
  scheduleOverride: z
    .object({
      plannedPublishAt: z.string().datetime().optional(),
      timezone: z.string().min(1).max(80).optional(),
    })
    .optional(),
  caption: z.string().min(1).max(2_200).optional(),
  description: z.string().min(1).max(10_000).optional(),
  hashtags: z.array(z.string().min(1).max(60)).max(30).default([]),
  firstComment: z.string().min(1).max(2_200).optional(),
  callToAction: z
    .object({
      label: z.string().min(1).max(40),
      url: z.string().url(),
    })
    .optional(),
  destinationUrl: z.string().url().optional(),
  utm: UtmParametersSchema.optional(),
  mentions: z.array(MentionSchema).max(50).default([]),
  collaborators: z.array(CollaboratorSchema).max(10).default([]),
  location: z
    .object({
      name: z.string().min(1).max(120),
      externalId: z.string().min(1).max(120).optional(),
    })
    .optional(),
  contentLanguage: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[a-z]{2,3}(-[A-Z][a-zA-Z]+)?$/)
    .optional(),
  altText: z.string().min(1).max(2_000).optional(),
  disclosures: DisclosuresSchema.default({
    paidPartnership: false,
    aiGenerated: false,
    syntheticMedia: false,
    rightsConfirmed: false,
  }),
  publicationMethod: PublicationMethodSchema.default("api"),
  approval: ApprovalStateSchema.default({
    finalCopyApproved: false,
    approvedByUserId: null,
    approvedAt: null,
  }),
  deliveryReferences: z.array(DeliveryReferenceSchema).max(10).default([]),
});

// ─── Per-platform schemas ─────────────────────────────────────────────

/**
 * Instagram Post — single image, video, or carousel ordering,
 * feed crop / aspect selection, branded-content disclosure.
 */
export const InstagramPostPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("instagram"),
    /** The selected feed-crop — the agency's social_profile determines what's supported. */
    feedCrop: z.enum(["1:1", "4:5", "16:9", "9:16", "original"]).default("original"),
    /** Media ordering for a carousel. Empty for single-image / single-video. */
    carouselOrder: z.array(z.string().uuid()).max(10).default([]),
    /** Branded-content partner handle. */
    brandedContentPartner: z.string().min(1).max(80).optional(),
  }),
);

/**
 * Instagram Reel — video asset, cover frame, transcript review,
 * audio rights, comment / remix controls.
 */
export const InstagramReelPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("instagram_reel"),
    coverFrame: z
      .object({
        deliveryVersionId: z.string().uuid(),
        timestampSeconds: z.number().int().min(0).max(3600).optional(),
      })
      .optional(),
    /** Subtitles — caption / transcript reference. */
    subtitles: z
      .object({
        language: z.string().min(2).max(10),
        deliveryVersionId: z.string().uuid(),
      })
      .optional(),
    transcriptReviewed: z.boolean().default(false),
    audioRightsConfirmed: z.boolean().default(false),
    allowComments: z.boolean().default(true),
    allowRemix: z.boolean().default(true),
  }),
);

/**
 * Facebook — message, link + CTA, media presentation,
 * accessibility text, Reel interaction settings when applicable.
 */
export const FacebookPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("facebook"),
    title: z.string().min(1).max(100).optional(),
    descriptionOverride: z.string().min(1).max(500).optional(),
    mediaPresentation: z.enum(["feed", "story", "reel", "marketplace_listing"]).default("feed"),
    reelInteraction: z
      .object({
        allowComments: z.boolean().default(true),
        allowRemix: z.boolean().default(false),
        allowDuet: z.boolean().default(false),
      })
      .optional(),
  }),
);

/**
 * TikTok — caption/title, privacy level, Duet / Stitch,
 * cover timestamp, music rights.
 */
export const TikTokPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("tiktok"),
    privacy: z.enum(["public", "friends", "private", "followers_only"]).default("public"),
    allowComments: z.boolean().default(true),
    allowDuet: z.boolean().default(true),
    allowStitch: z.boolean().default(true),
    coverTimestampSeconds: z.number().int().min(0).max(3600).optional(),
    commercialContentDisclosure: z.boolean().default(false),
    musicRightsConfirmed: z.boolean().default(false),
  }),
);

/**
 * LinkedIn — commentary, article-style title / description /
 * link, document title, visibility / audience.
 */
export const LinkedInPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("linkedin"),
    articleTitle: z.string().min(1).max(150).optional(),
    articleDescription: z.string().min(1).max(2_000).optional(),
    documentTitle: z.string().min(1).max(150).optional(),
    visibility: z.enum(["public", "connections", "logged_in"]).default("public"),
    audienceTargeting: z
      .object({
        industryCodes: z.array(z.string().min(1).max(20)).max(50).optional(),
        functionCodes: z.array(z.string().min(1).max(20)).max(50).optional(),
        seniorities: z.array(z.string().min(1).max(40)).max(20).optional(),
      })
      .optional(),
  }),
);

/**
 * YouTube — title, description, tags, category, privacy,
 * playlist, thumbnail, language, captions, made-for-kids.
 */
export const YouTubePayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("youtube"),
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(5_000).optional(),
    tags: z.array(z.string().min(1).max(40)).max(500).default([]),
    categoryId: z.string().min(1).max(20).default("22"), // 22 = People & Blogs
    privacy: z.enum(["public", "unlisted", "private"]).default("unlisted"),
    playlistId: z.string().min(1).max(80).optional(),
    thumbnail: z
      .object({
        deliveryVersionId: z.string().uuid(),
      })
      .optional(),
    defaultLanguage: z
      .string()
      .min(2)
      .max(10)
      .regex(/^[a-z]{2,3}(-[A-Z][a-zA-Z]+)?$/)
      .optional(),
    captionTrack: z
      .object({
        language: z.string().min(2).max(10),
        deliveryVersionId: z.string().uuid(),
      })
      .optional(),
    madeForKids: z.boolean().default(false),
    notifySubscribers: z.boolean().default(true),
  }),
);

/**
 * Pinterest — pin title, description, board, destination link,
 * alt text, cover / media selection, product tags.
 */
export const PinterestPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("pinterest"),
    pinTitle: z.string().min(1).max(100),
    boardId: z.string().min(1).max(80),
    productTags: z
      .array(
        z.object({
          productId: z.string().min(1).max(120),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
        }),
      )
      .max(50)
      .default([]),
  }),
);

/**
 * X — post text, media ordering, alt text per asset, reply
 * settings, poll data.
 */
export const XPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("x"),
    replySettings: z
      .enum(["everyone", "mentioned", "followers", "subscribers"])
      .default("everyone"),
    mediaAlt: z
      .array(
        z.object({ mediaIndex: z.number().int().min(0), altText: z.string().min(1).max(1_000) }),
      )
      .max(4)
      .default([]),
    poll: z
      .object({
        options: z.array(z.string().min(1).max(25)).min(2).max(4),
        durationMinutes: z.number().int().min(5).max(10_080), // up to 7 days
      })
      .optional(),
  }),
);

/**
 * Other / manual — title, caption / description, hashtags,
 * destination link, accessibility text, publishing notes,
 * manual checklist.
 */
export const OtherPayloadSchema = CommonPublishingFieldsSchema.merge(
  z.object({
    platform: z.literal("other"),
    title: z.string().min(1).max(200).optional(),
    publishingNotes: z.string().max(2_000).optional(),
    manualChecklist: z
      .array(
        z.object({
          label: z.string().min(1).max(120),
          completed: z.boolean().default(false),
        }),
      )
      .max(20)
      .default([]),
  }),
);

// ─── Discriminated union ──────────────────────────────────────────────

export const PlatformPayloadSchema = z.discriminatedUnion("platform", [
  InstagramPostPayloadSchema,
  InstagramReelPayloadSchema,
  FacebookPayloadSchema,
  TikTokPayloadSchema,
  LinkedInPayloadSchema,
  YouTubePayloadSchema,
  PinterestPayloadSchema,
  XPayloadSchema,
  OtherPayloadSchema,
]);

export type PlatformPayload = z.infer<typeof PlatformPayloadSchema>;
export type InstagramPostPayload = z.infer<typeof InstagramPostPayloadSchema>;
export type InstagramReelPayload = z.infer<typeof InstagramReelPayloadSchema>;
export type FacebookPayload = z.infer<typeof FacebookPayloadSchema>;
export type TikTokPayload = z.infer<typeof TikTokPayloadSchema>;
export type LinkedInPayload = z.infer<typeof LinkedInPayloadSchema>;
export type YouTubePayload = z.infer<typeof YouTubePayloadSchema>;
export type PinterestPayload = z.infer<typeof PinterestPayloadSchema>;
export type XPayload = z.infer<typeof XPayloadSchema>;
export type OtherPayload = z.infer<typeof OtherPayloadSchema>;
export type CommonPublishingFields = z.infer<typeof CommonPublishingFieldsSchema>;
export type DeliveryReference = z.infer<typeof DeliveryReferenceSchema>;
export type Disclosure = z.infer<typeof DisclosuresSchema>;
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;
export type PublicationMethod = z.infer<typeof PublicationMethodSchema>;

export const PLATFORM_KEYS = PlatformPayloadSchema.options.map(
  (option) => option.shape.platform._def.value as string,
);

export const PLATFORM_KEY = PLATFORM_VERSION;
