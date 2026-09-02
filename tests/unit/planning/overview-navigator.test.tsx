import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { OverviewNavigator } from "@/components/planning/overview-navigator";
import type { OverviewReadinessLine } from "@/components/planning/overview-command-center";
import { tFor } from "@/messages";

const t = tFor("en");

/**
 * OverviewNavigator — client wrapper that wires the readiness
 * row click to URL-hash + scroll + focus. The wrapper exists
 * because the planning detail page is a Server Component and
 * the scroll behaviour needs DOM access.
 *
 * Phase 1 of the planning-workspace-v2 refactor (2026-08-30).
 *
 * The contract these tests pin:
 *   1. Clicking a readiness row with a destination updates
 *      the URL hash (so deep-links and the back/forward
 *      buttons keep working).
 *   2. A `hashchange` event is dispatched so the
 *      `WorkspaceShell` listener can switch the active tab.
 *   3. The target sub-anchor is scrolled into view (the
 *      browser default + our explicit `scrollIntoView` call).
 *   4. Keyboard focus moves to the first interactive child
 *      of the target section.
 */

const baseProps = {
  workspaceSlug: "acme",
  contentItemId: "ci-1",
  contentStatus: "draft",
  title: "Happy Hour 2",
  brief: "Summer teaser",
  format: "static_post",
  plannedPublishAt: "2026-09-01 09:00",
  workspaceTimezone: "Europe/Berlin",
  channels: [{ id: "ch-1", platform: "instagram", accountName: "Acme Main", configured: true }],
  ownerName: "Ada Lovelace",
  readinessBlockers: 1,
  readinessCanPublish: false,
  deliveryCount: 0,
  finalApprovedCount: 0,
  recentActivity: [],
  totalActivityCount: 0,
  canEdit: true,
  editHref: "/app/w/acme/planning/edit/ci-1",
  t,
};

function buildReadinessLines(): OverviewReadinessLine[] {
  return [
    {
      id: "content",
      label: "Content",
      status: "warning",
      detail: "Brief is empty",
      href: "#content",
    },
    {
      id: "assets-versions",
      label: "Assets & versions",
      status: "danger",
      detail: "No design versions yet",
      href: "#assets-versions",
    },
    {
      id: "publishing",
      label: "Publishing",
      status: "ready",
      detail: "Channels configured",
      href: "#publishing",
    },
  ];
}

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView, so we stub it to
  // assert the call without touching the layout.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OverviewNavigator", () => {
  it("updates the URL hash and dispatches hashchange when a readiness row is clicked", () => {
    render(<OverviewNavigator {...baseProps} readiness={buildReadinessLines()} />);
    const hashListener = vi.fn();
    window.addEventListener("hashchange", hashListener);

    fireEvent.click(screen.getByTestId("overview-readiness-link-publishing"));
    expect(window.location.hash).toBe("#publishing");
    expect(hashListener).toHaveBeenCalled();
    window.removeEventListener("hashchange", hashListener);
  });

  it("scrolls the target sub-anchor into view on click", async () => {
    // Mount a target anchor next to the navigator so
    // `document.getElementById("publishing")` resolves.
    render(
      <div>
        <OverviewNavigator {...baseProps} readiness={buildReadinessLines()} />
        <section id="publishing" data-testid="target-section">
          <input data-testid="target-input" type="text" />
        </section>
      </div>,
    );
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView");
    fireEvent.click(screen.getByTestId("overview-readiness-link-publishing"));
    // The scroll is deferred to a requestAnimationFrame + setTimeout(50).
    // waitFor keeps the asynchronous React update inside act().
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
  });

  it("moves keyboard focus to the first interactive child of the target section", async () => {
    render(
      <div>
        <OverviewNavigator {...baseProps} readiness={buildReadinessLines()} />
        <section id="content" data-testid="target-section">
          <input data-testid="content-first-input" type="text" />
        </section>
      </div>,
    );
    fireEvent.click(screen.getByTestId("overview-readiness-link-content"));
    const input = screen.getByTestId("content-first-input") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("falls back to the section itself when the target has no interactive child", async () => {
    render(
      <div>
        <OverviewNavigator {...baseProps} readiness={buildReadinessLines()} />
        <section id="publishing" tabIndex={-1} data-testid="target-section">
          <p>Just text, no inputs.</p>
        </section>
      </div>,
    );
    fireEvent.click(screen.getByTestId("overview-readiness-link-publishing"));
    const section = screen.getByTestId("target-section");
    await waitFor(() => expect(document.activeElement).toBe(section));
  });
});
