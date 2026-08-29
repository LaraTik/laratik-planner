import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  SocialSyncDiagnostics,
  classifyChannel,
  formatRelative,
} from "@/app/(app)/app/w/[slug]/analytics/social/social-sync-diagnostics";

/**
 * M5 — sync diagnostics bento tests.
 *
 * The component is a pure render function over the channels the
 * page already loaded. We exercise:
 *
 *   1. Quiet on the happy path (returns null when every channel
 *      is classified `synced`).
 *   2. Three-state counts render correctly when there are degraded
 *      or stalled channels.
 *   3. Oldest-unsynced + next-attempt info cells render.
 *   4. The "Re-test on channels page" CTA appears only when at
 *      least one channel is degraded or stalled.
 *   5. aria-live="polite" on the root for screen reader updates.
 *   6. `classifyChannel` edge cases (needs_reauth, error code,
 *      provider-error-only, never-synced, >25h stale).
 *   7. `formatRelative` minutes/hours/days boundaries.
 */

const NOW = new Date("2026-08-29T09:30:00Z");

function channel(overrides: Partial<Parameters<typeof SocialSyncDiagnostics>[0]["channels"][number]>) {
  return {
    id: "ch_test",
    accountName: "Test Account",
    platform: "instagram" as const,
    connectionStatus: "connected" as const,
    lastSyncedAt: NOW,
    lastSyncErrorCode: null,
    latestProviderErrorCode: null,
    ...overrides,
  };
}

describe("SocialSyncDiagnostics", () => {
  it("renders nothing when every channel is healthy", () => {
    const { container } = render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[channel({ id: "a" }), channel({ id: "b" })]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the bento when at least one channel is degraded", () => {
    render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[
          channel({ id: "a" }),
          channel({ id: "b", lastSyncErrorCode: "rate_limited" }),
        ]}
      />,
    );
    const root = screen.getByTestId("social-sync-diagnostics");
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("aria-live", "polite");
    expect(root).toHaveAttribute("aria-label", "Social sync diagnostics");

    const counts = within(root).getByTestId("social-sync-diagnostics-counts");
    expect(within(counts).getByTestId("social-sync-diagnostics-cell-synced")).toHaveTextContent(
      "1",
    );
    expect(within(counts).getByTestId("social-sync-diagnostics-cell-degraded")).toHaveTextContent(
      "1",
    );
    expect(within(counts).getByTestId("social-sync-diagnostics-cell-stalled")).toHaveTextContent(
      "0",
    );
  });

  it("classifies a channel with needs_reauth as stalled", () => {
    render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[
          channel({ id: "a", connectionStatus: "needs_reauth", lastSyncedAt: null }),
        ]}
      />,
    );
    const stalled = screen.getByTestId("social-sync-diagnostics-cell-stalled");
    expect(stalled).toHaveTextContent("1");
  });

  it("classifies a never-synced channel as stalled", () => {
    render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[channel({ id: "a", lastSyncedAt: null })]}
      />,
    );
    const stalled = screen.getByTestId("social-sync-diagnostics-cell-stalled");
    expect(stalled).toHaveTextContent("1");
  });

  it("classifies a >25h stale channel as stalled", () => {
    const dayAgo = new Date(NOW.getTime() - 26 * 60 * 60 * 1000);
    render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[channel({ id: "a", lastSyncedAt: dayAgo })]}
      />,
    );
    const stalled = screen.getByTestId("social-sync-diagnostics-cell-stalled");
    expect(stalled).toHaveTextContent("1");
  });

  it("classifies a provider-error-only row as degraded (not stalled)", () => {
    render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[
          channel({ id: "a", lastSyncedAt: NOW, latestProviderErrorCode: "permission_denied" }),
        ]}
      />,
    );
    expect(screen.getByTestId("social-sync-diagnostics-cell-degraded")).toHaveTextContent("1");
    expect(screen.getByTestId("social-sync-diagnostics-cell-stalled")).toHaveTextContent("0");
  });

  it("shows the Re-test CTA when at least one channel is degraded or stalled", () => {
    render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[channel({ id: "a", lastSyncedAt: null })]}
      />,
    );
    const cta = screen.getByTestId("social-sync-diagnostics-retry");
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/app/w/acme/channels");
  });

  it("does not show the Re-test CTA when only synced channels exist (it returns null entirely)", () => {
    const { queryByTestId } = render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[channel({ id: "a" })]}
      />,
    );
    expect(queryByTestId("social-sync-diagnostics-retry")).toBeNull();
  });

  it("renders oldest-unsynced and next-attempt info cells with the next 03:15 UTC slot", () => {
    render(
      <SocialSyncDiagnostics
        slug="acme"
        now={NOW}
        channels={[
          channel({ id: "a", accountName: "Acme Main", lastSyncedAt: null }),
        ]}
      />,
    );
    const oldest = screen.getByTestId("social-sync-diagnostics-oldest");
    expect(within(oldest).getByText("Acme Main · never")).toBeInTheDocument();

    const next = screen.getByTestId("social-sync-diagnostics-next");
    // NOW is 09:30 UTC; next 03:15 UTC is tomorrow 2026-08-30 03:15 UTC
    // (in ~17h 45m). The component rounds to "18h ago" in the future-
    // pointing formatRelative... actually formatRelative clamps to
    // "in the future" since the diff is negative. We just assert the
    // absolute slot text is present.
    expect(within(next).getByText(/03:15/)).toBeInTheDocument();
  });
});

