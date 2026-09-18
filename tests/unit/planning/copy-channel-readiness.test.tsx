import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  updateAudienceCopyAction: vi.fn(),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AudienceCopyPanel } from "@/components/planning/messages-panel";

/**
 * AudienceCopyPanel — Channel Readiness card slim (Copy-tab slim PR, 2026-09-18).
 *
 * Acceptance criteria:
 *   - At-a-glance counts (channels, overrides, stale) render when there
 *     are channels.
 *   - The per-channel list lives inside a <details> collapsed by
 *     default.
 *   - The verbose "Shared copy is the starting point…" note is gone.
 *   - The bottom "Publishing is where you choose…" note is gone.
 */
describe("AudienceCopyPanel — Channel Readiness card", () => {
  const baseChannels = [
    {
      id: "ch-1",
      socialChannelId: "social-1",
      platform: "instagram",
      accountName: "Acme IG",
      payload: null,
      sourceRevision: null,
      currentRevision: 1,
    },
    {
      id: "ch-2",
      socialChannelId: "social-2",
      platform: "facebook",
      accountName: "Acme FB",
      payload: { caption: "Override" },
      sourceRevision: 1,
      currentRevision: 5,
    },
  ];

  it("renders the at-a-glance counts when channels exist", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={baseChannels}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    // Two channels in the fixture; the second carries a stale override
    // (sourceRevision < currentRevision) so it counts toward `stale`
    // and *not* toward `overrides` (channelCopyStatus returns a single
    // status; `stale` is more urgent).
    expect(screen.getByTestId("copy-channel-readiness-summary")).toHaveTextContent("2");
    expect(screen.queryByTestId("copy-override-summary")).not.toBeInTheDocument();
    expect(screen.getByTestId("copy-stale-summary")).toBeInTheDocument();
  });

  it("renders the override (non-stale) count when an override diverges but is up to date", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={[
            {
              id: "ch-1",
              socialChannelId: "social-1",
              platform: "instagram",
              accountName: "Acme IG",
              payload: { caption: "Different" },
              // sourceRevision === currentRevision → not stale.
              sourceRevision: 7,
              currentRevision: 7,
            },
          ]}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("copy-override-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("copy-stale-summary")).not.toBeInTheDocument();
  });

  it("wraps the per-channel list in a collapsed <details> by default", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={baseChannels}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    const details = screen.getByTestId("copy-channel-list-details") as HTMLDetailsElement;
    expect(details).toBeInTheDocument();
    // Native <details> renders `open` reflecting collapsed state.
    expect(details.hasAttribute("open")).toBe(false);
    // The per-channel list lives inside the <details>.
    expect(details.querySelector('[data-testid="messages-per-channel-list"]')).toBeInTheDocument();
  });

  it("does NOT render the verbose 'Shared copy is the starting point…' note", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={baseChannels}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    expect(screen.queryByTestId("copy-version-explanation")).not.toBeInTheDocument();
    expect(screen.queryByText(/Shared copy is the starting point/i)).not.toBeInTheDocument();
  });

  it("does NOT render the bottom 'Publishing is where you choose…' note", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={baseChannels}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    expect(
      screen.queryByText(/Publishing is where you choose each channel language/i),
    ).not.toBeInTheDocument();
  });

  it("still renders the 'Review in Publishing' CTA", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={baseChannels}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole("link", { name: /Review in Publishing/i })).toHaveAttribute(
      "href",
      "/app/w/acme/planning/11111111-1111-4111-8111-111111111111/publish",
    );
  });
});
