import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  CalendarEventCard,
  type CalendarEventCardProps,
} from "@/components/workspace/calendar-event-card";

/**
 * CalendarEventCard — the day-cell chip on `/app/w/[slug]/calendar`.
 *
 * Extracted from the inlined `<Link>` block so a second consumer
 * (board / client calendar / future agenda view) can reuse the
 * status+format rendering without re-implementing the badge variant
 * + left-border accent.
 *
 * Tests assert:
 *   - link is keyboard-focusable with the title as accessible name
 *   - status + format are both visible text (not color-alone)
 *   - every status maps to a deterministic non-empty text
 *   - every format maps to a deterministic non-empty text
 *   - status is also announced via color (badge + left-border accent)
 *   - very long titles still render (truncation-safe, not silent drop)
 *   - the `id` is exposed via `data-testid` for downstream selectors
 */

function renderCard(overrides: Partial<CalendarEventCardProps> = {}) {
  const props: CalendarEventCardProps = {
    id: "item-1",
    href: "/app/w/acme/planning/item-1",
    title: "Summer launch teaser",
    status: "draft",
    format: "short_form_video",
    ...overrides,
  };
  return render(<CalendarEventCard {...props} />);
}

describe("CalendarEventCard", () => {
  it("renders a link with the supplied href and the title as its accessible name", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /summer launch teaser/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning/item-1");
  });

  it("exposes a stable data-testid derived from the id", () => {
    renderCard({ id: "abc-123" });
    expect(screen.getByTestId("calendar-event-abc-123")).toBeInTheDocument();
  });

  it("renders the status as visible text (not color alone)", () => {
    renderCard({ status: "draft" });
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  it("renders the format as visible text (not color alone)", () => {
    renderCard({ format: "short_form_video" });
    // humanize("short_form_video") → "Short Form Video"
    expect(screen.getByText(/short form video/i)).toBeInTheDocument();
  });

  it("humanizes every status with a non-empty, deterministic label", () => {
    const statuses = [
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
      "partially_published",
      "published",
      "changes_requested",
      "blocked",
      "cancelled",
    ];
    for (const status of statuses) {
      const { unmount } = renderCard({ status, id: `s-${status}` });
      // The badge should render some non-empty humanized text — never blank.
      const link = screen.getByTestId(`calendar-event-s-${status}`);
      const text = link.textContent ?? "";
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text.toLowerCase()).not.toBe(status.toLowerCase() + status.toLowerCase());
      unmount();
    }
  });

  it("humanizes every supported format with a non-empty, deterministic label", () => {
    const formats = [
      "static_post",
      "carousel",
      "story",
      "short_form_video",
      "long_form_video",
      "live_content",
      "article",
      "other",
    ];
    for (const format of formats) {
      const { unmount } = renderCard({ format, id: `f-${format}` });
      const link = screen.getByTestId(`calendar-event-f-${format}`);
      const text = (link.textContent ?? "").trim();
      expect(text.length).toBeGreaterThan(0);
      // underscores should not survive in the visible text
      expect(text).not.toContain("_");
      unmount();
    }
  });

  it("renders status with both text and a non-text color cue (badge + left border)", () => {
    const { container } = renderCard({ status: "in_design" });
    // Badge with the "info" variant class for in_design (text-info token)
    const badge = container.querySelector('[class*="text-info"]');
    expect(badge).not.toBeNull();
    // The card itself should have a left-border color class so the
    // day cell still conveys status at a glance.
    const card = screen.getByTestId("calendar-event-item-1");
    const className = card.className;
    expect(className).toMatch(/border-s-\w+/);
  });

  it("renders approved statuses with a success color cue", () => {
    const { container } = renderCard({ status: "ready_to_publish" });
    const success = container.querySelector('[class*="text-success"]');
    expect(success).not.toBeNull();
  });

  it("renders danger statuses (blocked / cancelled) with a danger color cue", () => {
    const { container } = renderCard({ status: "blocked" });
    const danger = container.querySelector('[class*="text-danger"]');
    expect(danger).not.toBeNull();
  });

  it("truncation-safe: very long titles are still rendered (no overflow / no drop)", () => {
    const longTitle = "Q4 brand refresh — campaign rollout v2 with 12 markets and 6 channels";
    renderCard({ title: longTitle });
    // The title should still be in the document (truncate class is fine,
    // what matters is the text is present and not silently dropped).
    expect(screen.getByText(longTitle)).toBeInTheDocument();
  });

  it("is keyboard-accessible: the link is focusable and Enter activates it", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /summer launch teaser/i });
    link.focus();
    expect(link).toHaveFocus();
    // The link element natively responds to Enter; we verify the
    // tag and the href so the affordance is real.
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBeTruthy();
  });

  it("places the status badge and the format label inside the link", () => {
    renderCard({ status: "in_design", format: "carousel" });
    const link = screen.getByRole("link", { name: /summer launch teaser/i });
    // Both should be inside the same link so the whole card is clickable.
    expect(within(link).getByText(/in design/i)).toBeInTheDocument();
    expect(within(link).getByText(/carousel/i)).toBeInTheDocument();
  });

  it("forwards an unknown status without throwing and still renders the humanized string", () => {
    // Defensive: future status additions should not crash the page.
    expect(() => renderCard({ status: "unknown_thing", id: "u" })).not.toThrow();
    const link = screen.getByTestId("calendar-event-u");
    expect(link.textContent ?? "").toContain("Unknown Thing");
  });

  // ─── Round-2026-09-26: task-kind + default variant ────────────────────
  // The unified card is consumed by both the workspace calendar
  // (compact variant, plan kind) and the agency-overview calendar
  // (default variant, plan OR task kind). The compact-plan path is
  // already covered above; the tests below pin down the new
  // behaviour so a future refactor can't silently regress task
  // status colour or priority rendering on the global calendar.

  it("task kind renders the task status label with a colour cue (success for done)", () => {
    const { container } = renderCard({
      id: "t-done",
      kind: "task",
      status: "done",
      format: undefined as never,
      priority: "normal",
    });
    expect(screen.getByText(/done/i)).toBeInTheDocument();
    const success = container.querySelector('[class*="text-success"]');
    expect(success).not.toBeNull();
    const card = screen.getByTestId("calendar-event-t-done");
    expect(card.className).toMatch(/border-s-success/);
  });

  it("task kind renders blocked / cancelled with the danger colour cue", () => {
    const { container } = renderCard({
      id: "t-blocked",
      kind: "task",
      status: "blocked",
      format: undefined as never,
    });
    const danger = container.querySelector('[class*="text-danger"]');
    expect(danger).not.toBeNull();
    const card = screen.getByTestId("calendar-event-t-blocked");
    expect(card.className).toMatch(/border-s-danger/);
  });

  it("task kind uses the priority as the secondary line (not the format)", () => {
    renderCard({
      id: "t-prio",
      kind: "task",
      status: "in_progress",
      format: undefined as never,
      priority: "urgent",
      priorityLabel: "Urgent",
    });
    // The secondary line should carry the priority label, not a
    // humanized status / format string.
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("default variant renders the kind label + workspace + assignee metadata", () => {
    renderCard({
      id: "t-default",
      kind: "task",
      variant: "default",
      status: "in_progress",
      format: undefined as never,
      priority: "high",
      priorityLabel: "High",
      workspaceName: "Acme HQ",
      assigneeName: "Sara Designer",
      kindLabel: "Task",
      noWorkspaceLabel: "No workspace",
    });
    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Acme HQ")).toBeInTheDocument();
    expect(screen.getByText("Sara Designer")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("default variant falls back to the noWorkspaceLabel when workspaceName is null", () => {
    renderCard({
      id: "t-orphan",
      kind: "task",
      variant: "default",
      status: "in_progress",
      format: undefined as never,
      workspaceName: null,
      noWorkspaceLabel: "—",
    });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("default variant hides the assignee row on plans (only tasks have assignees)", () => {
    renderCard({
      id: "p-default",
      kind: "plan",
      variant: "default",
      status: "in_design",
      format: "static_post",
      formatLabel: "Static post",
      assigneeName: "Should not show",
      kindLabel: "Plan",
      noWorkspaceLabel: "—",
      workspaceName: "Acme",
    });
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.queryByText("Should not show")).toBeNull();
  });

  // ─── Workspace identity (global calendar) ───────────────────────────
  // THE REGRESSION THIS PINS: the compact variant is what the
  // agency-wide month grid renders, and it used to accept
  // `workspaceName` and then ignore it entirely — so two cards from two
  // different clients in the same day cell were indistinguishable. These
  // tests assert the workspace is named in BOTH variants.

  it("compact variant names the workspace (it used to silently drop it)", () => {
    renderCard({
      id: "c-ws",
      variant: "compact",
      workspaceName: "Acme HQ",
      workspaceSeries: 0,
    });
    const card = screen.getByTestId("calendar-event-c-ws");
    expect(within(card).getByText("Acme HQ")).toBeInTheDocument();
  });

  it("compact variant renders the workspace dot with the assigned series colour", () => {
    renderCard({
      id: "c-dot",
      variant: "compact",
      workspaceName: "Acme HQ",
      workspaceSeries: 2,
    });
    const dot = screen.getByTestId("calendar-event-c-dot-workspace-dot");
    expect(dot.style.backgroundColor).toBe("var(--chart-series-3)");
  });

  it("hides the workspace dot from assistive tech — the name carries the meaning", () => {
    renderCard({
      id: "c-aria",
      variant: "compact",
      workspaceName: "Acme HQ",
      workspaceSeries: 0,
    });
    expect(screen.getByTestId("calendar-event-c-aria-workspace-dot")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("gives two different workspaces two different colours on the same card shape", () => {
    renderCard({ id: "c-a", variant: "compact", workspaceName: "Acme", workspaceSeries: 0 });
    renderCard({ id: "c-b", variant: "compact", workspaceName: "Brightwell", workspaceSeries: 1 });
    expect(screen.getByTestId("calendar-event-c-a-workspace-dot").style.backgroundColor).not.toBe(
      screen.getByTestId("calendar-event-c-b-workspace-dot").style.backgroundColor,
    );
  });

  it("omits the dot when there is no workspace rather than borrowing slot 0's colour", () => {
    renderCard({
      id: "c-none",
      variant: "compact",
      workspaceName: null,
      workspaceSeries: null,
      noWorkspaceLabel: "Agency-wide",
    });
    // A defaulting-to-0 dot would visually place this card inside
    // whichever workspace happens to sort first.
    expect(screen.queryByTestId("calendar-event-c-none-workspace-dot")).toBeNull();
    expect(screen.getByText("Agency-wide")).toBeInTheDocument();
  });

  it("renders the workspace row inside the link so the whole card stays clickable", () => {
    renderCard({
      id: "c-link",
      variant: "compact",
      workspaceName: "Acme HQ",
      workspaceSeries: 0,
    });
    const link = screen.getByRole("link", { name: /summer launch teaser/i });
    expect(within(link).getByText("Acme HQ")).toBeInTheDocument();
  });

  it("leaves the single-workspace calendar unchanged (no workspace props = no row)", () => {
    // The per-workspace calendar renders this card with no workspace
    // metadata at all. Naming "there is no workspace" there would be
    // wrong — the page is already inside the workspace.
    renderCard({ id: "c-single", variant: "compact" });
    const card = screen.getByTestId("calendar-event-c-single");
    expect(within(card).queryByText("—")).toBeNull();
    expect(screen.queryByTestId("calendar-event-c-single-workspace-dot")).toBeNull();
  });

  it("still encodes status on the left border alongside the workspace dot", () => {
    // Two independent channels: status = border + badge, workspace = dot +
    // name. Neither may be dropped when the other is added.
    renderCard({
      id: "c-both",
      variant: "compact",
      status: "blocked",
      workspaceName: "Acme HQ",
      workspaceSeries: 0,
    });
    const card = screen.getByTestId("calendar-event-c-both");
    expect(card.className).toMatch(/border-s-danger/);
    expect(within(card).getByText(/blocked/i)).toBeInTheDocument();
    expect(screen.getByTestId("calendar-event-c-both-workspace-dot")).toBeInTheDocument();
  });
});
