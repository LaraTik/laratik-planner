import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  updateAudienceCopyAction: vi.fn(),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AudienceCopyPanel } from "@/components/planning/messages-panel";

/**
 * AudienceCopyPanel — Copy-tab header slim (Copy-tab slim PR, 2026-09-18).
 *
 * Acceptance criteria:
 *   - The header carries a short subtitle via the new
 *     `contentDetail.copy.subtitle` key.
 *   - The old long "One shared source…" CardDescription is gone.
 *   - The redundant "Source copy" sub-header card is gone.
 *   - The source-language pill is preserved (real signal).
 */
describe("AudienceCopyPanel — Copy tab header", () => {
  it("renders the short subtitle instead of the long description", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={[]}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("The words your audience will read.")).toBeInTheDocument();
    expect(
      screen.queryByText(/One shared source for the words your audience will read/i),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the old 'Source copy' sub-header card", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={[]}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    expect(screen.queryByTestId("copy-source-section-header")).not.toBeInTheDocument();
  });

  it("keeps the source-language pill on the right of the header", () => {
    render(
      <LocaleProvider locale="en">
        <AudienceCopyPanel
          workspaceSlug="acme"
          contentItemId="11111111-1111-4111-8111-111111111111"
          format="static_post"
          initialPayload={{ schemaVersion: 1, caption: "Hi" }}
          contentLocale="en"
          channels={[]}
          canEdit={false}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText(/Source language:\s*EN/i)).toBeInTheDocument();
  });

  it("renders the localized subtitle in Arabic", () => {
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
    expect(screen.getByText("الكلمات التي يقرأها جمهورك.")).toBeInTheDocument();
  });
});
