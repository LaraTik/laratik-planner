/**
 * Per-format `content_item.format_payload` Zod schemas.
 *
 * The DB column is `jsonb` and the v1 contract was
 * `{ schemaVersion: 1 }` (see docs/content/format-payload-schemas.md).
 * Before this module, the schema was treated as `z.record(unknown)`
 * and only validated as a JSON object. This file is the typed
 * contract: every format has its own schema, every field is
 * optional (the planner may leave any of them blank), and a
 * `translations` map mirrors the same shape per locale.
 *
 * Why per-field, why optional:
 *   - StudioFlow §11 explicitly lists different fields per format
 *     (short_form_video has scenes, carousel has slideOutline,
 *     article has outline, etc.). A column-per-field is a
 *     combinatorial explosion; a single flat jsonb that covers
 *     every format is the chosen design.
 *   - Quick Create writes only the title/format/date/brief, so the
 *     format payload starts as `{ schemaVersion: 1 }` and grows
 *     as creative fills it in. Optional everywhere = no friction.
 *   - Translations are stored as a per-locale subset of the same
 *     shape. A field that doesn't exist in the source format
 *     (e.g. `scenes` on a `static_post`) won't exist in the
 *     translation either.
 *
 * The `translations` map is the v1 storage location for
 * localised values (decision recorded in the planning doc — see
 * AGENTS.md "formatPayload translations"). Migration to a sidecar
 * table is a later move once we have analytics demand.
 */
import { z } from "zod";

import { SUPPORTED_LOCALES, type LocaleCode } from "@/lib/i18n/locales";

const SCHEMA_VERSION = 1 as const;

/**
 * A *localised* mirror of the format payload. The keys are
 * locale codes (BCP 47 — only the ones in SUPPORTED_LOCALES for
 * v1) and the values are partials of the source format. Unknown
 * fields are silently dropped on parse (forward-compat) but
 * unknown locale codes are rejected so a typo doesn't sneak
 * untranslated content in.
 */
const TranslationMapSchema = z
  .record(z.string(), z.record(z.string(), z.unknown()))
  .superRefine((value, ctx) => {
    for (const code of Object.keys(value)) {
      if (!SUPPORTED_LOCALES.some((l) => l.code === code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [code],
          message: `Unknown locale: ${code}`,
        });
      }
    }
  });

// ─── Per-format payloads ─────────────────────────────────────────────

/** A short tag line, ≤ 100 chars. Used for `hook` / `mainMessage` / `callToAction`. */
const ShortText = z.string().trim().max(220);

/**
 * `static_post` — single image / video / text post.
 * The publish form is the per-platform adapter (Instagram, X,
 * Facebook, LinkedIn). The planner-facing fields here are
 * creative intent, not platform specifics.
 */
export const StaticPostPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  objective: z.enum(["awareness", "consideration", "conversion", "retention"]).optional(),
  audience: z.string().trim().max(200).optional(),
  hook: ShortText.optional(),
  mainMessage: ShortText.optional(),
  callToAction: ShortText.optional(),
  /**
   * Pre-publish caption draft. Per-platform adaptation lives on
   * `content_item_channel.platform_payload.caption` (see
   * payload-schemas.ts). This is the planner's working draft.
   */
  caption: z.string().trim().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  firstComment: z.string().trim().max(2_200).optional(),
  /** Free-text visual direction for the designer. */
  visualDirection: z.string().trim().max(2_000).optional(),
  /** Per-slide visual notes when the post is a single-image deck. */
  visualSlides: z
    .array(
      z.object({
        position: z.number().int().min(1).max(20),
        summary: z.string().trim().max(220),
        visual: z.string().trim().max(500).optional(),
      }),
    )
    .max(20)
    .optional(),
  location: z
    .object({
      name: z.string().trim().min(1).max(120),
      externalId: z.string().trim().max(120).optional(),
    })
    .optional(),
  references: z.array(z.string().url().max(500)).max(20).optional(),
  /** Free-form notes — kept distinct from the structured fields. */
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type StaticPostPayload = z.infer<typeof StaticPostPayloadSchema>;

