import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  NotificationItem,
  type NotificationListItem,
} from "@/components/app-shell/notification-item";

const baseItem: NotificationListItem = {
  id: "n-1",
  kind: "review_request",
  title: "Review needed: Q3 launch",
  body: "Requested by Ada",
  actionUrl: "/app/w/acme/planning/abc-123",
  readAt: null,
  createdAt: "2026-08-21T10:00:00.000Z",
};

function renderItem(
  overrides: Partial<NotificationListItem> = {},
  onMarkRead = vi.fn(),
  onActionClick = vi.fn(),
) {
  return render(
    <ul>
      <NotificationItem
        item={{ ...baseItem, ...overrides }}
        onMarkRead={onMarkRead}
        onActionClick={onActionClick}
      />
    </ul>,
  );
}

describe("NotificationItem", () => {
  it("renders the title and the body", () => {
    renderItem();
    expect(screen.getByText("Review needed: Q3 launch")).toBeInTheDocument();
    expect(screen.getByText("Requested by Ada")).toBeInTheDocument();
  });

  it("renders the createdAt as a localised date string", () => {
    renderItem();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("renders the action link when actionUrl is provided", () => {
    renderItem();
    const link = screen.getByRole("link", { name: /open/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning/abc-123");
  });

  it("hides the action link when actionUrl is null", () => {
    renderItem({ actionUrl: null });
    expect(screen.queryByRole("link", { name: /open/i })).toBeNull();
  });

  it("highlights the row when the notification is unread", () => {
    const { container } = renderItem({ readAt: null });
    const li = container.querySelector("li");
    expect(li?.className).toContain("bg-primary-subtle/20");
  });

  it("does NOT highlight the row when the notification is already read", () => {
    const { container } = renderItem({ readAt: "2026-08-21T11:00:00.000Z" });
    const li = container.querySelector("li");
    expect(li?.className).not.toContain("bg-primary-subtle/20");
  });

  it("shows the 'Mark as read' button when the notification is unread", () => {
    renderItem({ readAt: null });
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeInTheDocument();
  });

  it("hides the 'Mark as read' button when the notification is already read", () => {
    renderItem({ readAt: "2026-08-21T11:00:00.000Z" });
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
  });

  it("calls onMarkRead with the item id when 'Mark as read' is clicked", async () => {
    const onMarkRead = vi.fn();
    renderItem({ id: "abc", readAt: null }, onMarkRead);
    await userEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onMarkRead).toHaveBeenCalledWith("abc");
  });

  it("calls onMarkRead and onActionClick when the 'Open' link is clicked on an unread item", async () => {
    const onMarkRead = vi.fn();
    const onActionClick = vi.fn();
    renderItem({ readAt: null }, onMarkRead, onActionClick);
    await userEvent.click(screen.getByRole("link", { name: /open/i }));
    expect(onMarkRead).toHaveBeenCalledWith("n-1");
    expect(onActionClick).toHaveBeenCalledWith("n-1");
  });

  it("does NOT call onMarkRead when the 'Open' link is clicked on a read item", async () => {
    const onMarkRead = vi.fn();
    const onActionClick = vi.fn();
    renderItem({ readAt: "2026-08-21T11:00:00.000Z" }, onMarkRead, onActionClick);
    await userEvent.click(screen.getByRole("link", { name: /open/i }));
    expect(onMarkRead).not.toHaveBeenCalled();
    expect(onActionClick).toHaveBeenCalledWith("n-1");
  });

  it("works without an onActionClick handler", () => {
    // Suppress the noop default so the click doesn't throw.
    const onMarkRead = vi.fn();
    render(
      <ul>
        <NotificationItem item={baseItem} onMarkRead={onMarkRead} />
      </ul>,
    );
    // Smoke test: no throw, link still rendered.
    expect(screen.getByRole("link", { name: /open/i })).toBeInTheDocument();
  });
});
