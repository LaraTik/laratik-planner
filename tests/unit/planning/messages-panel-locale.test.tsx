import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  updateAudienceCopyAction: vi.fn(),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AudienceCopyPanel } from "@/components/planning/messages-panel";

describe("AudienceCopyPanel localization", () => {
  it("localizes channel platform labels in Arabic", () => {
    render(
      <LocaleProvider locale="ar">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "نص" }}
          contentLocale="ar"
          channels={[
            {
              id: "ch-1",
              socialChannelId: "social-1",
              platform: "instagram_reel",
              accountName: "Acme Reels",
              payload: null,
            },
          ]}
          canEdit={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("messages-per-channel-row-social-1")).toHaveTextContent(
      "ريل Instagram",
    );
    expect(screen.getByTestId("messages-per-channel-row-social-1")).not.toHaveTextContent(
      "instagram_reel",
    );
    // The verbose versionExplanation note was removed in the Copy-tab
    // slim. The per-channel list is now wrapped in <details>; the
    // summary uses the new "perChannelSummary" key.
    expect(screen.queryByTestId("copy-version-explanation")).not.toBeInTheDocument();
    expect(screen.getByTestId("copy-channel-list-details")).toBeInTheDocument();
    // The <summary> renders the localized "Per-channel override state"
    // string with the channel count.
    expect(screen.getByText(/حالة النسخ لكل قناة/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مراجعة النشر" })).toHaveAttribute(
      "href",
      "/app/w/acme/planning/11111111-1111-4111-8111-111111111111/publish",
    );
  });

  it("gives channel managers a direct Details recovery action", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Caption" }}
          contentLocale="en"
          channels={[]}
          canEdit
          canManageChannels
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("copy-no-channels")).toHaveTextContent(
      "Add them from Details before configuring publishing.",
    );
    expect(screen.getByRole("link", { name: "Open Details" })).toHaveAttribute("href", "#overview");
  });

  it("explains ownership without exposing an unsafe action to restricted users", () => {
    render(
      <LocaleProvider locale="ar">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "نص" }}
          contentLocale="ar"
          channels={[]}
          canEdit={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("copy-no-channels")).toHaveTextContent("مدير مساحة العمل");
    expect(screen.queryByRole("link", { name: "فتح التفاصيل" })).not.toBeInTheDocument();
  });
});
