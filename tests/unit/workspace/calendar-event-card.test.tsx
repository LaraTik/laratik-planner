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
    expect(className).toMatch(/border-l-\w+/);
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
});
