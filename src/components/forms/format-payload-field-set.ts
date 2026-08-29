/**
 * Per-format field manifest for the format-payload editor.
 *
 * The data model is `formatPayload: jsonb` with a per-format Zod schema
 * in `lib/format-payload/schemas.ts`. The schema lists every legal
 * field; this manifest lists the fields that should be exposed in
 * the editor, *grouped* into the two tiers the planner sees:
 *
 *   - **essential** — always visible. These are the fields a planner
 *     reaches for first when they open an item for creative work.
 *   - **advanced** — hidden behind a disclosure by default. These
 *     are fields that are sometimes relevant (per-format advanced
 *     creative direction) but are not part of the typical flow.
 *
 * The essential / advanced split is a *product* decision, not a
 * schema decision. A future pass could derive the manifest from the
 * Zod schemas, but the split itself is hand-curated by the design
 * team per format.
 *
 * Why two tiers (not three): a third tier (e.g. "power user") adds
 * toggle state for no real benefit and confuses first-time users. The
 * "show all fields" path is a future option if telemetry shows users
 * expanding advanced frequently.
 *
 * Why per-format (not a global list): the format-payload editor
 * already differentiates per format; the essential set is also
 * per-format. A static post planner wants `caption` and `hook`;
 * a short-form video planner wants `ratio`, `durationSeconds`, and
 * `scenes` first.
 */
import type { ContentFormat } from "@/lib/format-payload/schemas";

export type FieldGroup = "essential" | "advanced";

export interface FieldDef {
  /** The key in the format payload (e.g. "caption", "scenes"). */
  key: string;
  /** Display label. Reused from the existing field renderers. */
  label: string;
  /**
   * Group — essential fields are always rendered; advanced are
   * behind a disclosure. Default essential; the explicit
   * declaration is required so the manifest is grep-able.
   */
  group: FieldGroup;
  /**
   * Optional override: when false, a populated field still respects
   * the disclosure's collapsed state (used for fields the team
   * doesn't want auto-expanded even if filled). Default true.
   */
  keepOpenWhenFilled?: boolean;
}

export const FIELDS_BY_FORMAT: Record<ContentFormat, ReadonlyArray<FieldDef>> = {
  static_post: [
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "mainMessage", label: "Main message", group: "essential" },
    { key: "callToAction", label: "CTA", group: "essential" },
    { key: "firstComment", label: "First comment", group: "essential" },
    { key: "objective", label: "Objective", group: "advanced" },
    { key: "audience", label: "Audience", group: "advanced" },
    { key: "location", label: "Location", group: "advanced" },
    { key: "visualSlides", label: "Visual slides", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "references", label: "References", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
  carousel: [
    { key: "slideCount", label: "Slide count", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "mainMessage", label: "Main message", group: "essential" },
    { key: "callToAction", label: "CTA", group: "essential" },
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "firstComment", label: "First comment", group: "essential" },
    { key: "slideOutline", label: "Slide outline", group: "essential" },
    { key: "objective", label: "Objective", group: "advanced" },
    { key: "audience", label: "Audience", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "references", label: "References", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
  story: [
    { key: "frameCount", label: "Frame count", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "callToAction", label: "CTA", group: "essential" },
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "firstComment", label: "First comment", group: "essential" },
    { key: "objective", label: "Objective", group: "advanced" },
    { key: "audience", label: "Audience", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
  short_form_video: [
    { key: "ratio", label: "Aspect ratio", group: "essential" },
    { key: "durationSeconds", label: "Duration", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "scenes", label: "Scenes", group: "essential" },
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "callToAction", label: "CTA", group: "essential" },
    { key: "onScreenText", label: "On-screen text", group: "essential" },
    { key: "mainMessage", label: "Main message", group: "advanced" },
    { key: "voiceOverNotes", label: "Voiceover notes", group: "advanced" },
    { key: "audioReference", label: "Audio reference", group: "advanced" },
    { key: "coverDirection", label: "Cover direction", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "references", label: "References", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
  long_form_video: [
    { key: "ratio", label: "Aspect ratio", group: "essential" },
    { key: "durationSeconds", label: "Duration", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "chapters", label: "Chapters", group: "essential" },
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "callToAction", label: "CTA", group: "essential" },
    { key: "mainMessage", label: "Main message", group: "advanced" },
    { key: "description", label: "Description", group: "advanced" },
    { key: "transcriptNotes", label: "Transcript notes", group: "advanced" },
    { key: "thumbnailDirection", label: "Thumbnail direction", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "references", label: "References", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
  live_content: [
    { key: "scheduledStart", label: "Scheduled start", group: "essential" },
    { key: "expectedDurationMinutes", label: "Expected duration", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "talkingPoints", label: "Talking points", group: "essential" },
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "callToAction", label: "CTA", group: "essential" },
    { key: "mainMessage", label: "Main message", group: "advanced" },
    { key: "segments", label: "Segments", group: "advanced" },
    { key: "qaPrompts", label: "Q&A prompts", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "references", label: "References", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
  article: [
    { key: "wordCount", label: "Word count", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "mainMessage", label: "Main message", group: "essential" },
    { key: "outline", label: "Outline", group: "essential" },
    { key: "callToAction", label: "CTA", group: "essential" },
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "objective", label: "Objective", group: "advanced" },
    { key: "audience", label: "Audience", group: "advanced" },
    { key: "keyTakeaways", label: "Key takeaways", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "references", label: "References", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
  other: [
    { key: "caption", label: "Caption", group: "essential" },
    { key: "hashtags", label: "Hashtags", group: "essential" },
    { key: "hook", label: "Hook", group: "essential" },
    { key: "firstComment", label: "First comment", group: "essential" },
    { key: "objective", label: "Objective", group: "advanced" },
    { key: "audience", label: "Audience", group: "advanced" },
    { key: "visualDirection", label: "Visual guidelines", group: "advanced" },
    { key: "additionalNotes", label: "Additional notes", group: "advanced" },
  ],
};

/** Split a manifest into its two groups in their original order. */
export function splitByGroup(fields: ReadonlyArray<FieldDef>): {
  essential: FieldDef[];
  advanced: FieldDef[];
} {
  const essential: FieldDef[] = [];
  const advanced: FieldDef[] = [];
  for (const f of fields) {
    if (f.group === "essential") essential.push(f);
    else advanced.push(f);
  }
  return { essential, advanced };
}

/** All fields for a format, looked up by the manifest. */
export function fieldsFor(format: ContentFormat): ReadonlyArray<FieldDef> {
  return FIELDS_BY_FORMAT[format] ?? [];
}