/** `carousel` — 2-10 slides. */
export const CarouselPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  slideCount: z.number().int().min(2).max(10).optional(),
  objective: z.enum(["awareness", "consideration", "conversion", "retention"]).optional(),
  audience: z.string().trim().max(200).optional(),
  hook: ShortText.optional(),
  mainMessage: ShortText.optional(),
  callToAction: ShortText.optional(),
  caption: z.string().trim().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  firstComment: z.string().trim().max(2_200).optional(),
  /**
   * Per-slide outline. `summary` is the copy line for the slide;
   * `visual` is the designer's direction (a one-line "use the
   * close-up of the watch on a marble tray" or a URL to a ref).
   */
  slideOutline: z
    .array(
      z.object({
        position: z.number().int().min(1).max(10),
        summary: z.string().trim().max(220),
        visual: z.string().trim().max(500).optional(),
      }),
    )
    .max(10)
    .optional(),
  visualDirection: z.string().trim().max(2_000).optional(),
  references: z.array(z.string().url().max(500)).max(20).optional(),
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type CarouselPayload = z.infer<typeof CarouselPayloadSchema>;

/** `story` — 1-5 vertical frames. */
export const StoryPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  frameCount: z.number().int().min(1).max(5).optional(),
  objective: z.enum(["awareness", "consideration", "conversion", "retention"]).optional(),
  audience: z.string().trim().max(200).optional(),
  hook: ShortText.optional(),
  callToAction: ShortText.optional(),
  caption: z.string().trim().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  visualDirection: z.string().trim().max(2_000).optional(),
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type StoryPayload = z.infer<typeof StoryPayloadSchema>;

/** `short_form_video` — Reels / TikTok / Shorts. */
export const ShortFormVideoPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  ratio: z.enum(["9:16", "1:1", "4:5"]).optional(),
  durationSeconds: z.number().int().min(5).max(90).optional(),
  hook: ShortText.optional(),
  mainMessage: ShortText.optional(),
  callToAction: ShortText.optional(),
  caption: z.string().trim().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  /**
   * Scene list — position + one-line summary + duration. The
   * designer/editor expands each scene into actual frames; this
   * is the planner's intent.
   */
  scenes: z
    .array(
      z.object({
        position: z.number().int().min(1).max(20),
        summary: z.string().trim().max(220),
        durationSeconds: z.number().int().min(1).max(60).optional(),
      }),
    )
    .max(20)
    .optional(),
  onScreenText: z.string().trim().max(2_000).optional(),
  voiceOverNotes: z.string().trim().max(2_000).optional(),
  audioReference: z.string().url().max(500).optional(),
  coverDirection: z.string().trim().max(500).optional(),
  visualDirection: z.string().trim().max(2_000).optional(),
  references: z.array(z.string().url().max(500)).max(20).optional(),
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type ShortFormVideoPayload = z.infer<typeof ShortFormVideoPayloadSchema>;

/** `long_form_video` — YouTube / LinkedIn video / IGTV. */
export const LongFormVideoPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  ratio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  durationSeconds: z.number().int().min(30).max(3_600).optional(),
  hook: ShortText.optional(),
  mainMessage: ShortText.optional(),
  callToAction: ShortText.optional(),
  caption: z.string().trim().max(10_000).optional(),
  description: z.string().trim().max(10_000).optional(),
  chapters: z
    .array(
      z.object({
        position: z.number().int().min(1).max(50),
        title: z.string().trim().max(220),
        startsAtSeconds: z.number().int().min(0).max(36_000),
      }),
    )
    .max(50)
    .optional(),
  visualDirection: z.string().trim().max(2_000).optional(),
  references: z.array(z.string().url().max(500)).max(20).optional(),
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type LongFormVideoPayload = z.infer<typeof LongFormVideoPayloadSchema>;

/** `live_content` — live streams / rooms. */
export const LiveContentPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  platform: z.enum(["instagram", "tiktok", "youtube", "linkedin", "facebook", "other"]).optional(),
  hook: ShortText.optional(),
  mainMessage: ShortText.optional(),
  caption: z.string().trim().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  guests: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        role: z.enum(["host", "guest", "moderator"]),
      }),
    )
    .max(10)
    .optional(),
  runOfShow: z
    .array(
      z.object({
        startsAtSeconds: z.number().int().min(0).max(36_000),
        topic: z.string().trim().max(220),
      }),
    )
    .max(50)
    .optional(),
  visualDirection: z.string().trim().max(2_000).optional(),
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type LiveContentPayload = z.infer<typeof LiveContentPayloadSchema>;

