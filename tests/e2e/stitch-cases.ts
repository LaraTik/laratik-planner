/**
 * Canonical 49-screen Stitch capture contract.
 *
 * The on-disk artifacts under `designs/stitch/` are the source of truth
 * for visual parity. Every case here binds a Stitch `screenId` (the
 * first 8 characters of the capture's full ID, matching the filename
 * prefix) to the route (or shared-state evidence group) and viewport
 * it represents, plus a classification that drives implementation
 * priorities:
 *
 * - `canonical`  → primary surface, must match exactly.
 * - `responsive` → same surface at a different viewport.
 * - `supporting` → related surface that ships as part of the
 *                  canonical set but is not a top-level route.
 * - `historical` → early reference kept for traceability; not an
 *                  implementation target (always carries a successor).
 * - `superseded` → older revision; do not implement against it
 *                  (always carries a successor).
 *
 * The 39 active entries (canonical + responsive + supporting) are the
 * production-readiness targets. The 10 historical/superseded entries
 * are kept so reviewers can trace the lineage of each canonical
 * surface back to its first capture.
 */

export type StitchViewport = "desktop" | "mobile" | "tablet";

export type StitchState =
  "default" | "empty" | "final" | "failed" | "approved" | "discussion" | "decision" | "drawer";

export type StitchClassification =
  "canonical" | "responsive" | "supporting" | "historical" | "superseded";

export type StitchEvidenceGroup = "operational-states" | "notification-drawer";

export type StitchCase = {
  screenId: string;
  slug: string;
  pngPath: string;
  htmlPath: string;
  route?: string;
  evidenceGroup?: StitchEvidenceGroup;
  viewport: { width: number; height: number };
  classification: StitchClassification;
  successorScreenId?: string;
  state: StitchState;
};

const VIEWPORTS: Record<StitchViewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
};

const artifact = (id: string, slug: string, extension: "png" | "html"): string =>
  `designs/stitch/${id}_${slug}.${extension}`;

const defineCase = (
  screenId: string,
  slug: string,
  target: Omit<StitchCase, "screenId" | "slug" | "pngPath" | "htmlPath">,
): StitchCase => ({
  screenId,
  slug,
  pngPath: artifact(screenId.slice(0, 8), slug, "png"),
  htmlPath: artifact(screenId.slice(0, 8), slug, "html"),
  ...target,
});

