/**
 * Instagram / Meta aspect-ratio reference, isolated so the
 * values can be updated when Meta changes the platform
 * requirements without hunting for magic numbers across the
 * codebase.
 *
 * Phase 4 of the planning-workspace-v2 refactor (2026-08-30).
 *
 * Source of truth: Meta's own help-centre articles at
 * `help.instagram.com`. The numbers here are the
 * planner-facing *recommended* ranges, not hard limits —
 * Instagram accepts a wider window for some formats (e.g.
 * 1.91:1 for landscape feed) but the recommended ranges
 * produce the most reliable rendering.
 *
 * If Meta updates the spec, this is the only file that needs
 * to change. The rest of the preview UI derives from these
 * constants.
 */

export type AspectRatioId =
  | "feed-square"
  | "feed-portrait-4-5"
  | "feed-landscape"
  | "carousel-square"
  | "carousel-portrait-4-5"
  | "reel-9-16"
  | "story-9-16";

export interface AspectRatioSpec {
  id: AspectRatioId;
  label: string;
  ratio: number;
  /** Tolerance in absolute ratio units — anything within
   *  this distance of `ratio` is considered "matches". */
  tolerance: number;
  /** Display dimensions Instagram recommends (or the closest
   *  commonly-published guidance). */
  recommended: { width: number; height: number };
  /** Short human description. */
  description: string;
}

/**
 * Instagram feed photo and video recommended aspect ratios.
 * 1:1 (square), 4:5 (portrait), and 1.91:1 (landscape) are
 * the three shapes Instagram's feed crops support natively.
 */
export const FEED_RATIOS: ReadonlyArray<AspectRatioSpec> = [
  {
    id: "feed-square",
    label: "Square 1:1",
    ratio: 1,
    tolerance: 0.02,
    recommended: { width: 1080, height: 1080 },
    description: "Square feed post — the safest Instagram shape.",
  },
  {
    id: "feed-portrait-4-5",
    label: "Portrait 4:5",
    ratio: 4 / 5,
    tolerance: 0.02,
    recommended: { width: 1080, height: 1350 },
    description: "Tall portrait — takes the most vertical real estate in the feed.",
  },
  {
    id: "feed-landscape",
    label: "Landscape 1.91:1",
    ratio: 1.91,
    tolerance: 0.05,
    recommended: { width: 1080, height: 566 },
    description: "Wide landscape — best for product shots and previews.",
  },
];

/**
 * Carousel cards are individual posts, so each card must
 * match one of the feed ratios. We use 1:1 and 4:5 as the
 * two recommended carousel shapes.
 */
export const CAROUSEL_RATIOS: ReadonlyArray<AspectRatioSpec> = [
  {
    id: "carousel-square",
    label: "Square 1:1",
    ratio: 1,
    tolerance: 0.02,
    recommended: { width: 1080, height: 1080 },
    description: "Square carousel — the classic Instagram deck shape.",
  },
  {
    id: "carousel-portrait-4-5",
    label: "Portrait 4:5",
    ratio: 4 / 5,
    tolerance: 0.02,
    recommended: { width: 1080, height: 1350 },
    description: "Tall portrait carousel — the most popular shape for educational decks.",
  },
];

/**
 * Reels (and Stories) are 9:16 vertical. The 1:1 and 4:5
 * shapes crop badly into Reels; we flag any non-9:16
 * submission as a warning rather than an error.
 */
export const REEL_RATIOS: ReadonlyArray<AspectRatioSpec> = [
  {
    id: "reel-9-16",
    label: "Vertical 9:16",
    ratio: 9 / 16,
    tolerance: 0.02,
    recommended: { width: 1080, height: 1920 },
    description: "Vertical video — the only shape Reels crops cleanly.",
  },
];

export const STORY_RATIOS: ReadonlyArray<AspectRatioSpec> = REEL_RATIOS;

/** Result of an aspect-ratio diagnostic. */
export type DiagnosticSeverity = "ok" | "warning" | "error";

/**
 * What the diagnostic has to say, as data rather than prose.
 *
 * The summary/recommendation used to be English sentences assembled here,
 * which meant the preview's diagnostic row stayed English on an Arabic
 * workspace. The lib is pure and knows nothing about locales, so it now
 * returns a `kind` plus every value the sentence needs, and the view
 * resolves the copy through `t()`.
 *
 * Each variant maps 1:1 to the summary/recommendation pair it replaces:
 *   unknown    → "Dimensions unknown" / "Pick a target shape…"
 *   match      → "<w> × <h> (<ratio>) — matches <label>." / spec prose
 *   belowMinimum → same summary / "Minimum <rw> × <rh> for <label>."
 *   noMatch    → "<w> × <h> (<ratio>) — not an exact match…" / "Try…"
 *   noTarget   → "<w> × <h> (<ratio>) — no target shape configured." / …
 */
export type DiagnosticMessage =
  | { kind: "unknown" }
  | {
      kind: "match";
      width: number;
      height: number;
      ratio: string;
      label: string;
      description: string;
    }
  | {
      kind: "belowMinimum";
      width: number;
      height: number;
      ratio: string;
      label: string;
      recommendedWidth: number;
      recommendedHeight: number;
    }
  | {
      kind: "noMatch";
      width: number;
      height: number;
      ratio: string;
      recommendedWidth: number;
      recommendedHeight: number;
      label: string;
    }
  | { kind: "noTarget"; width: number; height: number; ratio: string };

