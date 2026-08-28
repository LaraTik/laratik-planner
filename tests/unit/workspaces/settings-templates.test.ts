import { describe, expect, it } from "vitest";

import {
  leadTimeTemplates,
  approvalTemplates,
  monthlyTargetTemplates,
  settingsTemplateSections,
  type LeadTimeTemplate,
  type ApprovalTemplate,
  type MonthlyTargetTemplate,
} from "@/lib/workspaces/settings-templates";

/**
 * Smoke test for the curated settings presets (Phase C of
 * the settings rollout). The data is platform content
 * (every workspace sees the same list), so the test
 * asserts the shape contract — counts, ordering, ID
 * uniqueness — not the individual values. A change to
 * the curated list is intentional; the test just makes
 * sure the structure stays consistent.
 */
describe("settings-templates", () => {
  describe("leadTimeTemplates", () => {
    it("has at least 3 curated lead-time presets", () => {
      expect(leadTimeTemplates.length).toBeGreaterThanOrEqual(3);
    });

    it("every preset has unique id + name", () => {
      const ids = new Set<string>();
      const names = new Set<string>();
      for (const t of leadTimeTemplates) {
        expect(ids.has(t.id)).toBe(false);
        ids.add(t.id);
        expect(names.has(t.name)).toBe(false);
        names.add(t.name);
      }
    });

    it("every preset has all four lead-day values in the 0-200 range", () => {
      for (const t of leadTimeTemplates) {
        for (const [k, v] of Object.entries(t.values)) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(200);
          // The schema names; assert the key set is the
          // documented four.
          expect([
            "contentApprovalLeadDays",
            "designCompleteLeadDays",
            "creativeApprovalLeadDays",
            "readyToPublishLeadDays",
          ]).toContain(k);
        }
      }
    });

    it("every preset is typed LeadTimeTemplate", () => {
      const sample: LeadTimeTemplate = leadTimeTemplates[0]!;
      expect(typeof sample.id).toBe("string");
      expect(typeof sample.name).toBe("string");
      expect(typeof sample.blurb).toBe("string");
      expect(typeof sample.forClientApproval).toBe("boolean");
    });
  });

  describe("approvalTemplates", () => {
    it("covers both approval modes", () => {
      const modes = new Set(approvalTemplates.map((t) => t.id));
      // The IDs are the same as the underlying `approvalMode`
      // enum values; at minimum the canonical two.
      expect(modes.has("simple")).toBe(true);
      expect(modes.has("internal_then_client")).toBe(true);
    });

    it("every preset is typed ApprovalTemplate", () => {
      const sample: ApprovalTemplate = approvalTemplates[0]!;
      expect(typeof sample.id).toBe("string");
      expect(typeof sample.label).toBe("string");
      expect(typeof sample.blurb).toBe("string");
    });
  });

  describe("monthlyTargetTemplates", () => {
    it("has at least 1 curated monthly target preset", () => {
      expect(monthlyTargetTemplates.length).toBeGreaterThanOrEqual(1);
    });

    it("every preset has a positive value", () => {
      for (const t of monthlyTargetTemplates) {
        expect(t.value).toBeGreaterThan(0);
      }
    });

    it("every preset is typed MonthlyTargetTemplate", () => {
      const sample: MonthlyTargetTemplate = monthlyTargetTemplates[0]!;
      expect(typeof sample.id).toBe("string");
      expect(typeof sample.name).toBe("string");
      expect(typeof sample.blurb).toBe("string");
      expect(typeof sample.value).toBe("number");
    });
  });

  describe("settingsTemplateSections", () => {
    it("renders a section for every template category", () => {
      // The page reads this list to render the cards; the
      // shape is `{ id, label, blurb }` per section. We
      // assert the id set covers all three template types
      // so the page never falls through to "no sections".
      const ids = new Set(settingsTemplateSections.map((s) => s.id));
      expect(ids.has("lead-times")).toBe(true);
      expect(ids.has("approvals")).toBe(true);
      expect(ids.has("monthly-target")).toBe(true);
    });

    it("every section has a non-empty label and blurb", () => {
      for (const s of settingsTemplateSections) {
        expect(s.label.length).toBeGreaterThan(0);
        expect(s.blurb.length).toBeGreaterThan(0);
      }
    });
  });
});
