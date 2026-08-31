import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AI_CAPABILITY_METADATA,
  AI_PROVIDER,
  ADMIN_FACING_CAPABILITIES,
  PLANNER_FACING_CAPABILITIES,
  getAiCapabilityMetadata,
} from "@/lib/ai/capabilities";

/**
 * GAP-AI-UX-2026-08-26 — the capabilities metadata is now the
 * single source of truth for the agency form, the workspace status
 * card, and the content detail AI section. Three of the six
 * capabilities (`campaign_ideas`, `platform_adaptation`,
 * `related_format_ideas`) were previously advertised in the
 * agency form but had no entry point on the planner surface
 * because the content page hard-coded a 3-tile subset. This test
 * pins the invariants that close that gap so a future refactor
 * can't quietly re-introduce it.
 */
describe("AI capabilities metadata (single source of truth)", () => {
  it("lists exactly the six §15 capabilities", () => {
    expect(AI_CAPABILITY_METADATA.map((c) => c.id)).toEqual([
      "campaign_ideas",
      "brief_improvement",
      "caption_drafts",
      "platform_adaptation",
      "related_format_ideas",
      "completeness_check",
    ]);
  });

  it("has a unique id per entry", () => {
    const ids = AI_CAPABILITY_METADATA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a non-empty label, adminLabel, and description for every entry", () => {
    for (const cap of AI_CAPABILITY_METADATA) {
      expect(cap.label.length).toBeGreaterThan(0);
      expect(cap.adminLabel.length).toBeGreaterThan(0);
      expect(cap.description.length).toBeGreaterThan(0);
    }
  });

  it("enables every capability on the content detail page (FEAT-03)", () => {
    // FEAT-03 wired up campaign_ideas, platform_adaptation, and
    // related_format_ideas; if a future capability is added but
    // is not yet reached on the planner surface, the test should
    // call that out explicitly by flipping this expectation (the
    // page is no longer the place to hide unwired work).
    for (const cap of AI_CAPABILITY_METADATA) {
      expect(cap.enabledOnContentDetail).toBe(true);
    }
  });

  it("exposes both planner and admin lists with the same shape", () => {
    expect(PLANNER_FACING_CAPABILITIES).toHaveLength(AI_CAPABILITY_METADATA.length);
    expect(ADMIN_FACING_CAPABILITIES).toHaveLength(AI_CAPABILITY_METADATA.length);
  });

  it("getAiCapabilityMetadata resolves a known id", () => {
    const cap = getAiCapabilityMetadata("brief_improvement");
    expect(cap?.label).toBe("Improve brief");
    expect(cap?.adminLabel).toBe("Brief improvement");
  });

  it("getAiCapabilityMetadata returns null for an unknown id", () => {
    expect(getAiCapabilityMetadata("not_a_capability")).toBeNull();
  });
});

/**
 * Will-update / Will-not-change contract (AGENTS.md §U +
 * /ui-ux-pro-max P2.2, 2026-08-31). Every capability that
 * writes to the content item declares the exact fields it
 * touches. The contract is the user-facing answer to "what
 * does clicking Replace actually do?" — a regression that
 * silently overwrites a field not on the willUpdate list
 * fails these tests.
 *
 * The "unknown id" branch is the defensive fallback: a stale
 * client bundle could carry an id the server has since removed.
 * The contract must never silently drop the user into a
 * write-without-warning state.
 */
describe("AI capabilities — Will update / Will not change contract", () => {
  it("brief_improvement touches ONLY the brief (everything else survives)", () => {
    const cap = getAiCapabilityMetadata("brief_improvement");
    expect(cap?.willUpdate).toEqual(["brief"]);
    // The non-touched list deliberately names the categories the
    // planner most expects to be safe: format, channels,
    // schedule, format-specific payload. A regression that
    // adds `channels` to willUpdate without updating the test
    // breaks the contract.
    expect(cap?.willNotChange).toEqual(
      expect.arrayContaining(["format", "channels", "schedule", "format payload"]),
    );
  });

  it("caption_drafts touches caption + hashtags (hook / CTA / visual untouched)", () => {
    const cap = getAiCapabilityMetadata("caption_drafts");
    expect(cap?.willUpdate).toEqual(["caption", "hashtags"]);
    expect(cap?.willNotChange).toEqual(expect.arrayContaining(["hook", "CTA", "visual direction"]));
  });

  it("platform_adaptation only rewrites the caption", () => {
    const cap = getAiCapabilityMetadata("platform_adaptation");
    expect(cap?.willUpdate).toEqual(["caption"]);
    expect(cap?.willNotChange).toEqual(
      expect.arrayContaining(["format", "channels", "schedule", "visual direction"]),
    );
  });

  it("campaign_ideas is read-only — clicking the action does NOT write back", () => {
    const cap = getAiCapabilityMetadata("campaign_ideas");
    expect(cap?.willUpdate).toEqual([]);
    expect(cap?.willNotChange).toBeDefined();
    expect(cap?.willNotChange?.length).toBeGreaterThan(0);
  });

  it("related_format_ideas is read-only", () => {
    const cap = getAiCapabilityMetadata("related_format_ideas");
    expect(cap?.willUpdate).toEqual([]);
  });

  it("completeness_check is read-only", () => {
    const cap = getAiCapabilityMetadata("completeness_check");
    expect(cap?.willUpdate).toEqual([]);
  });

  it("every enabled capability declares a willUpdate + willNotChange list", () => {
    // The contract is mandatory for any capability rendered on the
    // content detail page. A regression that adds a new capability
    // without the contract breaks the AI panel's "Will update /
    // Will not change" UI and trips the test.
    for (const cap of AI_CAPABILITY_METADATA) {
      if (!cap.enabledOnContentDetail) continue;
      expect(cap.willUpdate, `${cap.id} must declare willUpdate`).toBeDefined();
      expect(Array.isArray(cap.willUpdate), `${cap.id} willUpdate must be an array`).toBe(true);
      expect(
        cap.willNotChange,
        `${cap.id} must declare willNotChange (the panel renders the "Read-only" fallback otherwise)`,
      ).toBeDefined();
      expect(Array.isArray(cap.willNotChange), `${cap.id} willNotChange must be an array`).toBe(
        true,
      );
    }
  });

  it("willUpdate and willNotChange never share a field (a field is either written or it isn't)", () => {
    // Defence-in-depth: the same field name appearing on both
    // lists is a bug. The panel would render it as both "will
    // update" (with a check icon) AND "will not touch" (with an
    // X icon) at the same time.
    for (const cap of AI_CAPABILITY_METADATA) {
      const will = new Set(cap.willUpdate ?? []);
      const wont = new Set(cap.willNotChange ?? []);
      for (const f of will) {
        expect(wont.has(f), `${cap.id} lists "${f}" on both willUpdate AND willNotChange`).toBe(
          false,
        );
      }
    }
  });
});

describe("AI provider metadata (compat is Anthropic, not OpenAI)", () => {
  it("advertises Anthropic-compat at the canonical base URL", () => {
    expect(AI_PROVIDER.vendor).toBe("MiniMax");
    expect(AI_PROVIDER.compat).toBe("Anthropic-compat");
    expect(AI_PROVIDER.defaultBaseUrl).toBe("https://api.minimax.io/anthropic");
    expect(AI_PROVIDER.defaultModel).toBe("MiniMax-M3");
  });
});
