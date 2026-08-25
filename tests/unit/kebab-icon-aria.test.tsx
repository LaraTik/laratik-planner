import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChannelRowActions } from "@/app/(app)/app/w/[slug]/channels/channel-edit-drawer";

/**
 * UX-09 (GAP-FULL-REVIEW-2026-08-25) — the kebab button on the
 * channels row used to render `<MoreHorizontal className="h-4 w-4" />`
 * with no `aria-hidden`. The trigger already carried an
 * `aria-label`, so a screen reader heard "Open actions for @brand-main"
 * followed by the SVG's accessible name (often "more-horizontal" or
 * "kebab"). The dropdown also needed a `role="menu"` and
 * `aria-orientation` for screen-reader navigation — Radix wires both
 * of those for free, so the only piece missing was the icon-hidden
 * treatment.
 *
 * These tests pin:
 *   - the MoreHorizontal icon is hidden from assistive tech
 *   - the trigger has the descriptive aria-label
 *   - the dropdown content carries the menu role
 *   - the menu items carry the menuitem role
 *   - keyboard focus moves into the menu when it opens (Radix
 *     primitive handles this and the test verifies the first item is
 *     focused)
 */

vi.mock("@/app/(app)/app/w/[slug]/channels/actions", () => ({
  archiveChannelAction: vi.fn(async () => ({})),
  testChannelConnectionAction: vi.fn(async () => ({})),
  updateChannelAction: vi.fn(async () => ({})),
}));

const channel = {
  id: "11111111-1111-4111-8111-111111111111",
  accountName: "@brand-main",
  platform: "instagram" as const,
  handle: "brandmain",
  url: "https://instagram.com/brandmain",
  accountType: "business",
  isActive: true,
  socialConnectionId: null,
  lastSyncedAt: null,
  lastSyncErrorCode: null,
  lastSyncErrorAt: null,
  connectionStatus: "manual" as const,
};

describe("channels row actions kebab (UX-09)", () => {
  it("hides the MoreHorizontal icon from assistive tech", () => {
    render(<ChannelRowActions slug="acme" channel={channel} />);
    const trigger = screen.getByTestId(`channel-row-actions-${channel.id}`);
    // The trigger button contains exactly one SVG (the MoreHorizontal
    // icon). We assert the SVG carries aria-hidden so screen readers
    // do not announce its generic name on top of the trigger's
    // descriptive aria-label.
    const triggerSvgs = trigger.querySelectorAll("svg");
    expect(triggerSvgs).toHaveLength(1);
    expect(triggerSvgs[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("uses a descriptive aria-label on the kebab trigger", () => {
    render(<ChannelRowActions slug="acme" channel={channel} />);
    const trigger = screen.getByTestId(`channel-row-actions-${channel.id}`);
    expect(trigger).toHaveAttribute("aria-label", "Open actions for @brand-main");
  });

  it("opens the dropdown with role=menu and orient=vertical", async () => {
    const user = userEvent.setup();
    render(<ChannelRowActions slug="acme" channel={channel} />);
    await user.click(screen.getByTestId(`channel-row-actions-${channel.id}`));
    // Radix wires role="menu" + aria-orientation="vertical" by default.
    // We assert the role is present so a future refactor that swaps
    // Radix for a custom Popover (UX-03 lesson) cannot silently
    // regress the menu semantics.
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveAttribute("aria-orientation", "vertical");
  });

  it("renders the dropdown items with role=menuitem", async () => {
    const user = userEvent.setup();
    render(<ChannelRowActions slug="acme" channel={channel} />);
    await user.click(screen.getByTestId(`channel-row-actions-${channel.id}`));
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]).toHaveTextContent(/Edit/);
    expect(items[1]).toHaveTextContent(/Archive/);
  });

  it("moves keyboard focus into the menu when it opens", async () => {
    const user = userEvent.setup();
    render(<ChannelRowActions slug="acme" channel={channel} />);
    const trigger = screen.getByTestId(`channel-row-actions-${channel.id}`);
    await user.click(trigger);
    // After open, Radix focuses the menu content (not the first item
    // — items are reachable by Arrow keys). We assert the menu
    // container is the active element so the user does not have to
    // Tab again to start navigating.
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(menu).toBe(document.activeElement));
    // Trigger loses focus — it is the same trigger we clicked but the
    // focus is now on the menu. We assert the trigger is no longer
    // active so the user can immediately Arrow-key through items.
    expect(trigger).not.toBe(document.activeElement);
  });

  it("hides the MoreHorizontal icon in the read-only channels row too", () => {
    // The channels page renders a non-interactive MoreHorizontal for
    // rows the current user cannot manage. The wrapping <span> already
    // carries aria-hidden, so the inner icon is double-hidden. We
    // assert the icon itself also carries the attribute so the
    // pattern is consistent across the table. We don't render the
    // channels page (server component) here; instead we assert the
    // source file has the attribute on the inner icon line.
    const source = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "app", "w", "[slug]", "channels", "page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/<MoreHorizontal[^>]*aria-hidden="true"/);
  });
});
