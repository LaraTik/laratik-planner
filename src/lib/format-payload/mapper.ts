/**
 * `formatPayload` → `platformPayload` mapper.
 *
 * The publish form (`planning/[id]/publish/publish-package-form.tsx`)
 * already has a per-platform default builder; it just doesn't
 * pre-fill from the planner's `formatPayload` work. This module
 * is the missing glue: given a `formatPayload` and a target
 * platform, return a partial `PlatformPayload` the publish form
 * can merge into its local edit state.
 *
 * What gets pre-filled:
 *   - `caption`              ← formatPayload.caption (or the
 *                              per-locale translation if the
 *                              publish form's `contentLanguage`
 *                              is set to that locale)
 *   - `hashtags`              ← formatPayload.hashtags
 *   - `firstComment`          ← formatPayload.firstComment
 *   - `callToAction.label`    ← formatPayload.callToAction
 *   - `description`           ← formatPayload.description
 *                              (long_form_video / article)
 *   - `location`              ← formatPayload.location
 *                              (static_post)
 *   - `contentLanguage`       ← the locale of the translation
 *                              that was used, when present
 *
 * What does NOT get pre-filled (intentionally):
 *   - `selectedDestinationProfile` — that's a publish-time
 *     decision the publisher makes per channel
 *   - `scheduleOverride` — the publish form already inherits
 *     from the content item's `plannedPublishAt`
 *   - `publicationMethod` / `approval` / `disclosures` —
 *     publisher-side metadata that doesn't live in the
 *     planner's format payload
 *   - `deliveryReferences` — those are picked from the
 *     approved delivery version, not the format payload
 *
 * The mapper is pure: no DB calls, no async. It returns
 * `undefined` for an unknown format / platform pair so the
 * publish form can fall back to its existing default.
 */
import type { ContentFormat, StaticPostPayload } from "./schemas";
import { parseFormatPayload } from "./schemas";

/**
 * Subset of the `PlatformPayload` shape (from
 * `lib/publishing/payload-schemas.ts`) that the mapper fills.
 * Kept narrow so the publish form can `Object.assign` it
 * without us having to mirror the full discriminated union
 * here.
 */
export interface MappedPlatformFields {
  caption?: string;
  description?: string;
  hashtags?: string[];
  firstComment?: string;
  callToAction?: { label: string; url: string };
  location?: { name: string; externalId?: string };
  contentLanguage?: string;
}

interface MapperContext {
  /** The active format for this content item. */
  format: ContentFormat;
  /** Raw `formatPayload` value (DB row, may be null). */
  formatPayload: unknown;
  /**
   * The locale the publish form is currently rendering for
   * (the user's "Publish language" choice). When this matches
   * a key in `formatPayload.translations`, the translated
   * values are used; otherwise the source (default-locale)
   * values are used.
   */
  publishLanguage?: string;
}

/**
 * Build the pre-fill object for a single channel. Returns an
 * empty object when there's nothing to pre-fill, so the
 * publish form can do `Object.assign(default, mapped)` without
 * a null check.
 */
export function mapFormatPayloadToPlatform({
  format,
  formatPayload,
  publishLanguage,
}: MapperContext): MappedPlatformFields {
  let parsed;
  try {
    parsed = parseFormatPayload(format, formatPayload);
  } catch {
    // A malformed `formatPayload` row should never block the
    // publish form from rendering. The publish form already
    // has its own Zod parse on save; the mapper is best-effort.
    return {};
  }
  // The published caption is locale-aware when a translation
  // exists for `publishLanguage`; otherwise the source caption
  // (or the per-locale translation of the source locale) is
  // used. The translation object is a partial of the source
  // payload shape, so we read from it the same way we read
  // from the source.
  const t = pickTranslation(parsed, publishLanguage);

  const out: MappedPlatformFields = {};

  const caption = stringOrUndefined(t.caption ?? (parsed as { caption?: unknown }).caption);
  if (caption) out.caption = caption;

  const description = stringOrUndefined(
    t.description ?? (parsed as { description?: unknown }).description,
  );
  if (description) out.description = description;

  const hashtags = arrayOfStrings(t.hashtags ?? (parsed as { hashtags?: unknown }).hashtags);
  if (hashtags && hashtags.length > 0) out.hashtags = hashtags;

  const firstComment = stringOrUndefined(
    t.firstComment ?? (parsed as { firstComment?: unknown }).firstComment,
  );
  if (firstComment) out.firstComment = firstComment;

  const cta = stringOrUndefined(
    t.callToAction ?? (parsed as { callToAction?: unknown }).callToAction,
  );
  if (cta) {
    // `callToAction` in `formatPayload` is a 1-line string
    // (the planner's intent). The publish form expects a
    // `{ label, url }` object — we wrap the planner's text
    // as the label and leave `url` empty for the publisher
    // to fill. This is intentional: the planner doesn't
    // typically know the final UTM-tracked URL.
    out.callToAction = { label: cta.slice(0, 40), url: "" };
  }

  // Location is only present on `static_post`. Reading it
  // from the parsed payload via a typed cast is safer than
  // re-deriving the format here.
  if (format === "static_post") {
    const sp = parsed as StaticPostPayload;
    if (sp.location && typeof sp.location === "object" && typeof sp.location.name === "string") {
      out.location = {
        name: sp.location.name,
        ...(sp.location.externalId ? { externalId: sp.location.externalId } : {}),
      };
    }
  }

  if (publishLanguage) out.contentLanguage = publishLanguage;

  return out;
}

/**
 * Pick the translation sub-object for the requested locale.
 * Falls back to the source values (returned unchanged) when
 * the requested locale has no translation, so the mapper is
 * safe to call with any publish-language value.
 */
function pickTranslation(
  parsed: unknown,
  publishLanguage: string | undefined,
): Record<string, unknown> {
  if (!publishLanguage) return {};
  if (!parsed || typeof parsed !== "object") return {};
  const t = (parsed as { translations?: unknown }).translations;
  if (!t || typeof t !== "object") return {};
  const value = (t as Record<string, unknown>)[publishLanguage];
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function arrayOfStrings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length > 0 ? out : undefined;
}