export const STITCH_CASES: StitchCase[] = [
  defineCase("01aa8faf", "studioflow---workspaces", {
    route: "/app/workspaces",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("0480cbe9", "northstar-coffee---tablet-planning", {
    route: "/app/w/acme/planning",
    viewport: VIEWPORTS.tablet,
    state: "default",
    classification: "responsive",
  }),
  defineCase("06a9382e", "northstar-coffee---delivery---creative-review", {
    route: "/app/w/acme/planning/{contentItemId}",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "historical",
    successorScreenId: "879e7539",
  }),
  defineCase("116b6e36", "studioflow---notifications-mobile-final", {
    evidenceGroup: "notification-drawer",
    viewport: VIEWPORTS.mobile,
    state: "drawer",
    classification: "superseded",
    successorScreenId: "1272d1fa",
  }),
  defineCase("1272d1fa", "studioflow---notifications-mobile-approved", {
    evidenceGroup: "notification-drawer",
    viewport: VIEWPORTS.mobile,
    state: "approved",
    classification: "responsive",
  }),
  defineCase("129bd2e9", "northstar-coffee---batch-add-ideas", {
    route: "/app/w/acme/planning/batch",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "superseded",
    successorScreenId: "43a166ed",
  }),
  defineCase("12d2ff28", "northstar-coffee---tablet-content-detail", {
    route: "/app/w/acme/planning/{contentItemId}",
    viewport: VIEWPORTS.tablet,
    state: "default",
    classification: "responsive",
  }),
  defineCase("16aaf0a9", "northstar-coffee---brand-kit", {
    route: "/app/w/acme/brand-kit",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("21068e5a", "studioflow---operational-states", {
    evidenceGroup: "operational-states",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("218f259a", "northstar-coffee---client-calendar-read-only", {
    route: "/app/w/acme/client/calendar",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("2dafd80a", "studioflow---login", {
    route: "/signin",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("2db8ec6e", "northstar-coffee---team---invitations--studioflow", {
    route: "/app/w/acme/team",
    viewport: VIEWPORTS.desktop,
    state: "final",
    classification: "canonical",
  }),
  defineCase("2f6acd26", "northstar-coffee---workspace-settings--corrected", {
    route: "/app/w/acme/settings",
    viewport: VIEWPORTS.desktop,
    state: "final",
    classification: "canonical",
  }),
  defineCase("382b9405", "northstar-coffee---publishing-failed-recovery", {
    route: "/app/w/acme/design-queue",
    viewport: VIEWPORTS.desktop,
    state: "failed",
    classification: "canonical",
  }),
  defineCase("43a166ed", "northstar-coffee---batch-add-ideas-final", {
    route: "/app/w/acme/planning/batch",
    viewport: VIEWPORTS.desktop,
    state: "final",
    classification: "canonical",
  }),
  defineCase("45d945d7", "northstar-coffee---social-channels-settings", {
    route: "/app/w/acme/channels",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("4ce1582b", "studioflow---my-work-mobile", {
    route: "/app",
    viewport: VIEWPORTS.mobile,
    state: "default",
    classification: "responsive",
  }),
  defineCase("5ad5fffc", "northstar-coffee---unassigned-design-queue", {
    route: "/app/w/acme/design-queue",
    viewport: VIEWPORTS.desktop,
    state: "empty",
    classification: "canonical",
  }),
  defineCase("686650a1", "studioflow---review-decision-mobile", {
    route: "/app/w/acme/reviews",
    viewport: VIEWPORTS.mobile,
    state: "decision",
    classification: "responsive",
  }),
  defineCase("7493876f", "northstar-coffee---planning-library", {
    route: "/app/w/acme/library",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("78083c8b", "autumn-blend-reveal---production-detail", {
    route: "/app/w/acme/planning/{contentItemId}",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "superseded",
    successorScreenId: "f7159c3e",
  }),
  defineCase("793a08d8", "studioflow---forgot-password", {
    route: "/signin/forgot-password",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("7ff4ca0d", "northstar-coffee---team---invitations", {
    route: "/app/w/acme/team",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "superseded",
    successorScreenId: "2db8ec6e",
  }),
  defineCase("84b2d2b8", "studioflow---content-detail---discussion-mobile", {
    route: "/app/w/acme/planning/{contentItemId}",
    viewport: VIEWPORTS.mobile,
    state: "discussion",
    classification: "responsive",
  }),
  defineCase("879e7539", "northstar-coffee---delivery---creative-review-final", {
    route: "/app/w/acme/reviews",
    viewport: VIEWPORTS.desktop,
    state: "final",
    classification: "canonical",
  }),
  defineCase("89113980", "studioflow---user-management", {
    route: "/app/users",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("8c0ec0b0", "northstar-coffee---editorial-calendar", {
    route: "/app/w/acme/calendar",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("901791af", "northstar-coffee---workflow-board", {
    route: "/app/w/acme/board",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "historical",
    successorScreenId: "f9e58e53",
  }),
  defineCase("96f0dd19", "northstar-coffee---monthly-planning-list", {
    route: "/app/w/acme/planning",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("9794f1aa", "northstar-coffee---quick-create-content-drawer", {
    route: "/app/w/acme/planning/new",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("9bbb403b", "northstar-coffee---tablet-overview", {
    route: "/app/w/acme",
    viewport: VIEWPORTS.tablet,
    state: "default",
    classification: "historical",
    successorScreenId: "d9bb7ef2",
  }),
  defineCase("9cf65ebd", "northstar-coffee---publishing-confirmation", {
    route: "/app/w/acme/design-queue",
    viewport: VIEWPORTS.desktop,
    state: "approved",
    classification: "canonical",
  }),
  defineCase("9d70e67a", "studioflow---quick-create-mobile", {
    route: "/app/w/acme/planning/new",
    viewport: VIEWPORTS.mobile,
    state: "default",
    classification: "responsive",
  }),
  defineCase("9e0f61c2", "northstar-coffee---tablet-reviews", {
    route: "/app/w/acme/reviews",
    viewport: VIEWPORTS.tablet,
    state: "default",
    classification: "responsive",
  }),
  defineCase("9e83a73c", "studioflow---create-workspace--brand-step", {
    route: "/app/workspaces/new",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "supporting",
  }),
  defineCase("a3631dbf", "studioflow---create-agency-administrator", {
    route: "/setup",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("b2677b3c", "northstar-coffee---workspace-settings", {
    route: "/app/w/acme/settings",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "superseded",
    successorScreenId: "2f6acd26",
  }),
  defineCase("bb6ac00d", "northstar-coffee---reviews", {
    route: "/app/w/acme/reviews",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("c44445d5", "studioflow---publishing-confirmation-mobile", {
    route: "/app/w/acme/design-queue",
    viewport: VIEWPORTS.mobile,
    state: "approved",
    classification: "responsive",
  }),
  defineCase("c7dd77e0", "northstar-coffee---client-review-portal", {
    route: "/app/w/acme/client",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("cb0de669", "studioflow---agency-ai-settings-approved", {
    route: "/app/agency-settings",
    viewport: VIEWPORTS.desktop,
    state: "approved",
    classification: "canonical",
  }),
  defineCase("d9bb7ef2", "northstar-coffee---tablet-overview-final", {
    route: "/app/w/acme",
    viewport: VIEWPORTS.tablet,
    state: "final",
    classification: "responsive",
  }),
  defineCase("e350b62a", "studioflow---agency-ai-settings-final", {
    route: "/app/agency-settings",
    viewport: VIEWPORTS.desktop,
    state: "final",
    classification: "superseded",
    successorScreenId: "cb0de669",
  }),
  defineCase("e522f7d8", "studioflow---ai-assistance-settings", {
    route: "/app/w/acme/ai-settings",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "superseded",
    successorScreenId: "cb0de669",
  }),
  defineCase("e5d3f628", "northstar-coffee---tablet-calendar", {
    route: "/app/w/acme/calendar",
    viewport: VIEWPORTS.tablet,
    state: "default",
    classification: "responsive",
  }),
  defineCase("f2bf40ae", "northstar-coffee---workspace-overview", {
    route: "/app/w/acme",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("f4dc67d1", "studioflow---my-work-dashboard", {
    route: "/app",
    viewport: VIEWPORTS.desktop,
    state: "default",
    classification: "canonical",
  }),
  defineCase("f7159c3e", "autumn-blend-reveal---updated-production-detail", {
    route: "/app/w/acme/planning/{contentItemId}",
    viewport: VIEWPORTS.desktop,
    state: "final",
    classification: "canonical",
  }),
  defineCase("f9e58e53", "northstar-coffee---workflow-board-final", {
    route: "/app/w/acme/board",
    viewport: VIEWPORTS.desktop,
    state: "final",
    classification: "canonical",
  }),
];

// ─── Task 7: visual regression harness contract ─────────────────────────────
//
// The 6 viewports the visual-regression harness baselines against. The
// Stitch captures only ship at three viewport sizes (desktop 1440×900,
// mobile 390×844, tablet 768×1024); the harness is the bridge between
// those and the actual responsive matrix the production UI is built for.
export const REGRESSION_VIEWPORTS = [
  { name: "mobile-s", width: 360, height: 800 },
  { name: "mobile-m", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide", width: 1440, height: 900 },
] as const;

export type RegressionViewportName = (typeof REGRESSION_VIEWPORTS)[number]["name"];

/**
 * A viewport descriptor used by the harness. The responsive matrix
 * always uses the six `REGRESSION_VIEWPORTS`; the exact-reference
 * loop uses the viewport the Stitch case was captured at, which may
 * be one of the same six or the canonical desktop/mobile/tablet
 * variant. We keep the type wide so the exact-reference case can
 * carry its own width/height.
 */
export type RegressionViewport = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
};

/**
 * Minimal shape the harness needs to resolve `{contentItemId}` from a
 * dev-seed result. `SeedResult` (in `_helpers.ts`) is structurally
 * assignable, but we only need this subset for route substitution.
 */
export type SeedResultLike = { contentItemId: string };

/**
 * Replace `{contentItemId}` placeholders in a route template with the
 * actual content item ID from the dev seed. Other placeholders (none
 * today) pass through untouched.
 */
export function resolveStitchRoute(route: string, seed: SeedResultLike): string {
  return route.replace(/\{contentItemId\}/g, seed.contentItemId);
}

/**
 * Stable screenshot name for a Stitch case at a given viewport. Used
 * by both the exact-reference loop and the responsive matrix so a
 * reviewer can find every capture deterministically.
 */
export function screenshotNameFor(entry: StitchCase, viewport: RegressionViewport): string {
  return `${entry.classification}-${entry.screenId}-${viewport.name}.png`;
}

/**
 * Slug used for the responsive matrix (27 surfaces × 6 viewports). The
 * matrix uses the surface string (route or evidence-group key) as the
 * prefix so the parity doc and the harness stay in lockstep.
 */
export function responsiveScreenshotName(surface: string, viewport: RegressionViewport): string {
  return `responsive-${slugify(surface)}-${viewport.name}.png`;
}

function slugify(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Unique routes implied by the 27 canonical Stitch cases (the
 * `operational-states` evidence group is shared state, not a route,
 * so it is intentionally excluded — the Stitch review of `21068e5a`
 * covers it against the captured PNG/HTML). The responsive matrix
 * renders every route at every regression viewport
 * (24 routes × 6 = 144 baselines).
 */
export const CANONICAL_SURFACES: readonly string[] = (() => {
  const surfaces = new Set<string>();
  for (const entry of STITCH_CASES) {
    if (entry.classification !== "canonical") continue;
    if (entry.route) surfaces.add(entry.route);
  }
  return [...surfaces].sort();
})();

/**
 * Setup function contract: a Playwright page operation that puts the
 * browser into the case's declared `state` (empty list, failed
 * delivery, approved decision, etc.) before the harness takes a
 * screenshot. Every entry in `SETUP_FUNCTIONS` MUST be idempotent
 * and MUST throw if called when `process.env.NODE_ENV === "production"`.
 */
export type SetupState = (page: Page, seed: SeedResultLike) => Promise<void>;

// Imported at the bottom of the file so the test helpers can sit next
// to the manifest that drives them. Imported via require to keep the
// type-only re-export side effect free for unit tests.
import type { Page } from "@playwright/test";
import {
  setupApprovedState,
  setupDecisionState,
  setupDiscussionState,
  setupEmptyState,
  setupFailedState,
  setupFinalState,
  setupNotificationDrawer,
} from "./stitch-state-helpers";

/**
 * Map from `StitchState` to its deterministic setup function. The
 * `default` state needs no special preparation; the page is just
 * navigated to the resolved route.
 */
export const SETUP_FUNCTIONS: Record<StitchState, SetupState> = {
  default: async () => {},
  empty: setupEmptyState,
  final: setupFinalState,
  failed: setupFailedState,
  approved: setupApprovedState,
  discussion: setupDiscussionState,
  decision: setupDecisionState,
  drawer: setupNotificationDrawer,
};
