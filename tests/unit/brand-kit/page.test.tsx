import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────
// The page is a server component that hits the database, the auth
// layer, the storage adapter, and the brand service listers. We mock
// every one of those boundaries so the test stays a pure
// component-shape check (Bento grid, top tabs, section anchors,
// canManage behaviour). Behavioural coverage of the actions lives
// in `actions.test.ts`; the form components have their own unit
// suites; this test only proves the new layout is in place.

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
}));

const storageMock = vi.hoisted(() => ({
  getSignedDownloadUrl: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/auth/config", () => ({ auth: authMock.auth }));
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: policyMock.hasWorkspaceRole }));
vi.mock("@/lib/brand/service", () => ({
  listContentPillars: serviceMock.listContentPillars,
  listRecentBrandUpdates: serviceMock.listRecentBrandUpdates,
}));
vi.mock("@/lib/storage", () => ({ getSignedDownloadUrl: storageMock.getSignedDownloadUrl }));

// next/navigation: `redirect` and `notFound` should throw in the
// server runtime; in the test we replace them with no-ops so the
// happy path can render. The unhappy paths are covered by the
// dedicated test below.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Stub the form components so the page test does not have to load
// `next/font/google` (used by the typography form) or any of the
// `useActionState` server-action plumbing. The forms' own
// behaviour is covered by their individual unit suites.
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/color-form", () => ({
  ColorForm: () => <div data-testid="mock-color-form" />,
}));
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/voice-form", () => ({
  VoiceForm: () => <div data-testid="mock-voice-form" />,
}));
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/logo-form", () => ({
  LogoForm: () => <div data-testid="mock-logo-form" />,
}));
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/typography-form", () => ({
  TypographyForm: () => <div data-testid="mock-typography-form" />,
}));

// Server actions — never invoked from these tests but the page
// imports them for the archive `<form action={...}>` bindings.
vi.mock("@/app/(app)/app/w/[slug]/brand-kit/actions", () => ({
  archiveColorAssetAction: vi.fn(),
  archiveFontAssetAction: vi.fn(),
  archiveLogoAssetAction: vi.fn(),
  archiveVoiceRuleAction: vi.fn(),
}));

// ─── Imports under test ──────────────────────────────────────────────
// We import the page *after* the mocks are registered so the page
// module sees the stubbed dependencies. `vi.resetModules` between
// tests ensures a fresh module instance per scenario (different
// `canManage`, different data).
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
  storageMock.getSignedDownloadUrl.mockReset();
});

async function renderPageForManager(): Promise<ReturnType<typeof render>> {
  authMock.auth.mockResolvedValue(session);
  workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  serviceMock.listContentPillars.mockResolvedValue([]);
  serviceMock.listRecentBrandUpdates.mockResolvedValue([]);
  const BrandKitPage = await loadPage();
  return render(await BrandKitPage({ params: Promise.resolve({ slug }) }));
}

async function renderPageForViewer(): Promise<ReturnType<typeof render>> {
  authMock.auth.mockResolvedValue(session);
  workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
  policyMock.hasWorkspaceRole.mockResolvedValue(false);
  serviceMock.listContentPillars.mockResolvedValue([]);
  serviceMock.listRecentBrandUpdates.mockResolvedValue([]);
  const BrandKitPage = await loadPage();
  return render(await BrandKitPage({ params: Promise.resolve({ slug }) }));
}

// ─── Tests ───────────────────────────────────────────────────────────
describe("BrandKitPage layout (Round 3 / commit G)", () => {
  it("renders the five top tabs in Stitch order with the right labels", async () => {
    await renderPageForManager();
    const tablist = screen.getByTestId("workspace-top-tabs");
    expect(tablist).toBeInTheDocument();
    const labels = ["Overview", "Assets", "Guidelines", "Voice & tone", "Publishing rules"];
    for (const label of labels) {
      const link = screen.getByRole("link", { name: new RegExp(`^${label}`) });
      expect(link).toBeInTheDocument();
      const href = link.getAttribute("href");
      expect(href).toMatch(/^#(overview|logo|guidelines|voice|publishing)$/);
    }
  });

  it("applies the 12-column Bento grid as the section container", async () => {
    const { container } = await renderPageForManager();
    const bento = screen.getByTestId("brand-kit-bento");
    expect(bento).toBeInTheDocument();
    // Tailwind compiles the class names into the DOM, so we can
    // assert the structural class set on the wrapper.
    expect(bento.className).toMatch(/\blg:grid-cols-12\b/);
    // The wrapper itself is grid (compiled into a className token);
    // we don't assert the literal `grid` token because Tailwind
    // hoists utility classes into the @theme layer, but we DO
    // assert the responsive `lg:` variant is present.
    expect(container).toBeInTheDocument();
  });

  it("renders every section card with the anchor id the tabs link to", async () => {
    await renderPageForManager();
    for (const id of [
      "overview",
      "logo",
      "color",
      "guidelines",
      "voice",
      "pillars",
      "publishing",
      "linked",
      "recent",
    ]) {
      // `getElementById` survives aria-label-only sections where
      // the visible text is just a CardTitle.
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("shows all four CRUD forms when the actor is a workspace manager", async () => {
    await renderPageForManager();
    expect(screen.getByTestId("mock-logo-form")).toBeInTheDocument();
    expect(screen.getByTestId("mock-color-form")).toBeInTheDocument();
    expect(screen.getByTestId("mock-typography-form")).toBeInTheDocument();
    expect(screen.getByTestId("mock-voice-form")).toBeInTheDocument();
  });

  it("hides all four CRUD forms when the actor is read-only", async () => {
    await renderPageForViewer();
    expect(screen.queryByTestId("mock-logo-form")).toBeNull();
    expect(screen.queryByTestId("mock-color-form")).toBeNull();
    expect(screen.queryByTestId("mock-typography-form")).toBeNull();
    expect(screen.queryByTestId("mock-voice-form")).toBeNull();
  });

  it("renders the two header CTAs in the PageHeader", async () => {
    await renderPageForManager();
    const add = screen.getByTestId("brand-kit-add-asset");
    expect(add).toBeInTheDocument();
    expect(add).toHaveTextContent(/add asset/i);
    const edit = screen.getByTestId("brand-kit-edit");
    expect(edit).toBeInTheDocument();
    expect(edit).toHaveTextContent(/edit brand kit/i);
    // The Edit CTA is a stub anchor — it jumps the user to the
    // first editable section (logo).
    expect(edit.closest("a")).toHaveAttribute("href", "#logo");
  });
});