/** `article` — long-form written content. */
export const ArticlePayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  wordCount: z.number().int().min(100).max(20_000).optional(),
  objective: z.enum(["awareness", "consideration", "conversion", "retention"]).optional(),
  audience: z.string().trim().max(200).optional(),
  hook: ShortText.optional(),
  mainMessage: ShortText.optional(),
  callToAction: ShortText.optional(),
  caption: z.string().trim().max(10_000).optional(),
  outline: z
    .array(
      z.object({
        level: z.number().int().min(1).max(6),
        title: z.string().trim().max(220),
      }),
    )
    .max(50)
    .optional(),
  references: z.array(z.string().url().max(500)).max(20).optional(),
  visualDirection: z.string().trim().max(2_000).optional(),
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type ArticlePayload = z.infer<typeof ArticlePayloadSchema>;

/** `other` — catch-all format. Specifications bag for anything the
 *  fixed list doesn't cover; the planner is expected to lean on
 *  the dedicated formats where possible. */
export const OtherPayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  notes: z.string().trim().max(2_000).optional(),
  caption: z.string().trim().max(2_200).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  visualDirection: z.string().trim().max(2_000).optional(),
  references: z.array(z.string().url().max(500)).max(20).optional(),
  additionalNotes: z.string().trim().max(2_000).optional(),
  translations: TranslationMapSchema.optional(),
});
export type OtherPayload = z.infer<typeof OtherPayloadSchema>;

// ─── Discriminated union + dispatcher ───────────────────────────────

/**
 * The discriminated union of every per-format payload. The
 * service layer / publish form / AI prompts use this as the
 * typed source of truth. The discriminator is the
 * `format` field on `content_item` — the format itself lives
 * outside `formatPayload`, so the parser takes a sibling
 * `format` argument (see `parseFormatPayload`).
 */
export const FormatPayloadByFormat = {
  static_post: StaticPostPayloadSchema,
  carousel: CarouselPayloadSchema,
  story: StoryPayloadSchema,
  short_form_video: ShortFormVideoPayloadSchema,
  long_form_video: LongFormVideoPayloadSchema,
  live_content: LiveContentPayloadSchema,
  article: ArticlePayloadSchema,
  other: OtherPayloadSchema,
} as const;

export type ContentFormat = keyof typeof FormatPayloadByFormat;

/**
 * Parse a raw `formatPayload` value (from a DB row, a form
 * post, or a test fixture) against the schema for the given
 * format. Always returns a value; unknown fields are dropped,
 * missing fields default to `undefined`. Throws on an
 * unknown format so the caller never silently uses a wrong
 * schema.
 */
export function parseFormatPayload(
  format: ContentFormat,
  raw: unknown,
):
  | StaticPostPayload
  | CarouselPayload
  | StoryPayload
  | ShortFormVideoPayload
  | LongFormVideoPayload
  | LiveContentPayload
  | ArticlePayload
  | OtherPayload {
  const schema = FormatPayloadByFormat[format];
  // The DB row may be null (no `formatPayload` written yet) or
  // the default `{ schemaVersion: 1 }`. Normalise to the
  // object shape before parsing.
  const candidate = (
    raw && typeof raw === "object" ? raw : { schemaVersion: SCHEMA_VERSION }
  ) as Record<string, unknown>;
  if (typeof candidate.schemaVersion !== "number") {
    candidate.schemaVersion = SCHEMA_VERSION;
  }
  return schema.parse(candidate) as
    | StaticPostPayload
    | CarouselPayload
    | StoryPayload
    | ShortFormVideoPayload
    | LongFormVideoPayload
    | LiveContentPayload
    | ArticlePayload
    | OtherPayload;
}

/**
 * All field keys a planner can write a *translation* for in a
 * given format. Excludes `schemaVersion` and `translations`
 * itself (recursive). Used by the editor's translation sidecar
 * to render the right per-field translation inputs.
 */
