import { describe, expect, it } from "vitest";
import {
  FIELDS_BY_FORMAT,
  fieldsFor,
  splitByGroup,
} from "@/components/forms/format-payload-field-set";
import { ALL_FORMATS as ALL_FORMATS_FROM_STATUS } from "@/lib/content/status";
import { tFor } from "@/messages";
import type { ContentFormat } from "@/lib/format-payload/schemas";

const ALL_FORMATS = ALL_FORMATS_FROM_STATUS;
const en = tFor("en");

/**
 * The format-payload field manifest was refactored in
 * 2026-09-01 (phase 5b of the i18n plan) from inline English
 * `label: string` to catalog-keyed `labelKey: string`. The
 * tests now lock:
 *   1. every format has a non-empty manifest
 *   2. every field has a unique key inside its format
 *   3. every field has a non-empty catalog `labelKey` and a
 *      valid group
 *   4. the catalog resolves each `labelKey` to a non-empty
 *      English string (this is the live equivalent of the
 *      old "non-empty label" check)
 *   5. the essential set for each format includes the format's
 *      defining fields (mirroring the product's "if you can't
 *      see this, the form is broken" contract)
 *   6. the advanced set for each format includes format-specific
 *      deep creative direction
 *   7. `fieldsFor` returns the same array as the manifest
 *      lookup (a stable reference is what the editor depends
 *      on for memoization)
 *   8. `splitByGroup` is order-preserving and exhaustive
 */
describe("format-payload-field-set manifest", () => {
  it("covers every format in ALL_FORMATS", () => {
    for (const fmt of ALL_FORMATS) {
      expect(FIELDS_BY_FORMAT[fmt], `missing manifest for ${fmt}`).toBeDefined();
      expect(FIELDS_BY_FORMAT[fmt].length, `${fmt} manifest is empty`).toBeGreaterThan(0);
    }
  });

  it("every field has a unique key inside its format", () => {
    for (const fmt of ALL_FORMATS) {
      const keys = FIELDS_BY_FORMAT[fmt].map((f) => f.key);
      const unique = new Set(keys);
      expect(unique.size, `duplicate keys in ${fmt}`).toBe(keys.length);
    }
  });

  it("every field has a non-empty catalog labelKey and a valid group", () => {
    for (const fmt of ALL_FORMATS) {
      for (const f of FIELDS_BY_FORMAT[fmt]) {
        expect(f.labelKey.length, `${fmt}.${f.key} has empty labelKey`).toBeGreaterThan(0);
        expect(["essential", "advanced"]).toContain(f.group);
      }
    }
  });

  it("every labelKey resolves to a non-empty English string in the catalog", () => {
    for (const fmt of ALL_FORMATS) {
      for (const f of FIELDS_BY_FORMAT[fmt]) {
        const resolved = en(f.labelKey);
        // The hand-rolled translator wraps missing keys in `[…]`.
        // Treat that as a failure so a future refactor that drops
        // a catalog entry trips this test.
        expect(
          resolved.startsWith(`[${f.labelKey}]`),
          `${fmt}.${f.key} catalog entry missing: ${f.labelKey}`,
        ).toBe(false);
        expect(resolved.length, `${fmt}.${f.key} catalog value empty`).toBeGreaterThan(0);
      }
    }
  });

  it("the essential set for each format includes the format's defining fields", () => {
    const formatEssentials: Record<ContentFormat, string[]> = {
      static_post: ["caption", "hook", "callToAction", "hashtags"],
      carousel: ["slideCount", "slideOutline", "caption", "hook"],
      story: ["frameCount", "caption", "hook"],
      short_form_video: ["ratio", "durationSeconds", "scenes", "caption", "hook"],
      long_form_video: ["ratio", "durationSeconds", "chapters", "caption", "hook"],
      live_content: ["scheduledStart", "talkingPoints", "caption", "hook"],
      article: ["wordCount", "outline", "caption", "hook"],
      other: ["caption", "hook"],
    };
    for (const [fmt, expected] of Object.entries(formatEssentials) as [ContentFormat, string[]][]) {
      const essentials = splitByGroup(FIELDS_BY_FORMAT[fmt]).essential.map((f) => f.key);
      for (const key of expected) {
        expect(essentials, `${fmt} should include "${key}" in essentials`).toContain(key);
      }
    }
  });

  it("advanced fields include format-specific deep creative direction", () => {
    const formatAdvanced: Record<ContentFormat, string[]> = {
      static_post: ["visualDirection", "location", "references"],
      carousel: ["visualDirection", "references"],
      story: ["visualDirection"],
      short_form_video: ["voiceOverNotes", "audioReference", "coverDirection"],
      long_form_video: ["transcriptNotes", "thumbnailDirection"],
      live_content: ["qaPrompts", "segments"],
      article: ["keyTakeaways", "references"],
      other: ["visualDirection"],
    };
    for (const [fmt, expected] of Object.entries(formatAdvanced) as [ContentFormat, string[]][]) {
      const advanced = splitByGroup(FIELDS_BY_FORMAT[fmt]).advanced.map((f) => f.key);
      for (const key of expected) {
        expect(advanced, `${fmt} should include "${key}" in advanced`).toContain(key);
      }
    }
  });

  it("the essential + advanced counts sum to the manifest total for every format", () => {
    for (const fmt of ALL_FORMATS) {
      const fields = FIELDS_BY_FORMAT[fmt];
      const { essential, advanced } = splitByGroup(fields);
      expect(essential.length + advanced.length).toBe(fields.length);
    }
  });

  it("fieldsFor returns the same array as the manifest lookup", () => {
    for (const fmt of ALL_FORMATS) {
      expect(fieldsFor(fmt)).toBe(FIELDS_BY_FORMAT[fmt]);
    }
  });

  it("splitByGroup preserves the original order inside each tier", () => {
    for (const fmt of ALL_FORMATS) {
      const fields = FIELDS_BY_FORMAT[fmt];
      const { essential, advanced } = splitByGroup(fields);
      const essentialOriginal = fields.filter((f) => f.group === "essential").map((f) => f.key);
      const advancedOriginal = fields.filter((f) => f.group === "advanced").map((f) => f.key);
      expect(essential.map((f) => f.key)).toEqual(essentialOriginal);
      expect(advanced.map((f) => f.key)).toEqual(advancedOriginal);
    }
  });
});
