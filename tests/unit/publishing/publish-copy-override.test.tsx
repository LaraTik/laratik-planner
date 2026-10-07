import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
import type { PlatformPayload, ReadinessReport } from "@/lib/publishing";
import { tFor } from "@/messages";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const socialChannelId = "22222222-2222-4222-8222-222222222222";
const channelId = "44444444-4444-4444-8444-444444444444";

function savedPayload(overrides: Partial<PlatformPayload> = {}): PlatformPayload {
  return {
    schemaVersion: 1,
    platform: "instagram",
    selectedDestinationProfile: { socialChannelId },
    caption: "Spring drop is here.",
    hashtags: ["spring"],
    firstComment: "",
    description: "",
    callToAction: null,
    utm: {},
    mentions: [],
    collaborators: [],
    location: "",
    contentLanguage: "en",
    disclosures: {
      paidPartnership: false,
      aiGenerated: false,
      syntheticMedia: false,
      rightsConfirmed: true,
    },
    approval: { finalCopyApproved: false, approvedByUserId: null, approvedAt: null },
    deliveryReferences: [],
    scheduleOverride: null,
    publicationMethod: "manual",
    ...overrides,
  } as unknown as PlatformPayload;
}

function readinessWith(revision: number): ReadinessReport {
  return {
    contentItemId,
    revision,
    blockers: 0,
    recommendations: 0,
    requiredTotal: 1,
    requiredCompleted: 1,
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
}

/**
 * `shared copy → channel inherits → optional channel override`.
 *
 * The same text appears in the Copy tab and again in the publish package,
 * and nothing on screen said which was which, so identical text read as a
 * duplication bug. These three states are the fix, and they also give
 * `copySourceRevision` a user-facing meaning.
 */
function renderCopySource({
  payload,
  copySourceRevision,
  readinessRevision = 1,
  audienceCaption = "Spring drop is here.",
}: {
  payload: PlatformPayload;
  copySourceRevision: number;
  readinessRevision?: number;
  audienceCaption?: string;
}) {
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
            id: channelId,
            socialChannelId,
            platform: "instagram",
            accountName: "Acme",
            payload,
            copySourceRevision,
          },
        ]}
        deliveryVersions={[]}
        readiness={readinessWith(readinessRevision)}
        audienceCopy={
          {
            source: {},
            translations: {},
            // `sharedCopyDiffers` compares every one of these keys, so
            // the shared fixture must carry them all for "inheriting" to
            // be a true statement.
            resolved: {
              caption: audienceCaption,
              description: "",
              firstComment: "",
              hashtags: ["spring"],
              callToAction: null,
              location: "",
            },
            resolvedByLocale: {},
          } as never
        }
        canSavePackage
        canApproveFinalCopy={false}
        canConfirmReadiness={false}
        t={tFor("en")}
      />
    </LocaleProvider>,
  );
}

describe("publish copy source / override state", () => {
  it("says the channel is using shared audience copy when it matches", () => {
    renderCopySource({ payload: savedPayload(), copySourceRevision: 1 });
    const source = screen.getByTestId("publish-copy-source");
    expect(source).toHaveTextContent("Using shared audience copy");
    expect(screen.queryByTestId("publish-copy-reset")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-copy-refresh")).not.toBeInTheDocument();
  });

  it("labels a divergent caption as a channel override and offers a reset", () => {
    renderCopySource({
      payload: savedPayload({ caption: "Only for this channel" } as Partial<PlatformPayload>),
      copySourceRevision: 1,
    });
    const source = screen.getByTestId("publish-copy-source");
    expect(source).toHaveTextContent("Channel override");
    expect(screen.getByTestId("publish-copy-reset")).toBeInTheDocument();
    expect(screen.queryByTestId("publish-copy-refresh")).not.toBeInTheDocument();
  });

  it("flags the override as stale when shared copy has since been revised", () => {
    // The channel saved at revision 1; the shared copy is now at 5.
    renderCopySource({
      payload: savedPayload({ caption: "Only for this channel" } as Partial<PlatformPayload>),
      copySourceRevision: 1,
      readinessRevision: 5,
    });
    const source = screen.getByTestId("publish-copy-source");
    expect(source).toHaveTextContent("Shared copy changed since this channel last saved");
    expect(screen.getByTestId("publish-copy-refresh")).toBeInTheDocument();
    expect(screen.queryByTestId("publish-copy-reset")).not.toBeInTheDocument();
  });

  it("restores the shared copy on reset", async () => {
    renderCopySource({
      payload: savedPayload({ caption: "Only for this channel" } as Partial<PlatformPayload>),
      copySourceRevision: 1,
    });
    fireEvent.click(screen.getByTestId("publish-copy-reset"));
    await waitFor(() => {
      expect(screen.getByTestId("publish-caption")).toHaveValue("Spring drop is here.");
    });
  });

  it("shows no source state for a channel with no saved package yet", () => {
    render(
      <LocaleProvider locale="en">
        <PublishPackageForm
          workspaceId="33333333-3333-4333-8333-333333333333"
          workspaceSlug="acme"
          agencySlug="acme"
          workspaceTimezone="Europe/Berlin"
          contentItemId={contentItemId}
          itemFormat="static_post"
          channels={[
            {
              id: channelId,
              socialChannelId,
              platform: "instagram",
              accountName: "Acme",
              payload: null,
            },
          ]}
          deliveryVersions={[]}
          readiness={readinessWith(1)}
          canSavePackage
          canApproveFinalCopy={false}
          canConfirmReadiness={false}
          t={tFor("en")}
        />
      </LocaleProvider>,
    );
    // "Using shared audience copy" would be a false claim before a save.
    expect(screen.queryByTestId("publish-copy-source")).not.toBeInTheDocument();
  });
});
