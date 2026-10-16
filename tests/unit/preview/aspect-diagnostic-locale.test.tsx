import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AspectRatioDiagnosticView } from "@/components/preview/aspect-ratio-diagnostic";
import {
  diagnoseAspectRatio,
  FEED_RATIOS,
  REEL_RATIOS,
} from "@/lib/preview/instagram-aspect-ratios";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { makeTranslator } from "@/messages";

/**
 * The aspect diagnostic is the one line that tells the planner whether
 * the creative survives the crop, so it has to follow the workspace
 * locale like every other string on the preview.
 *
 * It used to be assembled as an English sentence inside
 * `diagnoseAspectRatio` — a pure lib with no access to the catalog — so
 * an Arabic workspace got an English verdict. The lib now returns a
 * structured `message` and the view resolves the words. These assertions
 * pin that split: the data carries no prose, and the rendered row follows
 * the locale.
 */

function renderDiagnostic(locale: "en" | "ar", args: Parameters<typeof diagnoseAspectRatio>) {
  const diagnostic = diagnoseAspectRatio(...args);
  return render(
    <LocaleProvider locale={locale}>
      <AspectRatioDiagnosticView diagnostic={diagnostic} />
    </LocaleProvider>,
  );
}

describe("aspect diagnostic — locale", () => {
  it("renders the verdict in English on an English workspace", () => {
    renderDiagnostic("en", [1080, 1350, FEED_RATIOS]);
    expect(screen.getByTestId("aspect-diagnostic-ok")).toHaveTextContent(
      "1080 × 1350 (4:5) — matches Portrait 4:5.",
    );
  });

  it("renders no English verdict frame on an Arabic workspace", () => {
    renderDiagnostic("ar", [1080, 1350, FEED_RATIOS]);

    const row = screen.getByTestId("aspect-diagnostic-ok");
    expect(row).toHaveTextContent("1080 × 1350 (4:5)");
    // Localized frame, not the English one.
    expect(row).toHaveTextContent("يطابق");
    expect(row).not.toHaveTextContent("matches Portrait 4:5");
  });

  it("localizes the nearest-match advice", () => {
    renderDiagnostic("en", [1920, 1080, FEED_RATIOS]);
    const row = screen.getByTestId("aspect-diagnostic-warning");
    expect(row).toHaveTextContent("Try 1080 × 566 for Landscape 1.91:1.");
  });

  it("localizes the low-resolution advice", () => {
    renderDiagnostic("ar", [800, 800, FEED_RATIOS]);
    const row = screen.getByTestId("aspect-diagnostic-warning");
    expect(row).toHaveTextContent("الحد الأدنى 1080 × 1080");
  });

  it("keeps every catalog key the resolver needs present in both locales", () => {
    // Guards the contract the resolver switches on: a missing key would
    // render the raw key path to the operator.
    const en = makeTranslator("en");
    const ar = makeTranslator("ar");
    const keys = [
      "unknownSummary",
      "unknownRecommendation",
      "matchSummary",
      "belowMinimumSummary",
      "belowMinimumRecommendation",
      "noMatchSummary",
      "noMatchRecommendation",
      "noTargetSummary",
      "noTargetRecommendation",
    ];
    for (const key of keys) {
      const path = `contentDetail.preview.diagnostic.${key}`;
      expect(en(path), `en missing ${path}`).not.toBe(path);
      expect(ar(path), `ar missing ${path}`).not.toBe(path);
    }
  });

  it("never emits prose from the pure lib", () => {
    // The lib must stay data-only; a future edit that re-adds a
    // `summary` string would silently bypass the catalog again.
    const messages = [
      diagnoseAspectRatio(null, null, FEED_RATIOS).message,
      diagnoseAspectRatio(1080, 1080, FEED_RATIOS).message,
      diagnoseAspectRatio(800, 800, FEED_RATIOS).message,
      diagnoseAspectRatio(1920, 1080, FEED_RATIOS).message,
      diagnoseAspectRatio(1080, 1350, []).message,
    ];
    for (const m of messages) {
      expect(Object.keys(m)).not.toContain("summary");
      expect(Object.keys(m)).not.toContain("recommendation");
    }
    expect(diagnoseAspectRatio(1080, 1920, REEL_RATIOS).message).toMatchObject({
      kind: "match",
      ratio: "9:16",
    });
  });
});
