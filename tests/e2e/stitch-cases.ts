import type { Page } from "@playwright/test";
import type { PlatformRole } from "../../src/lib/auth/platform-access-types";
import currentStitchManifest from "../../designs/stitch-current/manifest.json";
import {
  setupApprovedState,
  setupDecisionState,
  setupDiscussionState,
  setupEmptyState,
  setupFailedState,
  setupFinalState,
  setupNotificationDrawer,
  setupTrendsLiveState,
} from "./stitch-state-helpers";

/**
 * Current Google Stitch capture contract.
 *
 * The manifest under `designs/stitch-current/` is the single source of truth
 * for the active screen IDs and captured HTML/PNG artifacts. The previous
 * StudioFlow capture is intentionally not imported here: it is an archive,
 * not a visual target for the current LaraTik Planner flow.
 */

export const CURRENT_STITCH_PROJECT_ID = "16083107078886291815";
export const CURRENT_STITCH_DESIGN_SYSTEM_ID = "14000568228937989951";

export type StitchViewport = "desktop" | "mobile" | "tablet";

export type StitchState =
  | "default"
  | "empty"
  | "final"
  | "failed"
  | "approved"
  | "discussion"
  | "decision"
  | "drawer"
  | "account-menu"
  | "trends-live";

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
  platformRole?: PlatformRole;
};

type CurrentScreen = {
  id: string;
  route: string;
  device: "desktop" | "mobile";
  slug: string;
};

const CURRENT_SCREENS = currentStitchManifest.screens as readonly CurrentScreen[];

const VIEWPORTS: Record<StitchViewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
};

const artifact = (id: string, slug: string, extension: "png" | "html"): string =>
  `designs/stitch-current/${id}_${slug}.${extension}`;

function routeForTest(route: string): string | undefined {
  if (route === "shared operational states") return undefined;
  return route
    .replaceAll("/[slug]", "/acme")
    .replace("/[id]", "/{contentItemId}")
    .replace("/[agencyId]", "/{agencyId}");
}

function evidenceGroupFor(route: string): StitchEvidenceGroup | undefined {
  return route === "shared operational states" ? "operational-states" : undefined;
}

export const STITCH_CASES: StitchCase[] = CURRENT_SCREENS.map((screen) => {
  const route = routeForTest(screen.route);
  const evidenceGroup = evidenceGroupFor(screen.route);
  const classification: StitchClassification = evidenceGroup
    ? "supporting"
    : screen.device === "mobile"
      ? "responsive"
      : "canonical";

  return {
    screenId: screen.id,
    slug: screen.slug,
    pngPath: artifact(screen.id, screen.slug, "png"),
    htmlPath: artifact(screen.id, screen.slug, "html"),
    ...(route ? { route } : {}),
    ...(evidenceGroup ? { evidenceGroup } : {}),
    viewport: VIEWPORTS[screen.device],
    classification,
    state: screen.route === "/app/w/[slug]/trends" ? "trends-live" : "default",
    ...(route?.startsWith("/app/platform/") ? { platformRole: "platform_owner" as const } : {}),
  };
});

// ─── Visual regression harness contract ────────────────────────────────────

/**
 * The responsive matrix used by the local and CI visual harness. Planning
 * surfaces receive the wider review matrix because their list/detail flows
 * are the most sensitive to small-screen layout changes.
 */
export const REGRESSION_VIEWPORTS = [
  { name: "mobile-s", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "wide", width: 1440, height: 900 },
] as const;

export const PLANNING_DETAIL_VIEWPORTS = [
  { name: "mobile-s", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "wide", width: 1440, height: 900 },
] as const;

export function viewportsForSurface(surface: string): readonly {
  name: string;
  width: number;
  height: number;
}[] {
  if (surface.startsWith("/app/w/acme/planning")) return PLANNING_DETAIL_VIEWPORTS;
  return REGRESSION_VIEWPORTS;
}

export type RegressionViewportName = (typeof REGRESSION_VIEWPORTS)[number]["name"];

export type RegressionViewport = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
};

export type SeedResultLike = { contentItemId: string; agencyId?: string };

export function resolveStitchRoute(route: string, seed: SeedResultLike): string {
  const resolved = route.replace(/\{contentItemId\}/g, seed.contentItemId);
  if (!resolved.includes("{agencyId}")) return resolved;
  if (!seed.agencyId) {
    throw new Error(`Cannot resolve Stitch route ${route}: seed has no agencyId`);
  }
  return resolved.replace(/\{agencyId\}/g, seed.agencyId);
}

