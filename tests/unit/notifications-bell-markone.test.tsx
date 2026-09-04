import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * R11.7 — pin the bell's optimistic `markOne` behaviour. The
 * pre-R1 implementation mutated a closure variable inside the
 * `setItems` updater, which is a React anti-pattern (updaters can
 * run more than once in strict mode and during transitions).
 * The R1 fix pre-computes `wasUnread` from the latest `items`
 * snapshot before the updater fires. This test pins the
 * observable behaviour: clicking the mark-read icon decrements
 * the badge by exactly 1.
 */

const markReadActionMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/app/(app)/actions", () => ({
  markReadAction: markReadActionMock,
  markAllReadAction: vi.fn(async () => ({ ok: true })),
}));

const useRouterMock = vi.fn(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: useRouterMock,
  usePathname: vi.fn(() => "/app"),
}));

vi.mock("@/components/i18n/locale-provider", () => ({
  useLocaleCode: vi.fn(() => "en"),
  useLocaleT: vi.fn(() => (key: string) => {
    if (key === "notifications.markRead") return "Mark as read";
    if (key === "notifications.open") return "Open";
    if (key === "notifications.title") return "Notifications";
    if (key === "notifications.markAllRead") return "Mark all as read";
    if (key === "notifications.empty") return "No notifications";
    return key;
  }),
}));

const { NotificationsBell } = await import("@/components/app-shell/notifications-bell");

beforeEach(() => {
  markReadActionMock.mockClear();
});

const initialUnread = (n: number) => {
  const now = new Date().toISOString();
  return [
    {
      id: "n-1",
      kind: "mention" as const,
      title: "First",
      body: "Body 1",
      actionUrl: null,
      readAt: null,
      createdAt: now,
    },
    {
      id: "n-2",
      kind: "mention" as const,
      title: "Second",
      body: "Body 2",
      actionUrl: null,
      readAt: null,
      createdAt: now,
    },
  ].slice(0, n);
};

const copy = {
  triggerAriaLabel: "Notifications",
  triggerAriaLabelUnread: "Notifications ({count} unread)",
  dialogAriaLabel: "Notifications",
  title: "Notifications",
  markAllRead: "Mark all as read",
  empty: "No notifications",
};

describe("NotificationsBell markOne — optimistic badge decrement", () => {
  it("decrements the badge by exactly 1 when a single mark-read is clicked", async () => {
    const user = userEvent.setup();
    render(<NotificationsBell initial={initialUnread(2)} initialUnread={2} copy={copy} />);

    // The trigger button shows the unread count.
    const trigger = screen.getByRole("button", { name: /2 unread/ });
    expect(trigger).toBeInTheDocument();

    // Open the popover.
    await user.click(trigger);

    // Two "Mark as read" buttons (one per notification) become
    // available. Click the first one.
    const markReadButtons = screen.getAllByRole("button", { name: /mark as read/i });
    expect(markReadButtons.length).toBe(2);
    await user.click(markReadButtons[0]!);

    // Wait for the optimistic state to settle: the trigger's
    // aria-label should now reflect 1 unread.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /1 unread/ })).toBeInTheDocument();
    });

    // markReadAction must have been called exactly once with the
    // matching id.
    expect(markReadActionMock).toHaveBeenCalledTimes(1);
    expect(markReadActionMock).toHaveBeenCalledWith({ ids: ["n-1"] });
  });

  it("never lets the badge go negative on a single mark-read click (regression for the old closure-mutation bug)", async () => {
    // The pre-R1 implementation could double-decrement under
    // certain render conditions. The test pins "1 click = 1
    // decrement". We start with unread = 1 and click the single
    // mark-read button; the badge must go to 0, not -1.
    const user = userEvent.setup();
    render(<NotificationsBell initial={initialUnread(1)} initialUnread={1} copy={copy} />);

    const trigger = screen.getByRole("button", { name: /1 unread/ });
    await user.click(trigger);

    const [markReadButton] = screen.getAllByRole("button", { name: /mark as read/i });
    expect(markReadButton).toBeDefined();
    await user.click(markReadButton!);

    await waitFor(() => {
      // "Notifications" (no unread suffix) appears when unread
      // is 0. The bell renders either the unread-aria-label or
      // the plain one — when unread=0, the plain one.
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    });

    expect(markReadActionMock).toHaveBeenCalledTimes(1);
  });
});