export interface AspectRatioDiagnostic {
  severity: DiagnosticSeverity;
  /** True when the shape matches but one or both dimensions are below the minimum. */
  belowMinimum: boolean;
  /** The closest matching spec, if any. */
  matchedSpec: AspectRatioSpec | null;
  /** All specs that would also match (e.g. multiple
   *  carousel options). Empty when the input is unknown. */
  candidateSpecs: ReadonlyArray<AspectRatioSpec>;
  /** Computed ratio (width/height). */
  ratio: number;
  /** Width in pixels, if known. */
  width: number | null;
  /** Height in pixels, if known. */
  height: number | null;
  /** Structured verdict for the view to localize. */
  message: DiagnosticMessage;
}

/**
 * Diagnostic helper: given an asset's actual dimensions
 * and a target presentation shape, return the diagnostic.
 *
 * The function is pure — no I/O, no DOM. The component
 * layers that need DOM-level measurement call this with the
 * measured values; server-side callers pass whatever they
 * already have.
 */
export function diagnoseAspectRatio(
  width: number | null,
  height: number | null,
  candidates: ReadonlyArray<AspectRatioSpec>,
): AspectRatioDiagnostic {
  if (width === null || height === null || width <= 0 || height <= 0) {
    return {
      severity: "warning",
      belowMinimum: false,
      matchedSpec: null,
      candidateSpecs: candidates,
      ratio: 0,
      width: null,
      height: null,
      message: { kind: "unknown" },
    };
  }
  const ratio = width / height;
  const matches = candidates.filter((c) => Math.abs(c.ratio - ratio) <= c.tolerance);
  if (matches.length > 0) {
    const matchedSpec = matches[0]!;
    const belowMinimum =
      width < matchedSpec.recommended.width || height < matchedSpec.recommended.height;
    return {
      severity: belowMinimum ? "warning" : "ok",
      belowMinimum,
      matchedSpec,
      candidateSpecs: matches,
      ratio,
      width,
      height,
      message: belowMinimum
        ? {
            kind: "belowMinimum",
            width,
            height,
            ratio: describeRatio(ratio),
            label: matchedSpec.label,
            recommendedWidth: matchedSpec.recommended.width,
            recommendedHeight: matchedSpec.recommended.height,
          }
        : {
            kind: "match",
            width,
            height,
            ratio: describeRatio(ratio),
            label: matchedSpec.label,
            description: matchedSpec.description,
          },
    };
  }
  // No match — pick the nearest spec to give actionable advice.
  const nearest = candidates
    .slice()
    .sort((a, b) => Math.abs(a.ratio - ratio) - Math.abs(b.ratio - ratio))[0];
  if (nearest) {
    return {
      severity: "warning",
      belowMinimum: false,
      matchedSpec: null,
      candidateSpecs: [],
      ratio,
      width,
      height,
      message: {
        kind: "noMatch",
        width,
        height,
        ratio: describeRatio(ratio),
        recommendedWidth: nearest.recommended.width,
        recommendedHeight: nearest.recommended.height,
        label: nearest.label,
      },
    };
  }
  return {
    severity: "warning",
    belowMinimum: false,
    matchedSpec: null,
    candidateSpecs: candidates,
    ratio,
    width,
    height,
    message: { kind: "noTarget", width, height, ratio: describeRatio(ratio) },
  };
}

/** Cross-check multiple assets (e.g. carousel slides) for
 *  consistency. Returns the worst severity across the
 *  candidates. */
export function diagnoseCarouselConsistency(
  slides: Array<{ width: number | null; height: number | null }>,
  candidates: ReadonlyArray<AspectRatioSpec>,
): { ok: boolean; severities: DiagnosticSeverity[]; summary: string } {
  if (slides.length === 0) {
    return { ok: true, severities: [], summary: "" };
  }
  const severities = slides.map((s) => diagnoseAspectRatio(s.width, s.height, candidates).severity);
  const ok = severities.every((s) => s === "ok");
  const errorCount = severities.filter((s) => s === "error").length;
  const warningCount = severities.filter((s) => s === "warning").length;
  if (ok) {
    return { ok: true, severities, summary: `All ${slides.length} slides match.` };
  }
  if (errorCount > 0) {
    return {
      ok: false,
      severities,
      summary: `${errorCount} of ${slides.length} slides fail the check.`,
    };
  }
  return {
    ok: false,
    severities,
    summary: `${warningCount} of ${slides.length} slides need attention.`,
  };
}

export function describeRatio(r: number): string {
  // Pretty-print the common shapes; fall back to "w:h"
  // for anything else.
  const close = (target: number, label: string) => (Math.abs(r - target) < 0.01 ? label : null);
  return (
    close(1, "1:1") ??
    close(4 / 5, "4:5") ??
    close(9 / 16, "9:16") ??
    close(16 / 9, "16:9") ??
    close(1.91, "1.91:1") ??
    `${r.toFixed(2)}:1`
  );
}