const PORTABLE_VIEWPORT_NAME: Record<string, string> = {
  "mobile-s": "mobile-s",
  "mobile-m": "mobile-m",
  tablet: "tablet",
  laptop: "laptop",
  desktop: "desktop",
  wide: "wide",
};

export function screenshotNameFor(entry: StitchCase, viewport: RegressionViewport): string {
  const viewportName = PORTABLE_VIEWPORT_NAME[viewport.name] ?? viewport.name;
  return `reference/${entry.classification}-${entry.screenId}-${viewportName}.png`;
}

export function responsiveScreenshotName(surface: string, viewport: RegressionViewport): string {
  const viewportName = PORTABLE_VIEWPORT_NAME[viewport.name] ?? viewport.name;
  return `responsive/${slugify(surface)}-${viewportName}.png`;
}

function slugify(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Unique route list represented by the current canonical Stitch screens. */
export const CANONICAL_SURFACES: readonly string[] = (() => {
  const surfaces = new Set<string>();
  for (const entry of STITCH_CASES) {
    if (entry.classification !== "canonical") continue;
    if (entry.route) surfaces.add(entry.route);
  }
  return [...surfaces].sort();
})();

/**
 * Shipped app routes without a separate current Stitch reference. They still
 * receive responsive regression coverage so role-specific and empty states
 * cannot silently drift.
 */
export const APP_ONLY_SURFACES = [
  "/",
  "/accept-invitation",
  "/agency-unavailable",
  "/data-deletion",
  "/privacy",
  "/signin/set-password",
  "/terms",
  "/app/media",
  "/app/users",
  "/app/workspaces/new",
  "/app/agency-settings/plan",
  "/app/agency-settings/planning-packs",
  "/app/agency-settings/social",
  "/app/agency-settings/social/providers",
  "/app/agency-settings/storage",
  "/app/agency-settings/trend-sources",
  "/app/platform/access",
  "/app/platform/admins",
  "/app/platform/agencies",
  "/app/platform/errors",
  "/app/platform/operations/cron",
  "/app/platform/security",
  "/app/platform/storage",
  "/setup",
  "/signin/forgot-password",
  "/signin/verify",
  "/app/w/acme/channels",
  "/app/w/acme/client/calendar",
  "/app/w/acme/library",
  "/app/w/acme/team",
  "/app/w/acme/planning/new",
  "/app/w/acme/planning/batch",
  "/app/w/acme/planning/edit/{contentItemId}",
  "/app/w/acme/planning/monthly",
  "/app/w/acme/settings/approvals",
  "/app/w/acme/settings/defaults",
  "/app/w/acme/settings/lead-times",
  "/app/w/acme/settings/lifecycle",
  "/app/w/acme/settings/templates",
  "/app/w/acme/settings/trends",
  "/app/w/acme/brand-kit/activity",
  "/app/w/acme/brand-kit/colors",
  "/app/w/acme/brand-kit/linked",
  "/app/w/acme/brand-kit/logos",
  "/app/w/acme/brand-kit/pillars",
  "/app/w/acme/brand-kit/profile",
  "/app/w/acme/brand-kit/publishing",
  "/app/w/acme/brand-kit/templates",
  "/app/w/acme/brand-kit/typography",
  "/app/w/acme/brand-kit/voice",
] as const;

/**
 * Union of canonical routes and active responsive/supporting route cases used
 * to pre-warm the visual harness without revisiting historical captures.
 */
export function collectPreWarmRoutes(): readonly string[] {
  const routes = new Set<string>(CANONICAL_SURFACES);
  for (const entry of STITCH_CASES) {
    if (entry.classification === "historical" || entry.classification === "superseded") {
      continue;
    }
    if (entry.route) routes.add(entry.route);
  }
  return [...routes].sort();
}

export type SetupState = (page: Page, seed: SeedResultLike) => Promise<void>;

export const SETUP_FUNCTIONS: Record<StitchState, SetupState> = {
  default: async () => {},
  "account-menu": async () => {},
  empty: setupEmptyState,
  final: setupFinalState,
  failed: setupFailedState,
  approved: setupApprovedState,
  discussion: setupDiscussionState,
  decision: setupDecisionState,
  drawer: setupNotificationDrawer,
  "trends-live": setupTrendsLiveState,
};
