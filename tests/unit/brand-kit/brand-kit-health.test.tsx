import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandKitHealth } from "@/app/(app)/app/w/[slug]/brand-kit/_components/brand-kit-health";

/**
 * BrandKitHealth — the per-section coverage card on every
 * per-section brand-kit page. Pure component; suggestions are
 * derived from the `count` and `breakdown` props. These tests
 * pin the deterministic suggestion copy + the AI state badge.
 */
const slug = "acme";

describe("BrandKitHealth", () => {
  describe("AI context state badges", () => {
    it("shows 'AI uses this' for voice and pillars (already in loadAiContext)", () => {
      render(<BrandKitHealth section="voice" slug={slug} count={3} />);
      expect(screen.getByTestId("brand-kit-health-voice-ai-state")).toHaveTextContent(
        /ai uses this/i,
      );
    });

    it("shows 'AI uses this' for colors, typography, and publishing (Phase 8 expansion)", () => {
      render(<BrandKitHealth section="colors" slug={slug} count={0} />);
      expect(screen.getByTestId("brand-kit-health-colors-ai-state")).toHaveTextContent(
        /ai uses this/i,
      );
      render(<BrandKitHealth section="typography" slug={slug} count={0} />);
      expect(screen.getByTestId("brand-kit-health-typography-ai-state")).toHaveTextContent(
        /ai uses this/i,
      );
      render(<BrandKitHealth section="publishing" slug={slug} count={0} />);
      expect(screen.getByTestId("brand-kit-health-publishing-ai-state")).toHaveTextContent(
        /ai uses this/i,
      );
    });

    it("shows 'Not fed to AI' for logos and linked resources (intentionally not loaded)", () => {
      render(<BrandKitHealth section="logos" slug={slug} count={0} />);
      expect(screen.getByTestId("brand-kit-health-logos-ai-state")).toHaveTextContent(
        /not fed to ai/i,
      );
    });
  });

  describe("deterministic suggestions", () => {
    it("voice: missing tone rule surfaces as the first suggestion", () => {
      render(
        <BrandKitHealth
          section="voice"
          slug={slug}
          count={5}
          breakdown={{ tone: 0, do: 3, dont: 2 }}
        />,
      );
      const first = screen.getByTestId("brand-kit-health-voice-suggestion-0");
      expect(first).toHaveTextContent(/add a tone rule/i);
    });

    it("voice: missing don't rules surface as the first suggestion when tone is present", () => {
      render(
        <BrandKitHealth
          section="voice"
          slug={slug}
          count={6}
          breakdown={{ tone: 2, do: 4, dont: 0 }}
        />,
      );
      const first = screen.getByTestId("brand-kit-health-voice-suggestion-0");
      expect(first).toHaveTextContent(/don't/i);
    });

    it("voice: full coverage is healthy", () => {
      render(
        <BrandKitHealth
          section="voice"
          slug={slug}
          count={9}
          breakdown={{ tone: 2, do: 5, dont: 2 }}
        />,
      );
      expect(screen.getByTestId("brand-kit-health-voice-status")).toHaveTextContent(/healthy/i);
    });

    it("typography: missing headline role is called out", () => {
      render(
        <BrandKitHealth
          section="typography"
          slug={slug}
          count={2}
          breakdown={{ body: 1, accent: 1 }}
        />,
      );
      const first = screen.getByTestId("brand-kit-health-typography-suggestion-0");
      expect(first).toHaveTextContent(/headline/i);
    });

    it("colors: empty workspace is told to add 5-7 colors", () => {
      render(<BrandKitHealth section="colors" slug={slug} count={0} />);
      const first = screen.getByTestId("brand-kit-health-colors-suggestion-0");
      expect(first).toHaveTextContent(/5.{1,4}7 colors/i);
    });

    it("pillars: more than 5 is flagged as a dilution risk", () => {
      render(<BrandKitHealth section="pillars" slug={slug} count={7} />);
      const first = screen.getByTestId("brand-kit-health-pillars-suggestion-0");
      expect(first).toHaveTextContent(/dilute/i);
    });

    it("voice: zero rules shows the onboarding copy", () => {
      render(<BrandKitHealth section="voice" slug={slug} count={0} />);
      const first = screen.getByTestId("brand-kit-health-voice-suggestion-0");
      expect(first).toHaveTextContent(/1 tone rule/i);
    });
  });

  describe("chrome", () => {
    it("renders the section-specific aria-label and testid", () => {
      render(<BrandKitHealth section="logos" slug={slug} count={2} />);
      const card = screen.getByTestId("brand-kit-health-logos");
      expect(card).toHaveAttribute("aria-label", "Logos health");
    });

    it("renders the count in a human-readable way (singular vs plural)", () => {
      const { rerender } = render(<BrandKitHealth section="logos" slug={slug} count={1} />);
      expect(screen.getByTestId("brand-kit-health-logos")).toHaveTextContent(/1 entry\b/);
      rerender(<BrandKitHealth section="logos" slug={slug} count={3} />);
      expect(screen.getByTestId("brand-kit-health-logos")).toHaveTextContent(/3 entries\b/);
    });
  });
});
