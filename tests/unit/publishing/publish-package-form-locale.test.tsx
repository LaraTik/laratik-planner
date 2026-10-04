import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/[id]/publish/actions", () => ({
  markPublishingSetupReadyAction: vi.fn(),
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: vi.fn(),
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
import { recordPublicationAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import type { ReadinessReport } from "@/lib/publishing/readiness";

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
      hasPayload: false,
      requiredTotal: 4,
      requiredCompleted: 0,
      blockerCount: 0,
      recommendationCount: 0,
      issues: [],
    },
  ],
};

describe("PublishPackageForm localization", () => {
  it("renders Arabic publish labels and direction-aware alt text", () => {
    render(
      <LocaleProvider locale="ar">
        <PublishPackageForm
          workspaceId="33333333-3333-4333-8333-333333333333"
          workspaceSlug="food-game"
          workspaceTimezone="Europe/Berlin"
          contentItemId={contentItemId}
          itemFormat="static_post"
          channels={[
            {
              id: "44444444-4444-4444-8444-444444444444",
              socialChannelId,
              platform: "instagram",
              accountName: "Food Game",
              payload: null,
            },
          ]}
          deliveryVersions={[]}
          readiness={readiness}
          canSavePackage={true}
          canApproveFinalCopy={false}
          canConfirmReadiness={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("الوجهة والتعليق")).toBeInTheDocument();
    expect(screen.getByText("إضافة ملاحظة داخلية")).toBeInTheDocument();
    expect(
      screen.getByTestId("publish-channel-tab-22222222-2222-4222-8222-222222222222"),
    ).toHaveTextContent("Instagram");
    // The read-only channel/title/format Fields were replaced by one
    // meta row; format now renders there, once.
    expect(screen.getByTestId("publish-channel-meta")).toHaveTextContent("منشور ثابت");
    expect(screen.getByLabelText("النص البديل وإمكانية الوصول")).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("publish-save-draft")).toHaveTextContent("حفظ المسودة");
    // One state, one action. This channel has never been saved, so Save
    // is the primary action — offering "mark setup ready" for a package
    // that does not exist yet would be a lie the server rejects.
    expect(screen.getByTestId("publish-save-draft")).toBeInTheDocument();
    expect(screen.queryByTestId("publish-ready")).not.toBeInTheDocument();
  });

  it("offers a localized exclusion action for a pending channel", () => {
    vi.mocked(recordPublicationAction).mockResolvedValue({ ok: true });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <LocaleProvider locale="ar">
        <PublishPackageForm
          workspaceId="33333333-3333-4333-8333-333333333333"
          workspaceSlug="food-game"
          workspaceTimezone="Europe/Berlin"
          contentItemId={contentItemId}
          itemFormat="static_post"
          channels={[
            {
              id: "44444444-4444-4444-8444-444444444444",
              socialChannelId,
              platform: "instagram",
              accountName: "Food Game",
              payload: null,
              publicationStatus: "pending",
            },
          ]}
          deliveryVersions={[]}
          readiness={readiness}
          canSavePackage={false}
          canApproveFinalCopy={false}
          canConfirmReadiness={false}
          canExcludeChannel
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("publish-exclude-channel-button")).toHaveTextContent(
      "استبعاد من النشر",
    );

    fireEvent.click(screen.getByTestId("publish-exclude-channel-button"));
    return waitFor(() => {
      expect(recordPublicationAction).toHaveBeenCalledWith({
        workspaceSlug: "food-game",
        contentItemChannelId: "44444444-4444-4444-8444-444444444444",
        status: "skipped",
        note: "تم الاستبعاد من النشر",
      });
    }).finally(() => confirm.mockRestore());
  });
});