describe("classifyChannel", () => {
  it("returns 'synced' for a fresh successful sync", () => {
    expect(classifyChannel(channel({ lastSyncedAt: NOW, lastSyncErrorCode: null }), NOW)).toBe(
      "synced",
    );
  });
  it("returns 'degraded' for lastSyncErrorCode", () => {
    expect(
      classifyChannel(channel({ lastSyncErrorCode: "rate_limited", lastSyncedAt: NOW }), NOW),
    ).toBe("degraded");
  });
  it("returns 'degraded' for latestProviderErrorCode", () => {
    expect(
      classifyChannel(
        channel({ latestProviderErrorCode: "permission_denied", lastSyncedAt: NOW }),
        NOW,
      ),
    ).toBe("degraded");
  });
  it("returns 'stalled' for null lastSyncedAt", () => {
    expect(classifyChannel(channel({ lastSyncedAt: null }), NOW)).toBe("stalled");
  });
  it("returns 'stalled' for >25h old lastSyncedAt", () => {
    const old = new Date(NOW.getTime() - 26 * 60 * 60 * 1000);
    expect(classifyChannel(channel({ lastSyncedAt: old }), NOW)).toBe("stalled");
  });
  it("returns 'stalled' for needs_reauth regardless of lastSyncedAt", () => {
    expect(
      classifyChannel(
        channel({ connectionStatus: "needs_reauth", lastSyncedAt: NOW }),
        NOW,
      ),
    ).toBe("stalled");
  });
  it("returns 'synced' for a 24h-old lastSyncedAt (under threshold)", () => {
    const dayOld = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    expect(classifyChannel(channel({ lastSyncedAt: dayOld }), NOW)).toBe("synced");
  });
});

describe("formatRelative", () => {
  it("returns 'just now' for <1m", () => {
    expect(formatRelative(new Date(NOW.getTime() - 30_000), NOW)).toBe("just now");
  });
  it("returns minutes for <1h", () => {
    expect(formatRelative(new Date(NOW.getTime() - 15 * 60_000), NOW)).toBe("15m ago");
  });
  it("returns hours for <1d", () => {
    expect(formatRelative(new Date(NOW.getTime() - 5 * 60 * 60_000), NOW)).toBe("5h ago");
  });
  it("returns days for >=1d", () => {
    expect(formatRelative(new Date(NOW.getTime() - 2 * 24 * 60 * 60_000), NOW)).toBe("2d ago");
  });
  it("returns 'in the future' for negative diff", () => {
    expect(formatRelative(new Date(NOW.getTime() + 60_000), NOW)).toBe("in the future");
  });
});
