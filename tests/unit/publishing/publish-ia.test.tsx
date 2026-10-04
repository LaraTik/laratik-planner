import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/[id]/publish/actions", () => ({
  markPublishingSetupReadyAction: vi.fn(),
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: vi.fn(async () => ({ ok: true as const, payload: {} })),
  savePublishPackageBatchAction: vi.fn(),
  setFinalCopyApprovalAction: vi.fn(),
}));

vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  recordPublicationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublishPackageForm } from "@/app/(app)/app/w/[slug]/planning/[id]/publish/publish-package-form";
import type { ReadinessReport } from "@/lib/publishing/readiness";
import { tFor } from "@/messages";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const socialChannelId = "22222222-2222-4222-8222-222222222222";

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
      socialChannelId,
      platform: "instagram",
      hasPayload: true,
      requiredTotal: 1,
      requiredCompleted: 1,
      blockerCount: 0,
      recommendationCount: 0,
      issues: [],
    },
  ],
};

function renderForm(canSavePackage: boolean) {
  return render(
    <LocaleProvider locale="en">
      <PublishPackageForm
        workspaceId="33333333-3333-4333-8333-333333333333"
        workspaceSlug="acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId={contentItemId}
        itemFormat="static_post"
        contentLocale="en"
        channels={[
          {
            id: "44444444-4444-4444-8444-444444444444",
            socialChannelId,
            platform: "instagram",
            accountName: "Acme",
            payload: null,
          },
        ]}
        deliveryVersions={[]}
        readiness={readiness}
        canSavePackage={canSavePackage}
        canApproveFinalCopy={false}
        canConfirmReadiness={false}
        t={tFor("en")}
      />
    </LocaleProvider>,
  );
}

/**
 * Locks in the information-architecture deletions from PR3. Each of these
 * was a verbatim duplicate of information already on screen, and each
 * removal is a regression if it comes back.
 */
describe("publish form information architecture", () => {
  it("states channel identity once, in a meta row", async () => {
    renderForm(true);
    const meta = await screen.findByTestId("publish-channel-meta");
    expect(meta).toHaveTextContent("Acme");
    expect(meta).toHaveTextContent("Instagram");
    expect(meta).toHaveTextContent("Static post");
  });

  it("does not re-render the channel name, item title, or format as form fields", async () => {
    renderForm(true);
    await screen.findByTestId("publish-save-draft");
    // These duplicated the active channel tab and PlanningHeader at a
    // cost of three labels and three 44px controls each.
    expect(screen.queryByTestId("publish-channel-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-item-title")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-item-format")).not.toBeInTheDocument();
  });

  it("does not render the preview echo of the caption and hashtags", async () => {
    renderForm(true);
    await screen.findByTestId("publish-save-draft");
    // `PreviewPane` rendered caption + hashtags — the two fields directly
    // above it — with no media and no platform chrome.
    expect(screen.queryByTestId("publish-preview-pane")).not.toBeInTheDocument();
    // The real inputs are still there exactly once each.
    expect(screen.getAllByTestId("publish-caption")).toHaveLength(1);
    expect(screen.getAllByTestId("publish-hashtags")).toHaveLength(1);
  });

  it("does not render the duplicated full-width readiness checklist", async () => {
    renderForm(true);
    await screen.findByTestId("publish-save-draft");
    // The command center is the single status surface now and hosts the
    // blocker list as its expandable body.
    expect(screen.queryByTestId("publish-readiness-checklist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-readiness-fix-missing_caption")).not.toBeInTheDocument();
  });

  it("keeps the real platform preview absent rather than restoring a fake one", async () => {
    renderForm(true);
    await screen.findByTestId("publish-save-draft");
    // PR3B deliberately did NOT add PlatformPreviewSwitcher to the form:
    // it takes a storage-object media id and the form has no storage
    // context, so a fourth prop plus a loader query is PR4 work. What
    // matters here is that the text echo is not substituted for it.
    expect(screen.queryByTestId("publish-preview-pane")).not.toBeInTheDocument();
  });

  it("still exposes the save actions and the anchor targets blockers link to", async () => {
    renderForm(true);
    expect(await screen.findByTestId("publish-save-draft")).toBeEnabled();
    // The blocker map routes these three here, so the anchors must exist
    // for the deep links to land on something.
    expect(screen.getByTestId("publish-caption")).toBeInTheDocument();
    expect(screen.getByTestId("publish-alt-text")).toBeInTheDocument();
    expect(document.querySelector("#publish-disclosures")).not.toBeNull();
    expect(document.querySelector("#publish-approval")).not.toBeNull();
  });

  it("renders the read-only summary rather than the editor without write authority", async () => {
    renderForm(false);
    expect(await screen.findByTestId("publish-read-only-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("publish-caption")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-alt-text")).not.toBeInTheDocument();
  });
});
