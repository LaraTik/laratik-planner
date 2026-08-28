import { describe, expect, it, vi } from "vitest";

// next/font/google is a build-time loader; mock it so the unit
// suite doesn't try to fetch real font CSS at import time.
vi.mock("next/font/google", () => {
  const stub = () => ({ className: "font-stub", variable: "--font-stub" });
  return {
    Inter: stub,
    Roboto: stub,
    Open_Sans: stub,
    Lato: stub,
    Montserrat: stub,
    Poppins: stub,
    Playfair_Display: stub,
    Merriweather: stub,
    Source_Sans_3: stub,
    Raleway: stub,
    Nunito: stub,
    Work_Sans: stub,
    Fira_Sans: stub,
    IBM_Plex_Sans: stub,
  };
});

import {
  colorTemplates,
  pillarTemplates,
  publishingTemplates,
  templateSections,
  typographyTemplates,
  voiceTemplates,
} from "@/lib/brand/templates";
import { TYPOGRAPHY_OPTIONS, KNOWN_FAMILY_NAMES } from "@/lib/brand/typography-families";

/**
 * Templates catalog — sanity test. The data is consumed by the
 * templates page (`/brand-kit/templates`) and by the matching
 * `addXTemplateAction` server actions. The catalog is platform
 * content (not workspace content), so a regression here breaks
 * every workspace's brand-kit seed flow at once.
 *
 * The checks below are intentionally structural, not cosmetic:
 *  - every template has a stable, unique id
 *  - voice templates are within the Zod char ceiling (60 / 280)
 *  - palette swatches are 4-6 with non-overlapping role coverage
 *  - typography pairs reference families the Combobox catalog
 *    knows about, so the live preview in the picker matches the
 *    fonts the page will actually add
 */

function uniqueIds<T extends { id: string }>(items: readonly T[]): boolean {
  return new Set(items.map((i) => i.id)).size === items.length;
}

describe("brand kit templates", () => {
  it("every section id is unique and stable", () => {
    expect(uniqueIds(templateSections)).toBe(true);
  });

  it("voice templates have unique ids, fit the Zod ceiling, and bucket correctly", () => {
    expect(uniqueIds(voiceTemplates)).toBe(true);
    for (const t of voiceTemplates) {
      const max = t.ruleType === "tone" ? 60 : 280;
      expect(t.content.length, `${t.id} length`).toBeLessThanOrEqual(max);
      expect(["tone", "do", "dont"]).toContain(t.ruleType);
    }
  });

  it("pillar templates have unique ids and required fields", () => {
    expect(uniqueIds(pillarTemplates)).toBe(true);
    for (const p of pillarTemplates) {
      expect(p.name.length).toBeGreaterThanOrEqual(2);
      expect(p.description.length).toBeGreaterThan(0);
      if (p.color) expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("color palettes have 4-6 swatches with role coverage", () => {
    expect(uniqueIds(colorTemplates)).toBe(true);
    for (const palette of colorTemplates) {
      expect(palette.swatches.length, `${palette.id} swatch count`).toBeGreaterThanOrEqual(4);
      expect(palette.swatches.length, `${palette.id} swatch count`).toBeLessThanOrEqual(6);
      // Every swatch is a valid 6-char hex.
      for (const s of palette.swatches) {
        expect(s.hex, `${palette.id}:${s.name}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(["primary", "secondary", "accent", "neutral"]).toContain(s.role);
      }
      // Each palette covers at least the four canonical roles (a
      // workspace can add more neutrals later, but the seed must
      // touch every slot).
      const roles = new Set(palette.swatches.map((s) => s.role));
      expect(roles, `${palette.id} role coverage`).toEqual(
        new Set(["primary", "secondary", "accent", "neutral"]),
      );
    }
  });

  it("typography pairs reference families the catalog recognises", () => {
    expect(uniqueIds(typographyTemplates)).toBe(true);
    for (const tpl of typographyTemplates) {
      expect(tpl.faces.length, `${tpl.id} face count`).toBeGreaterThanOrEqual(1);
      for (const face of tpl.faces) {
        expect(KNOWN_FAMILY_NAMES, `${tpl.id}:${face.family}`).toContain(face.family);
      }
    }
    // The Combobox catalog stays in sync with the templates catalog.
    expect(TYPOGRAPHY_OPTIONS.length).toBe(KNOWN_FAMILY_NAMES.length);
  });

  it("publishing templates have unique ids and a valid ruleType", () => {
    expect(uniqueIds(publishingTemplates)).toBe(true);
    for (const t of publishingTemplates) {
      expect(["alt_text", "hashtag", "compliance", "channel", "general"]).toContain(t.ruleType);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.content.length).toBeGreaterThan(0);
    }
  });
});
