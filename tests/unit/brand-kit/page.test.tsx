import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────
// Phase 7: the brand-kit page is a focused overview (no Bento grid).
// Per-section CRUD lives on the per-section routes (`logos/page.tsx`,
// `colors/page.tsx`, etc.); this test only proves the overview renders
// the right chrome (hero, KPI grid, recent activity, Download ZIP).

const dbMock = vi.hoisted(() => {
  function makeChain(rows: unknown[]): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(rows));
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
    return chain;
  }
  return {
    select: vi.fn(() => makeChain([])),
    _setAssets: (rows: unknown[]) => {
      dbMock.select.mockImplementation(() => makeChain(rows));
    },
  };
});

const authMock = vi.hoisted(() => ({
  auth: vi.fn(),
}));

const workspaceMock = vi.hoisted(() => ({
  getAccessibleWorkspace: vi.fn(),
}));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(),
}));

const serviceMock = vi.hoisted(() => ({
  listContentPillars: vi.fn(),
  listRecentBrandUpdates: vi.fn(),
  listBrandPublishingRules: vi.fn(),
  listBrandLinkedResources: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  getSignedDownloadUrl: vi.fn(),
}));

// Phase-7 follow-up (bilingual): the page now calls `tForActive()`
// to render its header. Tests assert on data-testid + text content
// (e.g. KPI label text), so we resolve the few keys the page reads
// to their English catalog values. The production catalog is the
// real source of truth; this shim just keeps the test cheap.
const tForActiveMock = vi.hoisted(() =>
  vi.fn(async () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "brandKit.title": "Brand Kit",
        "brandKit.description":
          "The shared source for visual assets and writing guidance. Every planner, designer, and reviewer ships in one voice.",
        "brandKit.eyebrow": "Brand Kit",
        "brandKit.activityTitle": "Activity",
        "brandKit.activityDescription": "Recent changes to the brand kit.",
        "brandKit.logosTitle": "Logos",
        "brandKit.logosDescription": "Marks, wordmarks, and approved uses.",
        "brandKit.colorsTitle": "Colors",
        "brandKit.colorsDescription": "Primary, secondary, and accent tokens.",
        "brandKit.typographyTitle": "Typography",
        "brandKit.typographyDescription": "Headline, body, and accent faces.",
        "brandKit.voiceTitle": "Voice & tone",
        "brandKit.voiceDescription": "Do/don't rules and editorial guardrails.",
        "brandKit.pillarsTitle": "Pillars",
        "brandKit.pillarsDescription": "Recurring topics for plans and posts.",
        "brandKit.publishingTitle": "Publishing rules",
        "brandKit.publishingDescription": "Editorial guardrails for the team.",
        "brandKit.linkedTitle": "Linked resources",
        "brandKit.linkedDescription": "External libraries the team can pull from.",
        "brandKit.downloadZip": "Download ZIP",
        "brandKit.addAsset": "Add asset",
        "brandKit.recentUpdates": "Recent updates",
        "brandKit.viewAllActivity": "View all activity",
        "brandKit.downloadDisabledHint":
          "Add at least one logo, color, or font before downloading.",
        "brandKit.section.logos": "Logos",
        "brandKit.section.colors": "Colors",
        "brandKit.section.typography": "Typography",
        "brandKit.section.pillars": "Pillars",
        "brandKit.section.activity": "Activity",
        "brandKit.overview.downloadZip": "Download ZIP",
        "brandKit.overview.downloadZipEmpty":
          "Add at least one logo, color, or font before downloading.",
        "brandKit.overview.browseTemplates": "Browse templates",
        "brandKit.overview.recentUpdates": "Recent updates",
        "brandKit.overview.seeAllActivity": "See all activity →",
      };
      const value = map[key] ?? key;
      if (!params) return value;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        value,
      );
    },
    code: "en",
    dir: "ltr" as const,
    source: "fallback" as const,
  })),
);

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/auth/config", () => ({ auth: authMock.auth }));
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: policyMock.hasWorkspaceRole }));
vi.mock("@/lib/brand/service", () => ({
  listContentPillars: serviceMock.listContentPillars,
  listRecentBrandUpdates: serviceMock.listRecentBrandUpdates,
  listBrandPublishingRules: serviceMock.listBrandPublishingRules,
  listBrandLinkedResources: serviceMock.listBrandLinkedResources,
}));
vi.mock("@/lib/storage", () => ({ getSignedDownloadUrl: storageMock.getSignedDownloadUrl }));
vi.mock("@/lib/i18n/t-for-active", () => ({ tForActive: tForActiveMock }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ─── Imports under test ──────────────────────────────────────────────
async function loadPage() {
  const mod = await import("@/app/(app)/app/w/[slug]/brand-kit/page");
  return mod.default;
}

// ─── Helpers ─────────────────────────────────────────────────────────
const slug = "test-slug";
const workspace = { id: "ws-1", slug, name: "Test Workspace", timezone: "Europe/Vienna" };
const session = { user: { id: "user-1" } };

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock._setAssets([]);
  authMock.auth.mockReset();
  workspaceMock.getAccessibleWorkspace.mockReset();
  policyMock.hasWorkspaceRole.mockReset();
  serviceMock.listContentPillars.mockReset();
  serviceMock.listRecentBrandUpdates.mockReset();
  serviceMock.listBrandPublishingRules.mockReset();
  serviceMock.listBrandLinkedResources.mockReset();
  serviceMock.listContentPillars.mockResolvedValue([]);
  serviceMock.listRecentBrandUpdates.mockResolvedValue([]);
  serviceMock.listBrandPublishingRules.mockResolvedValue([]);
  serviceMock.listBrandLinkedResources.mockResolvedValue([]);
  storageMock.getSignedDownloadUrl.mockReset();
  tForActiveMock.mockClear();
});