export function translatableFieldKeys(format: ContentFormat): ReadonlyArray<string> {
  // The shape is shared across formats — every field listed
  // here is a planner-facing string or string array. The set
  // is hand-curated to match the schemas above; do NOT auto-
  // derive from the Zod type, because some fields (e.g. the
  // `objective` enum) don't translate.
  const COMMON = [
    "audience",
    "hook",
    "mainMessage",
    "callToAction",
    "caption",
    "firstComment",
    "description",
    "visualDirection",
    "coverDirection",
    "onScreenText",
    "voiceOverNotes",
    "additionalNotes",
    "notes",
  ] as const;
  const FORMAT_SPECIFIC: Record<ContentFormat, ReadonlyArray<string>> = {
    static_post: ["visualSlides", "location"],
    carousel: ["slideOutline"],
    story: [],
    short_form_video: ["scenes", "audioReference"],
    long_form_video: ["chapters"],
    live_content: ["guests", "runOfShow"],
    article: ["outline"],
    other: [],
  };
  return [...COMMON, ...FORMAT_SPECIFIC[format]];
}

/**
 * Extract a translatable subset of `formatPayload` keyed by
 * `translatableFieldKeys(format)`. Returns the existing
 * translation object for the locale if present, else an empty
 * object the caller can write into.
 */
export function getTranslation(
  formatPayload: unknown,
  format: ContentFormat,
  locale: LocaleCode,
): Record<string, unknown> {
  if (!formatPayload || typeof formatPayload !== "object") return {};
  const translations = (formatPayload as Record<string, unknown>).translations;
  if (!translations || typeof translations !== "object") return {};
  const value = (translations as Record<string, unknown>)[locale];
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

// ─── Field length limits (single source of truth) ────────────────────────

/**
 * Maximum character count for every planner-facing string
 * field, mirrored from the per-format Zod schemas above. The
 * frontend `maxLength` and the AI prompt constraints both
 * read from this map so the three layers (schema validation,
 * editor UX, AI generation) never disagree on a cap.
 *
 * Rationale: before this map, the field renderers hard-coded
 * `maxLength={220}` or `maxLength={2200}` regardless of the
 * field. A 2200-char `caption` was being silently truncated
 * to 220 chars in the editor even though the schema allowed
 * 2 200. `visualDirection` (schema: 2 000) let the user type
 * 2 200 in the UI before the server rejected the save. Two
 * separate bugs; one source of truth fixes both.
 *
 * Values are characters, not code points. `z.string().max()`
 * and the HTML `maxLength` attribute both count UTF-16 code
 * units, which is what users see as "characters" in the
 * counter. Emoji and combining marks therefore consume
 * multiple units, matching the schema's behaviour.
 */
export const FIELD_MAX_LENGTHS = {
  // Long-form audience-facing text (caption + first comment).
  caption: 2_200,
  firstComment: 2_200,
  // Creative direction — long enough for a paragraph.
  visualDirection: 2_000,
  additionalNotes: 2_000,
  onScreenText: 2_000,
  voiceOverNotes: 2_000,
  // Long-form video descriptions can be much longer (YouTube
  // accepts up to 5 000 characters in the description API;
  // 10 000 here is a safety margin for future expansion).
  description: 10_000,
  // Cover / audio references — URL plus label fits in 500.
  coverDirection: 500,
  audioReference: 500,
  // Short text — hook / main message / CTA / hook variants.
  hook: 220,
  mainMessage: 220,
  callToAction: 220,
  // Audience description.
  audience: 200,
  // Slide / scene / chapter / outline / chapter level.
  slideOutlineSummary: 220,
  slideOutlineVisual: 500,
  sceneSummary: 220,
  sceneDurationSeconds: 60,
  chapterTitle: 220,
  outlineTitle: 220,
  outlineLevel: 6,
  // Hashtags.
  hashtag: 60,
  hashtagMaxCount: 30,
  // References / URLs.
  referenceUrl: 500,
  referencesMaxCount: 20,
  // Live content.
  liveGuestName: 120,
  liveRunOfShowTopic: 220,
} as const satisfies Record<string, number>;

/** Type-safe reader. Returns `undefined` if the key is not
 *  a planner-facing field. */
export type FieldMaxLengthKey = keyof typeof FIELD_MAX_LENGTHS;

export function fieldMaxLength(key: FieldMaxLengthKey): number {
  return FIELD_MAX_LENGTHS[key];
}
