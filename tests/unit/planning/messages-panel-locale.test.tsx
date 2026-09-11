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
  });
});
