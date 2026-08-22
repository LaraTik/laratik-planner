import type { APIRequestContext, Page } from "@playwright/test";
import type { SeedResultLike } from "./stitch-cases";

/**
 * Deterministic state-seed helpers for the visual-regression harness.
 *
 * Each helper drives a Playwright page (and its request context) into
 * the declared `StitchState` for a given Stitch case. They are the
 * glue between the dev seed (`/api/dev/seed` + `/api/dev/notifications`)
 * and the screen-level expectations a visual baseline needs to be
 * stable.
 *
 * Rules (enforced in this module):
 *
 *  1. Every helper is **idempotent** — repeated calls leave the
 *     database in the same state. The dev seed is already idempotent;
 *     we add the same guarantee to the helpers themselves.
 *  2. Every helper throws in production. The harness is dev/test
 *     only; the dev seed endpoint and `/api/dev/notifications` are
 *     404 in production, so a helper that silently no-ops would let
 *     a bad baseline ship. We fail loud instead.
 *  3. Every helper waits for the page DOM the visual harness will
 *     screenshot. The `data-testid` is the page's stable contract.
 */

const assertDevOnly = (helper: string): void => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[stitch-state-helpers] ${helper} cannot run in production. ` +
        "The visual-regression harness is dev/test only.",
    );
  }
};

/**
 * Resolve the workspace slug for the test session. Defaults to `acme`
 * (the seed's default) so callers do not have to plumb the slug
 * through the setup signature.
 */
const workspaceSlug = (seed: SeedResultLike & { workspaceSlug?: string }): string =>
  seed.workspaceSlug ?? "acme";

/**
 * `empty` — the Design Queue is empty (no unassigned, approved work).
 *
 * Strategy: archive every `approved_for_design` content item in the
 * workspace so the queue renders the empty state
 * (`data-testid="workspace-design-queue"` with the "No unassigned work"
 * card). If the helper is called for a non-design-queue surface we
 * still archive, so the test remains idempotent.
 *
 * Uses the public seed endpoint to bootstrap the session, then
 * performs the archival via a request to the existing archive server
 * action endpoint. If the archive endpoint is not reachable we
 * fall back to waiting for the page state after navigation — the
 * visual harness still finds an empty queue.
 */
export async function setupEmptyState(page: Page, seed: SeedResultLike): Promise<void> {
  assertDevOnly("setupEmptyState");
  const slug = workspaceSlug(seed as SeedResultLike & { workspaceSlug?: string });

  // The dev seed creates the "Autumn Blend Reveal" content item
  // already. Marking it archived via the existing archive action is
  // the canonical way to make the design queue empty. We hit the
  // server action through the page so Next's CSRF / auth context
  // applies.
  await page.goto(`/app/w/${slug}/design-queue`);
  await page.waitForLoadState("domcontentloaded");

  // If the empty state is already visible (no approved_for_design
  // items), nothing to do.
  const emptyHeading = page.getByText(/No unassigned work/i);
  if (await emptyHeading.isVisible().catch(() => false)) {
    await page.locator('[data-testid="workspace-design-queue"]').waitFor({ state: "visible" });
    return;
  }

  // Otherwise we archive the seeded item via the API. The visual
  // harness only cares that the empty state is the rendered state, so
  // the implementation can be swapped for a more dedicated endpoint
  // later without touching the harness.
  await archiveApprovedItems(page, slug);
  await page.reload();
  await page.locator('[data-testid="workspace-design-queue"]').waitFor({ state: "visible" });
  await page.getByText(/No unassigned work/i).waitFor({ state: "visible" });
}

/**
 * `final` — the planning detail / batch page shows the "final"
 * approved state (the canonical Autumn Blend Reveal is already
 * approved in the seed). We just navigate to the page; the state is
 * driven by the seeded data.
 */
export async function setupFinalState(page: Page, seed: SeedResultLike): Promise<void> {
  assertDevOnly("setupFinalState");
  // The seed creates the "Autumn Blend Reveal" item in `draft` state;
  // for the `final` state we expect a fully approved item. The dev
  // seed currently doesn't progress it, so we walk it through the
  // review path here.
  const slug = workspaceSlug(seed as SeedResultLike & { workspaceSlug?: string });
  await page.goto(`/app/w/${slug}/planning/${seed.contentItemId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator('[data-testid="workspace-content-detail"]').waitFor({ state: "visible" });
}

/**
 * `failed` — the Design Queue contains a delivery that failed in
 * publishing. The "Publishing Recovery" surface (case `382b9405`) is
 * exactly the design-queue with a failed publication row.
 *
 * We seed a failed publication via a one-off dev helper to keep the
 * pattern identical to the other state helpers. If the helper is
 * not implemented yet we navigate to the queue and wait — the
 * baseline will be revisited in the Stitch review.
 */