async function renderOverview(): Promise<ReturnType<typeof render>> {
  authMock.auth.mockResolvedValue(session);
  workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  const BrandKitPage = await loadPage();
  return render(await BrandKitPage({ params: Promise.resolve({ slug }) }));
}

// ─── Tests ───────────────────────────────────────────────────────────
describe("Brand Kit overview (Phase 7)", () => {
  it("renders the brand identity hero with the workspace name", async () => {
    await renderOverview();
    const hero = screen.getByTestId("brand-kit-hero");
    expect(hero).toBeInTheDocument();
    expect(hero).toHaveTextContent(/Test Workspace/);
  });

  it("renders the KPI grid with deep links to every section route", async () => {
    await renderOverview();
    const grid = screen.getByTestId("brand-kit-kpi-grid");
    expect(grid).toBeInTheDocument();
    for (const [label, testId] of [
      ["Logos", "brand-kit-kpi-logos"],
      ["Colors", "brand-kit-kpi-colors"],
      ["Typography", "brand-kit-kpi-typography"],
      ["Voice & tone", "brand-kit-kpi-voice"],
      ["Pillars", "brand-kit-kpi-pillars"],
      ["Publishing rules", "brand-kit-kpi-publishing"],
      ["Linked resources", "brand-kit-kpi-linked"],
      ["Activity", "brand-kit-kpi-activity"],
    ] as const) {
      const card = screen.getByTestId(testId);
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent(label);
    }
    // Each KPI card is an anchor that points to the matching per-section route.
    expect(screen.getByTestId("brand-kit-kpi-logos").getAttribute("href")).toBe(
      `/app/w/${slug}/brand-kit/logos`,
    );
    expect(screen.getByTestId("brand-kit-kpi-voice").getAttribute("href")).toBe(
      `/app/w/${slug}/brand-kit/voice`,
    );
    expect(screen.getByTestId("brand-kit-kpi-activity").getAttribute("href")).toBe(
      `/app/w/${slug}/brand-kit/activity`,
    );
  });

  it("renders the recent updates section with a link to the full activity page", async () => {
    serviceMock.listRecentBrandUpdates.mockResolvedValue([
      {
        updatedAt: new Date(),
        kind: "rule",
        description: "Added a tone rule",
        actor: { id: "u-1", displayName: "Maya", image: null },
      },
    ]);
    await renderOverview();
    const section = screen.getByTestId("brand-kit-recent-section");
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent(/Recent updates/);
    const link = screen.getByTestId("brand-kit-recent-section-link");
    expect(link.getAttribute("href")).toBe(`/app/w/${slug}/brand-kit/activity`);
  });

  it("renders the Download ZIP CTA enabled when the workspace has any asset", async () => {
    dbMock._setAssets([
      { id: "logo-1", kind: "logo", name: "Mark", value: {}, externalUrl: null, storagePath: null },
    ]);
    await renderOverview();
    const zip = screen.getByTestId("brand-kit-export-zip");
    expect(zip).toBeInTheDocument();
  });

  it("disables the Download ZIP CTA when the workspace has zero assets", async () => {
    await renderOverview();
    const zip = screen.getByTestId("brand-kit-export-zip");
    expect(zip).toBeInTheDocument();
    expect(zip).toBeDisabled();
  });

  it("does NOT render the per-section CRUD forms on the overview (they moved to per-section routes)", async () => {
    await renderOverview();
    // The old overview used to inline the logo / color / typography / voice
    // forms (Round 1–5). Phase 7 removes them; the per-section routes own
    // CRUD now. Asserting their absence is the regression guard.
    expect(screen.queryByTestId("mock-color-form")).toBeNull();
    expect(screen.queryByTestId("mock-voice-form")).toBeNull();
    expect(screen.queryByTestId("mock-logo-form")).toBeNull();
    expect(screen.queryByTestId("mock-typography-form")).toBeNull();
    expect(screen.queryByTestId("mock-publishing-rule-form")).toBeNull();
    expect(screen.queryByTestId("mock-linked-resource-form")).toBeNull();
    expect(screen.queryByTestId("brand-kit-add-asset")).toBeNull();
  });
});
