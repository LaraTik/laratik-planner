import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AudienceCopyPanel } from "@/components/planning/messages-panel";

const saveAction = async () => ({});

describe("AudienceCopyPanel localization", () => {
  it("submits copy through the route-supplied save action", async () => {
    const routeSaveAction = vi.fn(async () => ({}));

    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          saveAction={routeSaveAction}
          agencySlug="acme"
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Caption" }}
          contentLocale="en"
          channels={[]}
          canEdit
        />
      </LocaleProvider>,
    );

    fireEvent.submit(screen.getByTestId("messages-form"));

    await waitFor(() => expect(routeSaveAction).toHaveBeenCalledOnce());
  });

  it("localizes channel platform labels in Arabic", () => {
    render(
      <LocaleProvider locale="ar">
        <AudienceCopyPanel
          saveAction={saveAction}
          agencySlug="acme"
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
      "/app/a/acme/w/acme/planning/11111111-1111-4111-8111-111111111111/publish",
    );
  });

  it("gives channel managers a direct Details recovery action", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          saveAction={saveAction}
          agencySlug="acme"
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
          saveAction={saveAction}
          agencySlug="acme"
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