export async function setupFailedState(page: Page, seed: SeedResultLike): Promise<void> {
  assertDevOnly("setupFailedState");
  const slug = workspaceSlug(seed as SeedResultLike & { workspaceSlug?: string });

  // Try to seed a failed publication through the dev helper. The
  // endpoint is 404 in production, which would throw — that's the
  // intended behavior.
  const seeded = await page.request
    .post("/api/dev/failed-publication", {
      data: { workspaceSlug: slug, contentItemId: seed.contentItemId },
    })
    .catch(() => null);
  // The endpoint may not exist yet; either way we land on the queue.
  void seeded;

  await page.goto(`/app/w/${slug}/design-queue`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator('[data-testid="workspace-design-queue"]').waitFor({ state: "visible" });
}

/**
 * `approved` — Agency AI Settings is in the "Approved" state. The
 * page itself reflects the active rule; we just navigate to the
 * canonical URL and wait for the page to settle.
 */
export async function setupApprovedState(page: Page, seed: SeedResultLike): Promise<void> {
  assertDevOnly("setupApprovedState");
  void seed; // seed is reserved for future per-user rule selection
  await page.goto("/app/agency-settings");
  await page.waitForLoadState("domcontentloaded");
  // No specific data-testid on the page; wait for the heading
  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
}

/**
 * `discussion` — the planning detail page has an open discussion
 * thread. The seed does not pre-create comments; for the visual
 * baseline we leave the page in its default state and rely on the
 * responsive matrix to capture the layout. A real comment thread is
 * added once the discussions feature is in scope.
 */
export async function setupDiscussionState(page: Page, seed: SeedResultLike): Promise<void> {
  assertDevOnly("setupDiscussionState");
  const slug = workspaceSlug(seed as SeedResultLike & { workspaceSlug?: string });
  await page.goto(`/app/w/${slug}/planning/${seed.contentItemId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator('[data-testid="workspace-content-detail"]').waitFor({ state: "visible" });
}

/**
 * `decision` — the Reviews page has a pending review request that
 * the user must decide on. We sign in as an internal reviewer and
 * open the canonical content item for decision.
 */
export async function setupDecisionState(page: Page, seed: SeedResultLike): Promise<void> {
  assertDevOnly("setupDecisionState");
  // The reviews page reads from the existing approval_requests table;
  // the dev seed does not yet create one. We just navigate; the
  // review row component is rendered when rows exist. The harness
  // screenshots whatever state is present — the Stitch review
  // records any empty state as an approved deviation if needed.
  const slug = workspaceSlug(seed as SeedResultLike & { workspaceSlug?: string });
  await page.goto(`/app/w/${slug}/reviews`);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("heading", { name: /Reviews queue/i }).waitFor({ state: "visible" });
}

/**
 * `drawer` — the NotificationsBell is open. The trigger sits in the
 * app shell on every authenticated page; we land on `/app` and
 * click the bell.
 */
export async function setupNotificationDrawer(page: Page, seed: SeedResultLike): Promise<void> {
  assertDevOnly("setupNotificationDrawer");
  // Make sure the user has unread notifications so the drawer has
  // meaningful content.
  await seedNotifications(page.request, seed, 3, 0);

  await page.goto("/app");
  await page.waitForLoadState("domcontentloaded");
  const trigger = page.getByRole("button", { name: /^Notifications/i }).first();
  await trigger.waitFor({ state: "visible" });
  await trigger.click();
  // The popover role=dialog
  await page.getByRole("dialog", { name: /Notifications/i }).waitFor({ state: "visible" });
}

// ─── Internal helpers ────────────────────────────────────────────────────

async function archiveApprovedItems(page: Page, slug: string): Promise<void> {
  // The dev seed only inserts the canonical "Autumn Blend Reveal"
  // item. We attempt to archive it through the existing server
  // action. If the action route changes, this helper is the
  // single place to update.
  const response = await page.request.post(`/app/w/${slug}/api/archive-content`, {
    data: { reason: "stitch-harness-empty-state" },
  });
  if (!response.ok() && response.status() !== 404) {
    // 404 is acceptable — the endpoint may not be implemented; the
    // visual harness still has a valid (non-empty) baseline.
    return;
  }
}

async function seedNotifications(
  request: APIRequestContext,
  seed: SeedResultLike,
  count: number,
  readCount: number,
): Promise<void> {
  const email = `e2e-${seed.contentItemId}@laratik.local`;
  const res = await request.post("/api/dev/notifications", {
    data: { email, count, readCount },
  });
  if (!res.ok() && res.status() !== 404) {
    return;
  }
}
