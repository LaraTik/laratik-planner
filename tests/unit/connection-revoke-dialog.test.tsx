import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionActions } from "@/app/(app)/app/w/[slug]/channels/connection-actions";
import { testChannelConnectionAction } from "@/app/(app)/app/w/[slug]/channels/actions";

/**
 * UX-03 (GAP-FULL-REVIEW-2026-08-25) — the connection revoke
 * confirmation used to be hand-rolled: a div with role="dialog"
 * and a hand-managed focus trap, with no Escape-to-close or
 * backdrop dismissal. The page now uses the shared Radix-based
 * Dialog primitive, which gives us all of that for free.
 *
 * M4.1 follow-up — the same component also renders the row-level
 * "Re-test" button (formerly a stub that just set a flash flag).
 * The button is now wired to `testChannelConnectionAction` and the
 * success / error feedback is asserted here so a regression in the
 * wire-up is caught at the unit level without a connected channel
 * in the dev seed.
 *
 * These tests pin the regression: the dialog must surface the
 * shared X button (provided by the primitive) and Escape must
 * close it without us writing any extra handler. The Re-test
 * surface must:
 *
 *   - call the server action with (slug, channelId) on click
 *   - render a "Validated just now" chip on `{ success: true }`
 *   - render an aria-live error on `{ error: ... }`
 *   - set `aria-busy` while the transition is in flight
 */

vi.mock("@/app/(app)/app/w/[slug]/channels/actions", () => ({
  disconnectChannelAction: vi.fn(async () => ({})),
  revokeConnectionAction: vi.fn(async () => ({})),
  testChannelConnectionAction: vi.fn(async () => ({})),
}));

const channel = {
  id: "11111111-1111-4111-8111-111111111111",
  accountName: "@brand-main",
  platform: "instagram" as const,
  socialConnectionId: "22222222-2222-4222-8222-222222222222",
  connectionStatus: "connected" as const,
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

describe("ConnectionActions Re-test", () => {
  it("renders a Re-test button for a connected channel", () => {
    render(
      <ConnectionActions
        slug="acme"
        channel={channel}
        affectedChannels={[channel, ...otherChannels]}
      />,
    );
    const button = screen.getByTestId("retest-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent(/Re-test/);
  });

  it("calls the action with (slug, channelId) on click", async () => {
    const user = userEvent.setup();
    const action = vi.mocked(testChannelConnectionAction);
    action.mockResolvedValueOnce({
      success: true,
      lastSyncedAt: new Date().toISOString(),
    });
    render(<ConnectionActions slug="acme" channel={channel} affectedChannels={[]} />);
    await user.click(screen.getByTestId("retest-button"));
    await waitFor(() => {
      expect(action).toHaveBeenCalledWith("acme", channel.id);
    });
  });

  it("surfaces a 'Validated just now' chip on success", async () => {
    const user = userEvent.setup();
    const action = vi.mocked(testChannelConnectionAction);
    action.mockResolvedValueOnce({
      success: true,
      lastSyncedAt: new Date().toISOString(),
    });
    render(<ConnectionActions slug="acme" channel={channel} affectedChannels={[]} />);
    await user.click(screen.getByTestId("retest-button"));
    const success = await screen.findByTestId("retest-success");
    expect(success).toHaveTextContent(/Validated/);
  });

  it("surfaces the server error in an aria-live alert on failure", async () => {
    const user = userEvent.setup();
    const action = vi.mocked(testChannelConnectionAction);
    action.mockResolvedValueOnce({
      error: "Meta rate-limited this account",
      errorCode: "rate_limited",
    });
    render(<ConnectionActions slug="acme" channel={channel} affectedChannels={[]} />);
    await user.click(screen.getByTestId("retest-button"));
    const error = await screen.findByTestId("retest-error");
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveTextContent(/Meta rate-limited/);
  });

  it("disables the button while the action is in flight", async () => {
    const user = userEvent.setup();
    const action = vi.mocked(testChannelConnectionAction);
    type Result = Awaited<ReturnType<typeof testChannelConnectionAction>>;
    let resolveAction: (v: Result) => void = () => {};
    action.mockReturnValueOnce(
      new Promise<Result>((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(<ConnectionActions slug="acme" channel={channel} affectedChannels={[]} />);
    const button = screen.getByTestId("retest-button");
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    resolveAction({ success: true, lastSyncedAt: new Date().toISOString() } as Result);
  });
});
