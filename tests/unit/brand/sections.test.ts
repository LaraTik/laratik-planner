import { describe, expect, it } from "vitest";
import {
  ADD_MENU_SECTIONS,
  BRAND_KIT_SECTIONS,
  getBrandKitSection,
  ORDERED_TAB_SECTIONS,
} from "@/lib/brand/sections";

describe("BRAND_KIT_SECTIONS config", () => {
  it("has a unique id for every section", () => {
    const ids = BRAND_KIT_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships 9 sections (the canonical Stitch Bento count)", () => {
    expect(BRAND_KIT_SECTIONS).toHaveLength(9);
  });

  it("every section has a non-empty label and an icon", () => {
    for (const s of BRAND_KIT_SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0);
      // Lucide icons are forwardRef components; typeof is 'object'.
      expect(s.icon).toBeDefined();
    }
  });

  it("only manager-editable sections appear in the Add menu", () => {
    const addIds = ADD_MENU_SECTIONS.map((s) => s.id).sort();
    expect(addIds).toEqual([
      "color",
      "guidelines",
      "linked",
      "logo",
      "pillars",
      "publishing",
      "voice",
    ]);
  });

  it("addMenuLabel and addMenuDescription are both set or both unset", () => {
    for (const s of BRAND_KIT_SECTIONS) {
      const hasLabel = s.addMenuLabel !== undefined;
      const hasDesc = s.addMenuDescription !== undefined;
      expect(hasLabel).toBe(hasDesc);
    }
  });

  it("overview and recent are read-only and never appear in the Add menu", () => {
    expect(ADD_MENU_SECTIONS.some((s) => s.id === "overview")).toBe(false);
    expect(ADD_MENU_SECTIONS.some((s) => s.id === "recent")).toBe(false);
  });

  it("ordered tab sections match the full list (preserves the in-page order)", () => {
    expect(ORDERED_TAB_SECTIONS).toEqual(BRAND_KIT_SECTIONS);
  });

  it("getBrandKitSection returns the section for a known id", () => {
    expect(getBrandKitSection("logo")?.label).toBe("Logos");
    expect(getBrandKitSection("recent")?.label).toBe("Activity");
  });

  it("getBrandKitSection returns undefined for an unknown id", () => {
    expect(getBrandKitSection("nope")).toBeUndefined();
  });
});
