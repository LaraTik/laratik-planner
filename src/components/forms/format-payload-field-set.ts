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
 *
 * Localization: every field carries a `labelKey` resolved at the
 * call site through the active message catalog
 * (`formatEditor.fields.<key>`). The English value rendered by
 * `tFor("en")(labelKey)` is the runtime fallback for tests and
 * error states; there is no inline English label.
 */
import type { ContentFormat } from "@/lib/format-payload/schemas";

export type FieldGroup = "essential" | "advanced";

export interface FieldDef {
  /** The key in the format payload (e.g. "caption", "scenes"). */
  key: string;
  /**
   * Catalog key (e.g. `formatEditor.fields.caption`). The editor
   * resolves this through the active message catalog at render
   * time; the resolved English string is the runtime fallback.
   */
  labelKey: string;
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
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "mainMessage", labelKey: "formatEditor.fields.mainMessage", group: "essential" },
    { key: "callToAction", labelKey: "formatEditor.fields.callToAction", group: "essential" },
    { key: "firstComment", labelKey: "formatEditor.fields.firstComment", group: "essential" },
    { key: "objective", labelKey: "formatEditor.fields.objective", group: "advanced" },
    { key: "audience", labelKey: "formatEditor.fields.audience", group: "advanced" },
    { key: "location", labelKey: "formatEditor.fields.location", group: "advanced" },
    { key: "visualSlides", labelKey: "formatEditor.fields.visualSlides", group: "advanced" },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "references", labelKey: "formatEditor.fields.references", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
  ],
  carousel: [
    { key: "slideCount", labelKey: "formatEditor.fields.slideCount", group: "essential" },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "mainMessage", labelKey: "formatEditor.fields.mainMessage", group: "essential" },
    { key: "callToAction", labelKey: "formatEditor.fields.callToAction", group: "essential" },
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "firstComment", labelKey: "formatEditor.fields.firstComment", group: "essential" },
    { key: "slideOutline", labelKey: "formatEditor.fields.slideOutline", group: "essential" },
    { key: "objective", labelKey: "formatEditor.fields.objective", group: "advanced" },
    { key: "audience", labelKey: "formatEditor.fields.audience", group: "advanced" },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "references", labelKey: "formatEditor.fields.references", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
  ],
  story: [
    { key: "frameCount", labelKey: "formatEditor.fields.frameCount", group: "essential" },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "callToAction", labelKey: "formatEditor.fields.callToAction", group: "essential" },
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "firstComment", labelKey: "formatEditor.fields.firstComment", group: "essential" },
    { key: "objective", labelKey: "formatEditor.fields.objective", group: "advanced" },
    { key: "audience", labelKey: "formatEditor.fields.audience", group: "advanced" },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
  ],
  short_form_video: [
    { key: "ratio", labelKey: "formatEditor.fields.ratio", group: "essential" },
    { key: "durationSeconds", labelKey: "formatEditor.fields.duration", group: "essential" },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "scenes", labelKey: "formatEditor.fields.scenes", group: "essential" },
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "callToAction", labelKey: "formatEditor.fields.callToAction", group: "essential" },
    { key: "onScreenText", labelKey: "formatEditor.fields.onScreenText", group: "essential" },
    { key: "mainMessage", labelKey: "formatEditor.fields.mainMessage", group: "advanced" },
    { key: "voiceOverNotes", labelKey: "formatEditor.fields.voiceOverNotes", group: "advanced" },
    { key: "audioReference", labelKey: "formatEditor.fields.audioReference", group: "advanced" },
    { key: "coverDirection", labelKey: "formatEditor.fields.coverDirection", group: "advanced" },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "references", labelKey: "formatEditor.fields.references", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
  ],
  long_form_video: [
    { key: "ratio", labelKey: "formatEditor.fields.ratio", group: "essential" },
    { key: "durationSeconds", labelKey: "formatEditor.fields.duration", group: "essential" },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "chapters", labelKey: "formatEditor.fields.chapters", group: "essential" },
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "callToAction", labelKey: "formatEditor.fields.callToAction", group: "essential" },
    { key: "mainMessage", labelKey: "formatEditor.fields.mainMessage", group: "advanced" },
    { key: "description", labelKey: "formatEditor.fields.description", group: "advanced" },
    { key: "transcriptNotes", labelKey: "formatEditor.fields.transcriptNotes", group: "advanced" },
    {
      key: "thumbnailDirection",
      labelKey: "formatEditor.fields.thumbnailDirection",
      group: "advanced",
    },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "references", labelKey: "formatEditor.fields.references", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
  ],
  live_content: [
    { key: "scheduledStart", labelKey: "formatEditor.fields.scheduledStart", group: "essential" },
    {
      key: "expectedDurationMinutes",
      labelKey: "formatEditor.fields.expectedDuration",
      group: "essential",
    },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "talkingPoints", labelKey: "formatEditor.fields.talkingPoints", group: "essential" },
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "callToAction", labelKey: "formatEditor.fields.callToAction", group: "essential" },
    { key: "mainMessage", labelKey: "formatEditor.fields.mainMessage", group: "advanced" },
    { key: "segments", labelKey: "formatEditor.fields.segments", group: "advanced" },
    { key: "qaPrompts", labelKey: "formatEditor.fields.qaPrompts", group: "advanced" },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "references", labelKey: "formatEditor.fields.references", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
  ],
  article: [
    { key: "wordCount", labelKey: "formatEditor.fields.wordCount", group: "essential" },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "mainMessage", labelKey: "formatEditor.fields.mainMessage", group: "essential" },
    { key: "outline", labelKey: "formatEditor.fields.outline", group: "essential" },
    { key: "callToAction", labelKey: "formatEditor.fields.callToAction", group: "essential" },
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "objective", labelKey: "formatEditor.fields.objective", group: "advanced" },
    { key: "audience", labelKey: "formatEditor.fields.audience", group: "advanced" },
    { key: "keyTakeaways", labelKey: "formatEditor.fields.keyTakeaways", group: "advanced" },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "references", labelKey: "formatEditor.fields.references", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
  ],
  other: [
    { key: "caption", labelKey: "formatEditor.fields.caption", group: "essential" },
    { key: "hashtags", labelKey: "formatEditor.fields.hashtags", group: "essential" },
    { key: "hook", labelKey: "formatEditor.fields.hook", group: "essential" },
    { key: "firstComment", labelKey: "formatEditor.fields.firstComment", group: "essential" },
    { key: "objective", labelKey: "formatEditor.fields.objective", group: "advanced" },
    { key: "audience", labelKey: "formatEditor.fields.audience", group: "advanced" },
    { key: "visualDirection", labelKey: "formatEditor.fields.visualDirection", group: "advanced" },
    { key: "additionalNotes", labelKey: "formatEditor.fields.additionalNotes", group: "advanced" },
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
