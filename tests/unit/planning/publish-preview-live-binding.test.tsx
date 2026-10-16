import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/actions", () => ({
  markPublishingSetupReadyAction: vi.fn(),
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: vi.fn(async () => ({ ok: true as const, payload: {} })),
  savePublishPackageBatchAction: vi.fn(),
  setFinalCopyApprovalAction: vi.fn(),
}));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions", () => ({
  recordPublicationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublishPackageForm } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/publish-package-form";
import type { ReadinessReport } from "@/lib/publishing/readiness";
import { tFor } from "@/messages";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const igChannelId = "44444444-4444-4444-8444-444444444444";
const igSocialChannelId = "22222222-2222-4222-8222-222222222222";
const liSocialChannelId = "55555555-5555-4555-8555-555555555555";

const readiness: ReadinessReport = {
  contentItemId,
  revision: 1,
  blockers: 0,
  recommendations: 0,
  requiredTotal: 0,
  requiredCompleted: 0,
  canPublish: false,
  issues: [],
  channels: [
    {
      socialChannelId: igSocialChannelId,
      platform: "instagram",
      hasPayload: false,
      requiredTotal: 0,
      requiredCompleted: 0,
      blockerCount: 0,
      recommendationCount: 0,
      issues: [],
    },
    {
      socialChannelId: liSocialChannelId,
      platform: "linkedin",
      hasPayload: false,
      requiredTotal: 0,
      requiredCompleted: 0,
      blockerCount: 0,
      recommendationCount: 0,
      issues: [],
    },
  ],
};

/**
 * The Publish tab's Platform preview must be bound to the form's LIVE
 * edit state.
 *
 * `previewData` arrives from the server as a snapshot of the *persisted*
 * `platformPayload` rows. The form, however, edits `drafts` in client
 * state. If the preview keeps reading the snapshot, an operator types a
 * new caption in the caption field, the character counter moves, the form
 * is dirty — and the preview still shows the old caption. The preview is
 * the surface that is supposed to answer "what will this actually post?",
 * so a stale one is worse than none: it is confidently wrong.
 */
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // Switching channels while dirty is guarded by `window.confirm`
  // (drafts are deliberately never auto-saved). jsdom does not implement
  // it, so without this the switch silently no-ops and the assertions
  // below would pass/fail for the wrong reason.
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});
function renderForm(overrides: { payload?: Record<string, unknown> | null } = {}) {
  return render(
    <LocaleProvider locale="en">
      <PublishPackageForm
        workspaceId="33333333-3333-4333-8333-333333333333"
        workspaceSlug="acme"
        agencySlug="acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId={contentItemId}
        itemFormat="static_post"
        contentLocale="en"
        channels={[
          {
            id: igChannelId,
            socialChannelId: igSocialChannelId,
            platform: "instagram",
            accountName: "Acme",
            payload: null,
          },
          {
            id: "66666666-6666-4666-8666-666666666666",
            socialChannelId: liSocialChannelId,
            platform: "linkedin",
            accountName: "Acme Biz",
            payload: null,
          },
        ]}
        deliveryVersions={[]}
        readiness={readiness}
        canSavePackage
        canApproveFinalCopy={false}
        canConfirmReadiness={false}
        t={tFor("en")}
        previewData={{
          channels: [
            {
              id: igChannelId,
              socialChannelId: igSocialChannelId,
              platform: "instagram",
              accountName: "Acme",
              payload: (overrides.payload ?? null) as never,
            },
            {
              id: "66666666-6666-4666-8666-666666666666",
              socialChannelId: liSocialChannelId,
              platform: "linkedin",
              accountName: "Acme Biz",
              payload: null,
            },
          ],
          sharedCaption: "Shared fallback copy.",
          thumbnailUrl: "https://x.com/hero.png",
          thumbnailWidth: 1080,
          thumbnailHeight: 1350,
        }}
      />
    </LocaleProvider>,
  );
}

describe("Publish preview — live edit binding", () => {
  /**
   * The form intentionally mounts the preview twice — once in the sticky
   * `xl:block` rail and once inside the mobile `<details>` drawer — so
   * every assertion is scoped to the desktop panel. Both instances read
   * the same state and must agree.
   */
  const preview = async () => within(await screen.findByTestId("publish-preview-panel"));

  it("mirrors an unsaved caption edit into the preview", async () => {
    renderForm();
    const panel = await preview();

    fireEvent.change(screen.getByTestId("publish-caption"), {
      target: { value: "Brand new unsaved caption" },
    });

    expect(await panel.findByTestId("platform-preview-caption-text")).toHaveTextContent(
      "Brand new unsaved caption",
    );
  });

  it("mirrors an unsaved hashtag edit into the preview", async () => {
    renderForm();
    const panel = await preview();

    const hashtagInput = screen.getByTestId("publish-hashtags-input");
    fireEvent.change(hashtagInput, { target: { value: "typed-later" } });
    fireEvent.keyDown(hashtagInput, { key: "Enter" });

    expect(await panel.findByTestId("platform-preview-hashtags")).toHaveTextContent("typed-later");
  });

  it("follows the channel the operator is actually editing", async () => {
    renderForm();
    const panel = await preview();

    fireEvent.change(screen.getByTestId("publish-caption"), {
      target: { value: "Instagram only copy" },
    });
    expect(await panel.findByTestId("platform-preview-caption-text")).toHaveTextContent(
      "Instagram only copy",
    );

    // Switch channel: the preview must follow, and the caption must NOT
    // bleed across channels.
    fireEvent.click(screen.getByTestId(`publish-channel-tab-${liSocialChannelId}`));

    const caption = await panel.findByTestId("platform-preview-caption-text");
    expect(caption).not.toHaveTextContent("Instagram only copy");
    expect(caption).toHaveTextContent("Shared fallback copy.");
    // …and it must re-bind to the newly selected channel's platform.
    expect(panel.getByTestId("platform-preview")).toHaveAttribute("data-platform", "linkedin");
  });
});
