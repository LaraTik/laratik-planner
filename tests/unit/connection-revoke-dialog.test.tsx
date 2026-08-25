import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionActions } from "@/app/(app)/app/w/[slug]/channels/connection-actions";

/**
 * UX-03 (GAP-FULL-REVIEW-2026-08-25) — the connection revoke
 * confirmation used to be hand-rolled: a div with role="dialog"
 * and a hand-managed focus trap, with no Escape-to-close or
 * backdrop dismissal. The page now uses the shared Radix-based
 * Dialog primitive, which gives us all of that for free.
 *
 * These tests pin the regression: the dialog must surface the
 * shared X button (provided by the primitive) and Escape must
 * close it without us writing any extra handler.
 */

vi.mock("@/app/(app)/app/w/[slug]/channels/actions", () => ({
  disconnectChannelAction: vi.fn(async () => ({})),
  revokeConnectionAction: vi.fn(async () => ({})),
}));

const channel = {
  id: "11111111-1111-4111-8111-111111111111",
  accountName: "@brand-main",
  platform: "instagram" as const,
  socialConnectionId: "22222222-2222-4222-8222-222222222222",
};
const otherChannels = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    accountName: "@brand-second",
    platform: "facebook" as const,
  },
];

describe("ConnectionActions revoke dialog", () => {
  it("opens into a Radix dialog with the X close button", async () => {
    const user = userEvent.setup();
    render(
      <ConnectionActions
        slug="acme"
        channel={channel}
        affectedChannels={[channel, ...otherChannels]}
      />,
    );
    await user.click(screen.getByTestId("revoke-button"));
    const dialog = await screen.findByTestId("revoke-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("lists every other channel that shares the connection", async () => {
    const user = userEvent.setup();
    render(
      <ConnectionActions
        slug="acme"
        channel={channel}
        affectedChannels={[channel, ...otherChannels]}
      />,
    );
    await user.click(screen.getByTestId("revoke-button"));
    const list = await screen.findByTestId("revoke-affected-list");
    expect(list).toHaveTextContent("@brand-second");
  });

  it("closes when Escape is pressed (Radix primitive handles it)", async () => {
    const user = userEvent.setup();
    render(
      <ConnectionActions
        slug="acme"
        channel={channel}
        affectedChannels={[channel, ...otherChannels]}
      />,
    );
    await user.click(screen.getByTestId("revoke-button"));
    expect(screen.getByTestId("revoke-dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("revoke-dialog")).toBeNull();
  });
});
